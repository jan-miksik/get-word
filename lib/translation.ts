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
  isAddressFormValue,
  oppositeAddressForm,
  type AddressFormValue,
} from "@/lib/word-item-address-form";
import {
  recordGoogleApiUsageEvent,
  type GoogleApiUsageContext,
} from "@/lib/google-api-usage-events";

/**
 * The second address-form rendering of the same source, when the target has a
 * binary system and the source left the choice open. Its presence is what turns
 * one input row into a pair of study items.
 */
type TranslationAlternative = {
  translated: string;
  register: AddressFormValue;
};

export type TranslationResult = {
  text: string;
  translated: string | null;
  /**
   * Form of address this translation uses. Set whenever the translation visibly
   * picks one — including when the source itself fixed it, in which case there
   * is deliberately no `alternative`.
   */
  register?: AddressFormValue;
  /** Present only when a second item should be created; see the type above. */
  alternative?: TranslationAlternative;
  status: "ok" | "error";
  error?: string;
  /** Soft signal: first warning's message (legacy string field), kept output. */
  warning?: string;
  /** Structured advisory warnings (register, capitalization, article, script). */
  validationWarnings?: TranslationValidationWarning[];
};

const OPENROUTER_TRANSLATION_BATCH_SIZE = 100;

type ParsedTranslationRow = {
  translated: string;
  register?: AddressFormValue;
  alternative?: TranslationAlternative;
};

/** Same-text comparison for rejecting an "alternative" that is not one. */
function sameWording(a: string, b: string): boolean {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalize(a) === normalize(b);
}

/**
 * Read the optional address-form fields off one model row.
 *
 * Deliberately strict, and degrades in one direction only: a malformed
 * `alternative` is dropped while the primary translation survives, because a
 * bad second variant must never cost the learner the row they asked for.
 * `alternative` is rejected unless the row has a valid `register`, the
 * alternative names the OPPOSITE one, and the two wordings actually differ.
 */
function parseAddressFormFields(row: Record<string, unknown>): {
  register?: AddressFormValue;
  alternative?: TranslationAlternative;
} {
  const register = row.register;
  if (!isAddressFormValue(register)) return {};

  const raw = row.alternative;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { register };

  const candidate = raw as Record<string, unknown>;
  const translated = candidate.translated;
  const altRegister = candidate.register;
  if (typeof translated !== "string" || !translated.trim()) return { register };
  if (!isAddressFormValue(altRegister)) return { register };
  if (altRegister !== oppositeAddressForm(register)) return { register };

  return {
    register,
    alternative: { translated: translated.trim(), register: altRegister },
  };
}

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
    /**
     * Ask for per-item address forms. Callers pass `hasBinaryAddressForms(toLang)`;
     * off by default so the list translator and school flow keep their old output.
     */
    addressForms?: boolean;
  } = {},
): Promise<TranslationResult[]> {
  const results: TranslationResult[] = [];
  const addressForms = requestOptions.addressForms === true;
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
      addressForms,
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
          const byIndex = new Map<number, ParsedTranslationRow>();
          const byText = new Map<string, ParsedTranslationRow>();
          for (const row of rows) {
            if (!row || typeof row !== "object") continue;
            const record = row as Record<string, unknown>;
            const translated = record.translated;
            if (typeof translated !== "string" || !translated.trim()) continue;
            const text = translated.trim();
            const addressFields = addressForms ? parseAddressFormFields(record) : {};
            // An "alternative" identical to the primary is not an alternative.
            if (addressFields.alternative && sameWording(addressFields.alternative.translated, text)) {
              delete addressFields.alternative;
            }
            const parsed: ParsedTranslationRow = { translated: text, ...addressFields };
            const idx = record.index;
            if (typeof idx === "number" && Number.isInteger(idx)) {
              byIndex.set(idx, parsed);
            }
            // Tolerate older { original, translated } shapes as a fallback.
            const original = record.original;
            if (typeof original === "string" && original.trim()) {
              byText.set(original.toLowerCase().trim(), parsed);
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
        const row = byIndex.get(idx + 1) ?? byText.get(key) ?? null;
        if (row) {
          const translated = row.translated;
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
            ...(row.register ? { register: row.register } : {}),
            ...(row.alternative ? { alternative: row.alternative } : {}),
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
