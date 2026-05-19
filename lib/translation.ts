/**
 * Translation provider utilities.
 * Google Translate API v2 (server-side key) and OpenRouter (BYOK).
 */

import { getProviderSecret } from "@/lib/providers/store";
import { DEFAULT_OPENROUTER_TRANSLATION_MODEL } from "@/lib/openrouter-models";

export type TranslationResult = {
  text: string;
  translated: string | null;
  status: "ok" | "error";
  error?: string;
};

/**
 * Translate texts via Google Cloud Translation API v2.
 * Batches up to 128 strings per request per the API limit.
 */
export async function googleTranslate(
  texts: string[],
  fromLang: string,
  toLang: string,
): Promise<TranslationResult[]> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    return texts.map((t) => ({
      text: t,
      translated: null,
      status: "error" as const,
      error: "Google Translate API key not configured",
    }));
  }

  const results: TranslationResult[] = [];
  const BATCH_SIZE = 128;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: batch,
            source: fromLang,
            target: toLang,
            format: "text",
          }),
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        for (const text of batch) {
          results.push({
            text,
            translated: null,
            status: "error",
            error: `Google API error: ${res.status} ${errorText.slice(0, 200)}`,
          });
        }
        continue;
      }

      const data = await res.json();
      const translations = data.data?.translations ?? [];

      for (let j = 0; j < batch.length; j++) {
        const translation = translations[j];
        if (translation?.translatedText) {
          results.push({
            text: batch[j],
            translated: translation.translatedText,
            status: "ok",
          });
        } else {
          results.push({
            text: batch[j],
            translated: null,
            status: "error",
            error: "No translation returned",
          });
        }
      }
    } catch (err) {
      for (const text of batch) {
        results.push({
          text,
          translated: null,
          status: "error",
          error: err instanceof Error ? err.message : "Translation request failed",
        });
      }
    }
  }

  return results;
}

/**
 * Translate texts via OpenRouter (BYOK).
 * Batches up to 50 words per prompt.
 */
export async function openRouterTranslate(
  texts: string[],
  fromLang: string,
  toLang: string,
  apiKey: string,
  model = DEFAULT_OPENROUTER_TRANSLATION_MODEL,
): Promise<TranslationResult[]> {
  const results: TranslationResult[] = [];
  const BATCH_SIZE = 50;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const prompt = `
Translate the following words and phrases from ${fromLang} to ${toLang}.

Rules:
- If it is a single word, give the most common basic translation.
- If it is a phrase or sentence, translate it naturally for real-life use.
- Do not translate word-by-word if that sounds unnatural.
- Prefer common everyday language.
- Keep the translation beginner-friendly.
- If the source phrase is polite, make the translation polite in a natural way.
- Preserve the exact original text in the "original" field.
- Return only valid JSON.
- Do not include markdown or explanations outside the JSON.

Return this exact shape:
[
  {
    "original": "source text",
    "translated": "natural translation",
    "note": "optional short note if needed"
  }
]

Words:
${batch.map((t, idx) => `${idx + 1}. ${t}`).join("\n")}
`.trim();

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `
You are a professional translator for a language-learning app.
You translate meaning, not just words.
Your translations must sound natural to native speakers.
Return only valid JSON.
`.trim(),
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        for (const text of batch) {
          results.push({
            text,
            translated: null,
            status: "error",
            error: `OpenRouter API error: ${res.status} ${errorText.slice(0, 200)}`,
          });
        }
        continue;
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? "";

      // Parse JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        for (const text of batch) {
          results.push({
            text,
            translated: null,
            status: "error",
            error: "Failed to parse translation response",
          });
        }
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        original: string;
        translated: string;
        note?: string;
      }[];
      const translationMap = new Map(
        parsed.map((p) => [p.original.toLowerCase().trim(), p.translated]),
      );

      for (const text of batch) {
        const translated = translationMap.get(text.toLowerCase().trim());
        if (translated) {
          results.push({ text, translated, status: "ok" });
        } else {
          results.push({
            text,
            translated: null,
            status: "error",
            error: "Translation not found in response",
          });
        }
      }
    } catch (err) {
      for (const text of batch) {
        results.push({
          text,
          translated: null,
          status: "error",
          error:
            err instanceof Error ? err.message : "Translation request failed",
        });
      }
    }
  }

  return results;
}

/**
 * Get a decrypted user API key for a provider.
 */
export async function getUserApiKey(
  userId: string,
  provider: "openrouter" | "elevenlabs",
): Promise<string | null> {
  return getProviderSecret(userId, provider);
}
