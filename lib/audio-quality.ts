/**
 * Fast, dependency-free MP3 plausibility analysis.
 *
 * IMPORTANT: this is a *duration/size sanity check, NOT a loudness/silence check.*
 * It reliably catches empty, broken, extremely short, or suspiciously tiny MP3s
 * (the common Google-TTS failure for short words), but it will NOT flag a
 * normal-length file that happens to be pure/near silence — that would require PCM
 * decode + RMS, which is intentionally out of scope here.
 *
 * `analyzeMp3` walks MPEG audio frame headers and sums each frame's duration, so it
 * works for both CBR and VBR. It handles a leading ID3v2 tag, a trailing ID3v1 tag,
 * a Xing/Info VBR header frame, MPEG 1/2/2.5, all layers, mono/stereo, and padding,
 * and resyncs past false 0xFF bytes in the payload.
 */

export type Mp3Analysis = { durationMs: number; frameCount: number };

export type ClipAssessment = { plausible: boolean; reason?: string };

// Minimum raw byte length for any non-empty clip to be considered plausible. A real
// short-word MP3 is comfortably above this; truncated/near-empty responses fall
// below it. Fixed constant (not env) — see plan.
const MIN_BYTES = 400;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Absolute floor + per-visible-character floor. Tunable so we can dial sensitivity
// without a redeploy.
function getMinClipMs(): number {
  return envInt("AUDIO_MIN_CLIP_MS", 300);
}
function getMsPerChar(): number {
  return envInt("AUDIO_MS_PER_CHAR", 55);
}

// MPEG version ID (bits) → key. 0b00 = 2.5, 0b10 = 2, 0b11 = 1 (0b01 reserved).
const V25 = "2.5";
const V2 = "2";
const V1 = "1";

const SAMPLE_RATES: Record<string, number[]> = {
  [V1]: [44100, 48000, 32000],
  [V2]: [22050, 24000, 16000],
  [V25]: [11025, 12000, 8000],
};

// Bitrate tables in kbps, indexed by the 4-bit bitrate index (0 = free, 15 = bad).
const BITRATES_V1_L1 = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448];
const BITRATES_V1_L2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384];
const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L1 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256];
const BITRATES_V2_L23 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

function getBitrateTable(version: string, layer: number): number[] | null {
  if (version === V1) {
    if (layer === 1) return BITRATES_V1_L1;
    if (layer === 2) return BITRATES_V1_L2;
    if (layer === 3) return BITRATES_V1_L3;
    return null;
  }
  // MPEG 2 / 2.5 share tables.
  if (layer === 1) return BITRATES_V2_L1;
  if (layer === 2 || layer === 3) return BITRATES_V2_L23;
  return null;
}

function getSamplesPerFrame(version: string, layer: number): number {
  if (layer === 1) return 384;
  if (layer === 2) return 1152;
  // Layer 3: 1152 for MPEG1, 576 for MPEG2/2.5.
  return version === V1 ? 1152 : 576;
}

/** Bytes to skip for a leading ID3v2 tag, or 0 if none. */
function id3v2Size(buf: Uint8Array): number {
  if (buf.length < 10) return 0;
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0; // "ID3"
  const hasFooter = (buf[5] & 0x10) !== 0;
  // 28-bit syncsafe integer.
  const size =
    (buf[6] & 0x7f) * 0x200000 +
    (buf[7] & 0x7f) * 0x4000 +
    (buf[8] & 0x7f) * 0x80 +
    (buf[9] & 0x7f);
  return 10 + size + (hasFooter ? 10 : 0);
}

type FrameHeader = {
  frameLength: number;
  samplesPerFrame: number;
  sampleRate: number;
};

