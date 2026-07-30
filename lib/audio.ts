import crypto from "crypto";
import { resolveLanguageVariantLocale } from "@/lib/language-variants";

// Re-exported for server callers that already import from "@/lib/audio". Client
// components should import it from "@/lib/audio-constants" to avoid pulling in
// node-only dependencies (crypto).
export { DEFAULT_GOOGLE_TTS_VOICE_ID } from "./audio-constants";

export class GoogleTTSQuotaExhaustedError extends Error {
  readonly code = "RESOURCE_EXHAUSTED" as const;
  constructor(detail: string) {
    super(
      "Google TTS quota has been exhausted. Please try again later or contact support.",
    );
    this.name = "GoogleTTSQuotaExhaustedError";
    this.cause = new Error(detail);
  }
}

/**
 * Compute content hash for audio dedup.
 * Hash = sha256(text + language + provider + output-affecting options)
 */
export function computeContentHash(
  text: string,
  language: string,
  provider: string,
  options?: {
    voiceId?: string | null;
    audioFormat?: string | null;
  },
): string {
  const voiceId = options?.voiceId?.trim() || "default";
  const audioFormat = options?.audioFormat?.trim() || "mp3";
  return crypto
    .createHash("sha256")
    .update(`${text}|${language}|${provider}|${voiceId}|${audioFormat}`)
    .digest("hex");
}

function inferGoogleVoiceLanguageCode(voiceId: string | undefined): string | null {
  const requestedVoiceId = voiceId?.trim();
  if (!requestedVoiceId || requestedVoiceId === "default") return null;

  const voiceFamilyMarkers = new Set([
    "Standard",
    "Wavenet",
    "Neural2",
    "Studio",
    "News",
    "Polyglot",
    "Journey",
    "Casual",
    "Chirp",
    "Chirp3",
  ]);
  const parts = requestedVoiceId.split("-").filter(Boolean);
  const familyIndex = parts.findIndex((part, index) =>
    index > 0 && voiceFamilyMarkers.has(part),
  );

  if (familyIndex > 1) return parts.slice(0, familyIndex).join("-");
  if (parts.length >= 3) return parts.slice(0, 2).join("-");
  return null;
}

/**
 * Google Cloud TTS: generate audio for a single text.
 * Returns audio bytes as Buffer, or null on failure.
 */
export async function googleTTS(
  text: string,
  language: string,
  voiceId?: string,
): Promise<{ audio: Buffer; sizeBytes: number } | null> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_TTS_API_KEY environment variable is not set");
  }

  // Map language codes to Google TTS language codes. A regionally split
  // language resolves through its variant first: bare "en" is the British
  // entry, so its name-less default voice must be British too, not the
  // American one Google would hand out for "en-US".
  const langMap: Record<string, string> = {
    vi: "vi-VN",
    cs: "cs-CZ",
  };
  const langCode =
    resolveLanguageVariantLocale(language) ?? langMap[language] ?? language;
  const requestedVoiceId = voiceId?.trim();
  const requestedVoiceLanguageCode = inferGoogleVoiceLanguageCode(requestedVoiceId);
  const voiceLanguageCode = requestedVoiceLanguageCode ?? langCode;

  try {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: requestedVoiceId && requestedVoiceId !== "default"
            ? {
                languageCode: voiceLanguageCode,
                name: requestedVoiceId,
              }
            : {
                languageCode: langCode,
                ssmlGender: "FEMALE",
              },
          audioConfig: {
            audioEncoding: "MP3",
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null) as {
        error?: { code?: number; message?: string; status?: string; details?: unknown[] };
      } | null;
      const detail = body?.error?.message ?? `${res.status} ${res.statusText}`;
      const errorStatus = body?.error?.status;
      console.error("[Google TTS] API error response", {
        httpStatus: res.status,
        httpStatusText: res.statusText,
        language,
        requestedLanguageCode: langCode,
        voiceLanguageCode,
        errorCode: body?.error?.code,
        errorStatus,
        errorMessage: body?.error?.message,
        errorDetails: body?.error?.details,
        rawBody: body,
      });
      if (errorStatus === "RESOURCE_EXHAUSTED") {
        throw new GoogleTTSQuotaExhaustedError(detail);
      }
      const statusLabel = errorStatus ? ` (${errorStatus})` : "";
      throw new Error(`Google TTS request failed${statusLabel}: ${detail}`);
    }

    const data = await res.json();
    if (!data.audioContent) {
      throw new Error("Google TTS response did not include audioContent");
    }

    const audio = Buffer.from(data.audioContent, "base64");
    if (audio.length === 0) {
      throw new Error("Google TTS returned empty audio");
    }
    return { audio, sizeBytes: audio.length };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("Google TTS request failed");
  }
}

/**
 * ElevenLabs TTS via Cloudflare Worker proxy.
 * The encrypted key is sent to the Worker which decrypts and calls ElevenLabs.
 * Key never touches the Next.js server in plaintext.
 */
export async function elevenLabsTTS(
  text: string,
  _language: string,
  encryptedKey: string,
  voiceId: string,
): Promise<{ audio: Buffer; sizeBytes: number } | null> {
  const workerUrl = process.env.MEDIA_PROXY_WORKER_URL;
  if (!workerUrl) {
    throw new Error("MEDIA_PROXY_WORKER_URL environment variable is not set");
  }

  try {
    const res = await fetch(`${workerUrl}/elevenlabs-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        encrypted_key: encryptedKey,
        text,
        voice_id: voiceId,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
      throw new Error(`ElevenLabs proxy request failed: ${detail || `${res.status} ${res.statusText}`}`);
    }

    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.length === 0) {
      throw new Error("ElevenLabs proxy returned empty audio");
    }
    return { audio, sizeBytes: audio.length };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("ElevenLabs proxy request failed");
  }
}

/**
 * Get audio serving URL for a content hash.
 */
export function getAudioUrl(contentHash: string): string {
  return `/api/audio/${contentHash}`;
}
