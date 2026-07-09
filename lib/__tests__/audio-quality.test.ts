import { describe, expect, it } from "vitest";
import { analyzeMp3, assessClipPlausibility } from "../audio-quality";

// Build one valid MPEG-1 Layer III frame: 128 kbps, 44.1 kHz, no padding.
// frameLength = floor(144 * 128000 / 44100) = 417 bytes; 1152 samples/frame →
// 1152/44100*1000 ≈ 26.12 ms per frame.
const FRAME_BYTES = 417;
const MS_PER_FRAME = (1152 / 44100) * 1000;

function makeFrame(): Uint8Array {
  const frame = new Uint8Array(FRAME_BYTES);
  frame[0] = 0xff; // sync
  frame[1] = 0xfb; // MPEG1, Layer III, no CRC
  frame[2] = 0x90; // bitrate idx 9 (128k), samplerate idx 0 (44.1k), no padding
  frame[3] = 0x00; // stereo, etc. (irrelevant to sizing)
  // remaining bytes are payload (zeros) — fine for structural analysis
  return frame;
}

function makeMp3(frameCount: number): Uint8Array {
  const out = new Uint8Array(frameCount * FRAME_BYTES);
  for (let i = 0; i < frameCount; i++) {
    out.set(makeFrame(), i * FRAME_BYTES);
  }
  return out;
}

function withId3v2(body: Uint8Array, tagPayload = 100): Uint8Array {
  const size = tagPayload;
  const header = new Uint8Array(10 + size);
  header[0] = 0x49; // I
  header[1] = 0x44; // D
  header[2] = 0x33; // 3
  header[3] = 0x03; // version
  header[4] = 0x00;
  header[5] = 0x00; // flags (no footer)
  // syncsafe size
  header[6] = (size >> 21) & 0x7f;
  header[7] = (size >> 14) & 0x7f;
  header[8] = (size >> 7) & 0x7f;
  header[9] = size & 0x7f;
  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  out.set(body, header.length);
  return out;
}

describe("analyzeMp3", () => {
  it("counts frames and duration for a normal clip", () => {
    const { frameCount, durationMs } = analyzeMp3(makeMp3(20));
    expect(frameCount).toBe(20);
    expect(durationMs).toBe(Math.round(20 * MS_PER_FRAME));
  });

  it("handles a very short (single-frame) clip", () => {
    const { frameCount, durationMs } = analyzeMp3(makeMp3(1));
    expect(frameCount).toBe(1);
    expect(durationMs).toBe(Math.round(MS_PER_FRAME));
  });

  it("counts frames for a longer sentence-length clip", () => {
    const { frameCount } = analyzeMp3(makeMp3(120));
    expect(frameCount).toBe(120);
  });

  it("skips a leading ID3v2 tag", () => {
    const { frameCount } = analyzeMp3(withId3v2(makeMp3(10)));
    expect(frameCount).toBe(10);
  });

  it("resyncs past a stray 0xFF byte between frames", () => {
    const a = makeMp3(3);
    const b = makeMp3(3);
    const noisy = new Uint8Array(a.length + 1 + b.length);
    noisy.set(a, 0);
    noisy[a.length] = 0xff; // false sync
    noisy.set(b, a.length + 1);
    const { frameCount } = analyzeMp3(noisy);
    expect(frameCount).toBe(6);
  });

  it("reports zero frames for a truncated/garbage buffer", () => {
    const garbage = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
    expect(analyzeMp3(garbage).frameCount).toBe(0);
  });

  it("does not crash on a frame truncated mid-stream", () => {
    const full = makeMp3(4);
    const truncated = full.slice(0, full.length - 100);
    const { frameCount } = analyzeMp3(truncated);
    expect(frameCount).toBe(3); // last (incomplete) frame not counted
  });
});

describe("assessClipPlausibility", () => {
  it("passes a normal word clip", () => {
    const buffer = makeMp3(20); // ~522 ms
    const { durationMs, frameCount } = analyzeMp3(buffer);
    const verdict = assessClipPlausibility({ buffer, text: "hello", durationMs, frameCount });
    expect(verdict.plausible).toBe(true);
  });

  it("flags a clip with no MPEG frames", () => {
    const buffer = new Uint8Array(2000); // non-empty but no frames
    const verdict = assessClipPlausibility({ buffer, text: "hello", durationMs: 0, frameCount: 0 });
    expect(verdict.plausible).toBe(false);
    expect(verdict.reason).toBe("no-mpeg-frames");
  });

  it("flags a suspiciously tiny buffer", () => {
    const buffer = makeMp3(1).slice(0, 200); // < MIN_BYTES
    const verdict = assessClipPlausibility({ buffer, text: "a", durationMs: 26, frameCount: 1 });
    expect(verdict.plausible).toBe(false);
    expect(verdict.reason).toContain("too-small-bytes");
  });

  it("flags a clip shorter than the per-length floor", () => {
    // 2 frames ≈ 52 ms, but a long word should need much more.
    const buffer = makeMp3(2);
    const { durationMs, frameCount } = analyzeMp3(buffer);
    const verdict = assessClipPlausibility({
      buffer,
      text: "internationalization",
      durationMs,
      frameCount,
    });
    expect(verdict.plausible).toBe(false);
    expect(verdict.reason).toContain("too-short");
  });

  it("does not flag a legitimately short word with adequate duration", () => {
    const buffer = makeMp3(15); // ~392 ms, above the 300 ms floor
    const { durationMs, frameCount } = analyzeMp3(buffer);
    const verdict = assessClipPlausibility({ buffer, text: "hi", durationMs, frameCount });
    expect(verdict.plausible).toBe(true);
  });
});