/** Parse a 4-byte frame header at `offset`, or null if it isn't a valid frame. */
function parseFrameHeader(buf: Uint8Array, offset: number): FrameHeader | null {
  if (offset + 4 > buf.length) return null;
  const b1 = buf[offset];
  const b2 = buf[offset + 1];
  const b3 = buf[offset + 2];
  // Frame sync: 11 set bits.
  if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) return null;

  const versionBits = (b2 & 0x18) >> 3;
  if (versionBits === 0b01) return null; // reserved
  const version = versionBits === 0b00 ? V25 : versionBits === 0b10 ? V2 : V1;

  const layerBits = (b2 & 0x06) >> 1;
  if (layerBits === 0b00) return null; // reserved
  const layer = layerBits === 0b11 ? 1 : layerBits === 0b10 ? 2 : 3;

  const bitrateIndex = (b3 & 0xf0) >> 4;
  if (bitrateIndex === 0 || bitrateIndex === 15) return null; // free/bad — can't size
  const sampleRateIndex = (b3 & 0x0c) >> 2;
  if (sampleRateIndex === 3) return null; // reserved
  const padding = (b3 & 0x02) >> 1;

  const bitrateTable = getBitrateTable(version, layer);
  if (!bitrateTable) return null;
  const bitrate = bitrateTable[bitrateIndex] * 1000; // bps
  const sampleRate = SAMPLE_RATES[version][sampleRateIndex];
  if (!bitrate || !sampleRate) return null;

  const samplesPerFrame = getSamplesPerFrame(version, layer);

  let frameLength: number;
  if (layer === 1) {
    frameLength = Math.floor((12 * bitrate) / sampleRate + padding) * 4;
  } else {
    frameLength = Math.floor((samplesPerFrame / 8) * (bitrate / sampleRate)) + padding;
  }
  if (frameLength < 4) return null;

  return { frameLength, samplesPerFrame, sampleRate };
}

export function analyzeMp3(input: Buffer | Uint8Array | ArrayBuffer): Mp3Analysis {
  // Buffer is a Uint8Array subclass, so anything that isn't an ArrayBuffer is
  // already a byte-view we can read directly.
  const buf = input instanceof ArrayBuffer ? new Uint8Array(input) : input;

  let offset = id3v2Size(buf);
  let durationMs = 0;
  let frameCount = 0;

  while (offset + 4 <= buf.length) {
    const header = parseFrameHeader(buf, offset);
    if (!header) {
      // Not a valid frame here — could be a false 0xFF or junk. Resync 1 byte.
      offset += 1;
      continue;
    }
    if (offset + header.frameLength > buf.length) {
      // Header is valid but the frame body is truncated (cut mid-stream): a
      // partial final frame doesn't play, so stop rather than count it.
      break;
    }
    frameCount += 1;
    durationMs += (header.samplesPerFrame / header.sampleRate) * 1000;
    offset += header.frameLength;
  }

  return { durationMs: Math.round(durationMs), frameCount };
}

/** Count characters that a TTS engine would actually voice (letters/digits). */
function countVisibleChars(text: string): number {
  // Strip whitespace and common punctuation; keep letters/digits across scripts.
  const stripped = text.replace(/[\s\p{P}\p{S}]+/gu, "");
  return Array.from(stripped).length;
}

/**
 * Verdict on whether a generated clip is plausibly real audio. Suspect when it has
 * no frames, is shorter than the per-length floor, or is below the byte floor.
 */
export function assessClipPlausibility(params: {
  buffer: Buffer | Uint8Array | ArrayBuffer;
  text: string;
  durationMs: number;
  frameCount: number;
}): ClipAssessment {
  const { text, durationMs, frameCount } = params;
  const byteLength =
    params.buffer instanceof ArrayBuffer ? params.buffer.byteLength : params.buffer.byteLength;

  if (frameCount === 0) {
    return { plausible: false, reason: "no-mpeg-frames" };
  }
  if (byteLength < MIN_BYTES) {
    return { plausible: false, reason: `too-small-bytes:${byteLength}` };
  }

  const visibleChars = countVisibleChars(text);
  const floorMs = Math.max(getMinClipMs(), getMsPerChar() * visibleChars);
  if (durationMs < floorMs) {
    return { plausible: false, reason: `too-short:${durationMs}ms<${floorMs}ms` };
  }

  return { plausible: true };
}
