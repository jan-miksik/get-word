/**
 * Translation provider utilities.
 * Google Translate API v2 (server-side key) and OpenRouter (BYOK).
 */

import { getProviderSecret } from "@/lib/providers/store";
import { DEFAULT_OPENROUTER_TRANSLATION_MODEL } from "@/lib/openrouter-models";
import { callOpenRouterChatParsed, OpenRouterChatError, parseJsonLoose } from "@/lib/openrouter-chat";
import { TRANSLATION_QUALITY_RULES, TRANSLATION_SYSTEM_PROMPT } from "@/lib/translation-prompt";
import { looksUntranslated } from "@/lib/translation-validate";

export type TranslationResult = {
  text: string;
  translated: string | null;
  status: "ok" | "error";
  error?: string;
  /** Soft signal: output looks suspicious (e.g. wrong-script) but is kept. */
  warning?: string;
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
    const prompt = `
Translate the following ${batch.length} items from ${fromLang} to ${toLang}.

Rules:
${TRANSLATION_QUALITY_RULES}
- Translate each item independently and echo its "index" unchanged.
- Return only valid JSON, with no markdown or commentary.

Return JSON with this exact shape:
{ "items": [ { "index": 1, "translated": "natural translation" } ] }

Items:
${batch.map((t, idx) => `${idx + 1}. ${t}`).join("\n")}
`.trim();

    try {
      // BYOK models vary in structured-output support, so we don't force a
      // response_format and instead parse the JSON robustly. Index alignment
      // (with a text fallback) avoids collapsing duplicate source words.
      const { byIndex, byText } = await callOpenRouterChatParsed(
        {
          apiKey,
          model,
          temperature: 0.1,
          messages: [
            { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
        },
        (content) => {
          const parsed = parseJsonLoose(content);
          const rows = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as { items?: unknown } | null)?.items)
              ? (parsed as { items: unknown[] }).items
              : [];
          const byIndex = new Map<number, string>();
          const byText = new Map<string, string>();
          for (const row of rows) {
            if (!row || typeof row !== "object") continue;
            const translated = (row as { translated?: unknown }).translated;
            if (typeof translated !== "string" || !translated.trim()) continue;
            const idx = (row as { index?: unknown }).index;
            if (typeof idx === "number" && Number.isInteger(idx)) {
              byIndex.set(idx, translated.trim());
            }
            // Tolerate older { original, translated } shapes as a fallback.
            const original = (row as { original?: unknown }).original;
            if (typeof original === "string" && original.trim()) {
              byText.set(original.toLowerCase().trim(), translated.trim());
            }
          }
          if (byIndex.size === 0 && byText.size === 0) {
            throw new OpenRouterChatError("Failed to parse translation response.", true);
          }
          return { byIndex, byText };
        },
      );

      batch.forEach((text, idx) => {
        const translated =
          byIndex.get(idx + 1) ?? byText.get(text.toLowerCase().trim()) ?? null;
        if (translated) {
          results.push({
            text,
            translated,
            status: "ok",
            ...(looksUntranslated(translated, toLang)
              ? { warning: "Output may be untranslated (unexpected script)." }
              : {}),
          });
        } else {
          results.push({
            text,
            translated: null,
            status: "error",
            error: "Translation not found in response",
          });
        }
      });
    } catch (err) {
      // Out of credits is an account-level failure, not a per-word one: bubble
      // it up so the caller can surface a clear, actionable message.
      if (err instanceof OpenRouterChatError && err.isOutOfCredits) throw err;
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
 * Get a decrypted user API key for a provider.
 */
export async function getUserApiKey(
  userId: string,
  provider: "openrouter" | "elevenlabs",
): Promise<string | null> {
  return getProviderSecret(userId, provider);
}
