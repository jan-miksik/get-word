/**
 * Translation provider utilities.
 * Google Translate API v2 (server-side key) and OpenRouter (BYOK).
 */

import { getProviderSecret } from "@/lib/providers/store";
import { DEFAULT_OPENROUTER_TRANSLATION_MODEL } from "@/lib/openrouter-models";
import {
  callOpenRouterChatParsedWithMeta,
  OpenRouterChatError,
  parseJsonLoose,
  type OpenRouterChatMeta,
} from "@/lib/openrouter-chat";
import {
  buildOpenRouterTranslationPrompt,
  TRANSLATION_SYSTEM_PROMPT,
} from "@/lib/translation-prompt";
import { toBaseLanguageForTranslationApi } from "@/lib/language-variants";
import {
  validateTranslation,
  type TranslationValidationWarning,
} from "@/lib/translation-validate";
import {
  recordGoogleApiUsageEvent,
  type GoogleApiUsageContext,
} from "@/lib/google-api-usage-events";

export type TranslationResult = {
  text: string;
  translated: string | null;
  status: "ok" | "error";
  error?: string;
  /** Soft signal: first warning's message (legacy string field), kept output. */
  warning?: string;
  /** Structured advisory warnings (register, capitalization, article, script). */
  validationWarnings?: TranslationValidationWarning[];
};

const OPENROUTER_TRANSLATION_BATCH_SIZE = 100;

/**
 * Translate texts via Google Cloud Translation API v2.
 * Batches up to 128 strings per request per the API limit.
 */
export async function googleTranslate(
  texts: string[],
  fromLang: string,
  toLang: string,
  usage: GoogleApiUsageContext,
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

  // Google Translate v2 knows no regional English: "en-US" is a 400. Its own
  // regional targets ("zh-CN", "pt-BR") are left untouched. The variant is not
  // lost — it is enforced by the LLM path, which is where lists are written.
  const source = toBaseLanguageForTranslationApi(fromLang);
  const target = toBaseLanguageForTranslationApi(toLang);

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
            source,
            target,
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

      await recordGoogleApiUsageEvent({
        ...usage,
        scope: "translate",
        model: "nmt-v2",
        units: batch.reduce((total, text) => total + Array.from(text).length, 0),
        requestCount: 1,
      });

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
 * Batches up to 100 words per prompt.
 */
export async function openRouterTranslate(
  texts: string[],
  fromLang: string,
  toLang: string,
  apiKey: string,
  model = DEFAULT_OPENROUTER_TRANSLATION_MODEL,
  onMeta?: (meta: OpenRouterChatMeta) => void,
  requestOptions: {
    maxTokens?: number;
    maxAttempts?: number;
    onResponse?: (meta: OpenRouterChatMeta) => void;
    onAttemptStart?: () => void;
  } = {},
): Promise<TranslationResult[]> {
  const results: TranslationResult[] = [];
  // Larger batches give the model more of the list at once (helps teaching-anchor
  // consistency) without hitting a rate limit. Kept moderate because BYOK runs
  // arbitrary, sometimes weaker models where long structured output is less
  // reliable; index-aligned parsing below tolerates a dropped/failed batch.

  for (let i = 0; i < texts.length; i += OPENROUTER_TRANSLATION_BATCH_SIZE) {
    const batch = texts.slice(i, i + OPENROUTER_TRANSLATION_BATCH_SIZE);
    const previousPairs = results
      .flatMap((result) =>
        result.status === "ok" && result.translated
          ? [{ source: result.text, target: result.translated }]
          : [],
      );
    const prompt = buildOpenRouterTranslationPrompt({
      texts: batch,
      fromLang,
      toLang,
      previousPairs,
    });

    try {
      // BYOK models vary in structured-output support, so we don't force a
      // response_format and instead parse the JSON robustly. Index alignment
      // (with a text fallback) avoids collapsing duplicate source words.
      const { value: { byIndex, byText }, meta } = await callOpenRouterChatParsedWithMeta(
        {
          apiKey,
          model,
          temperature: 0.1,
          maxTokens: requestOptions.maxTokens,
          maxAttempts: requestOptions.maxAttempts,
          onResponse: requestOptions.onResponse,
          onAttemptStart: requestOptions.onAttemptStart,
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
      onMeta?.(meta);

      batch.forEach((text, idx) => {
        const key = text.toLowerCase().trim();
        const translated = byIndex.get(idx + 1) ?? byText.get(key) ?? null;
        if (translated) {
          const validationWarnings = validateTranslation({
            source: text,
            target: translated,
            fromLang,
            toLang,
          });
          results.push({
            text,
            translated,
            status: "ok",
            ...(validationWarnings.length > 0
              ? {
                  warning: validationWarnings[0].message,
                  validationWarnings,
                }
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
