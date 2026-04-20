import crypto from "crypto";

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

/**
 * Google Cloud TTS: generate audio for a single text.
 * Returns audio bytes as Buffer, or null on failure.
 */
export async function googleTTS(
  text: string,
  language: string,
): Promise<{ audio: Buffer; sizeBytes: number } | null> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) return null;

  // Map language codes to Google TTS language codes
  const langMap: Record<string, string> = {
    vi: "vi-VN",
    cs: "cs-CZ",
    en: "en-US",
  };
  const langCode = langMap[language] ?? language;

  try {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: langCode,
            ssmlGender: "FEMALE",
          },
          audioConfig: {
            audioEncoding: "MP3",
          },
        }),
      },
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.audioContent) return null;

    const audio = Buffer.from(data.audioContent, "base64");
    return { audio, sizeBytes: audio.length };
  } catch {
    return null;
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
  if (!workerUrl) return null;

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

    if (!res.ok) return null;

    const audio = Buffer.from(await res.arrayBuffer());
    return { audio, sizeBytes: audio.length };
  } catch {
    return null;
  }
}

/**
 * Get audio serving URL for a content hash.
 */
export function getAudioUrl(contentHash: string): string {
  return `/api/audio/${contentHash}`;
}
