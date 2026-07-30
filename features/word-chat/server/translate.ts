import { findExistingTranslations } from "@/lib/db";
import { openRouterTranslate } from "@/lib/translation";
import {
  OpenRouterChatError,
  type OpenRouterChatMeta,
} from "@/lib/openrouter-chat";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { DailyLimitError, reserveDailyBuckets } from "@/lib/rate-limit/daily-bucket";
import { validateTranslation } from "@/lib/translation-validate";
import { polishPair } from "@/lib/formatting-polish";
import {
  TRANSLATION_SYSTEM_PROMPT,
  buildOpenRouterTranslationPrompt,
} from "@/lib/translation-prompt";
import {
  MAX_ITEMS_PER_SESSION,
  MAX_WORD_CHAT_ITEM_CHARS,
  SESSIONS_PER_DAY,
  EDITOR_SESSIONS_PER_DAY,
  OPENROUTER_MAX_ATTEMPTS,
  WORD_CHAT_TRANSLATION_MODEL,
  TRANSLATION_MAX_TOKENS,
  getServerApiKey,
} from "./config";
import { WordChatUnavailableError } from "./chat";
import { loadCorpusItems } from "./corpus";
import { buildCallDiagnostics, type WordChatCallDiagnostics } from "./diagnostics";
import {
  recordWordChatUsage,
  runReservedWordChatCall,
  type WordChatSpendReservation,
} from "./usage";
import { getMonthlyItemUsage, type WordChatRole } from "./rate-limit";
import { computeContentKey } from "@/lib/progress-key";
import { toPlainItemText } from "../plainItemText";
import type { ReviewItem, TakeoverReference } from "../types";

/**
 * Translation for word-chat runs on the donated server key, so it is metered
 * here rather than exposed as a provider on the public `/api/translate/batch`
 * route: an unmetered "use the donated key" provider on a general endpoint is
 * free unlimited Opus for anyone who finds it.
 *
 * Re-translation during Review is normal (the learner edits a source line), so
 * the daily allowance is a multiple of what one session's worth of items costs.
 */
const RETRANSLATE_ALLOWANCE = 3;

function dailyTranslationBucket(userId: string, role: WordChatRole) {
  const sessions = role === "editor" ? EDITOR_SESSIONS_PER_DAY : SESSIONS_PER_DAY;
  return {
    key: `word_chat:translate:user:${userId}`,
    limit: sessions * MAX_ITEMS_PER_SESSION * RETRANSLATE_ALLOWANCE,
    message: "You've translated a lot today. Please try again tomorrow.",
  };
}

export type TranslatedRow = ReviewItem & {
  /** Advisory quality warnings; never blocking, surfaced in the Review step. */
  warnings: string[];
  /** True when the pair came from an existing item instead of a model call. */
  reused: boolean;
};

export type TranslationDiagnostics = WordChatCallDiagnostics;

/**
 * Translate a selected set into review rows.
 *
 * Everything travels in ONE batch — model proposals and learner-typed additions
 * alike — so `buildOpenRouterTranslationPrompt`'s `previousPairs` context keeps
 * anchors, register and parallel phrasing consistent across the whole set. A
 * per-item call would lose exactly the consistency this set needs.
 *
 * Nothing is written to the database here. The rows are draft state until the
 * learner confirms in Review.
 */
export async function translateSelection(input: {
  userId: string;
  role: WordChatRole;
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  items: {
    kind: "sentence" | "word";
    text: string;
    corpusItemId?: string;
    takeoverCandidate?: TakeoverReference;
  }[];
  /** Editor override from the debug panel; falls back to the configured model. */
  model?: string;
  /** Include the exact request in the diagnostics. Editors only. */
  includeRequest?: boolean;
}): Promise<{ rows: TranslatedRow[]; diagnostics: TranslationDiagnostics }> {
  const apiKey = getServerApiKey();
  if (!apiKey) throw new WordChatUnavailableError();

  const model = input.model || WORD_CHAT_TRANSLATION_MODEL;
  const startedAt = Date.now();

  const languageFrom = normalizeLanguageCode(input.languageFrom);
  const languageTo = normalizeLanguageCode(input.languageTo);

  const items = input.items
    .map((item) => ({
      ...item,
      text: item.text.trim().replace(/\s+/g, " ").slice(0, MAX_WORD_CHAT_ITEM_CHARS),
    }))
    .filter((item) => item.text)
    .slice(0, MAX_ITEMS_PER_SESSION);
  if (items.length === 0) {
    return {
      rows: [],
      diagnostics: buildCallDiagnostics({
        callType: "translation",
        model,
        startedAt,
      }),
    };
  }

  const monthlyUsage = await getMonthlyItemUsage({ userId: input.userId, role: input.role });
  const remaining = Math.max(0, monthlyUsage.limit - monthlyUsage.used);
  if (items.length > remaining) {
    throw new DailyLimitError(
      remaining > 0
        ? `You have ${remaining} new words left this month. Select ${remaining} or fewer.`
        : `You've reached this month's limit of ${monthlyUsage.limit} new words.`,
    );
  }

  await reserveDailyBuckets([
    { ...dailyTranslationBucket(input.userId, input.role), count: items.length },
  ]);

  // 1. Corpus rows arrive already translated AND already voiced. Free, and
  //    human-reviewed wherever the pool is.
  const corpusIds = items
    .map((item) => item.corpusItemId)
    .filter((id): id is string => Boolean(id));
  const [corpusItems, existing] = await Promise.all([
    loadCorpusItems([...new Set(corpusIds)]),
    findExistingTranslations(
      items.map((item) => item.text),
      "textKnown",
      languageFrom,
      languageTo,
    ),
  ]);

  const resolved = new Map<string, TranslatedRow>();
  const pending: typeof items = [];
  let paidUsage: {
    result: Awaited<ReturnType<typeof openRouterTranslate>>;
    reservation: WordChatSpendReservation;
    meta: OpenRouterChatMeta;
    responseCount: number;
    usageObserved: boolean;
    minimumCostUsd: number;
  } | null = null;

  for (const item of items) {
    const corpusRow = item.corpusItemId ? corpusItems.get(item.corpusItemId) : undefined;
    // Only trust the corpus row when the learner did not edit the text.
    if (corpusRow?.textTarget && corpusRow.textKnown.trim() === item.text) {
      const [reviewKey, sourceKey] = await Promise.all([
        computeContentKey({
          languageFrom,
          languageTo,
          textKnown: item.text,
          textTarget: corpusRow.textTarget,
          ignoreCase: corpusRow.ignoreCase,
        }),
        computeContentKey({
          languageFrom: corpusRow.languageFrom,
          languageTo: corpusRow.languageTo,
          textKnown: corpusRow.textKnown,
          textTarget: corpusRow.textTarget,
          ignoreCase: corpusRow.ignoreCase,
        }),
      ]);
      const takeover =
        item.takeoverCandidate?.sourceItemId === corpusRow.id &&
        reviewKey !== null &&
        reviewKey === sourceKey
          ? item.takeoverCandidate
          : undefined;
      resolved.set(item.text, {
        kind: item.kind,
        textKnown: item.text,
        textTarget: corpusRow.textTarget,
        corpusItemId: corpusRow.id,
        audioAssetId: corpusRow.audioAssetId,
        audioHash: corpusRow.audioHash,
        knownAudioAssetId: corpusRow.knownAudioAssetId,
        ...(takeover ? { takeover } : {}),
        warnings: [],
        reused: true,
      });
      continue;
    }
    pending.push(item);
  }

  // 2. Whatever is left may still exist elsewhere in the same direction.
  if (pending.length > 0) {
    const existingByText = new Map(existing.map((row) => [row.text, row.translatedText]));
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const item = pending[index];
      const translated = existingByText.get(item.text);
      if (!translated) continue;
      resolved.set(item.text, {
        kind: item.kind,
        textKnown: item.text,
        textTarget: translated,
        warnings: [],
        reused: true,
      });
      pending.splice(index, 1);
    }
  }

  // 3. Only genuinely new text reaches the model.
  if (pending.length > 0) {
    try {
      const texts = pending.map((item) => item.text);
      const prompt = buildOpenRouterTranslationPrompt({
        texts,
        fromLang: languageFrom,
        toLang: languageTo,
        previousPairs: [],
      });
      paidUsage = await runReservedWordChatCall(
        {
          userId: input.userId,
          sessionId: input.sessionId,
          callType: "translation",
          stage: "review_completed",
          model,
          request: {
            maxTokens: TRANSLATION_MAX_TOKENS,
            system: TRANSLATION_SYSTEM_PROMPT,
            prompt,
          },
          maxOutputTokens: TRANSLATION_MAX_TOKENS,
          maxAttempts: OPENROUTER_MAX_ATTEMPTS,
          itemCount: pending.length,
        },
        ({ onResponse, onAttemptStart }) =>
          openRouterTranslate(
            texts,
            languageFrom,
            languageTo,
            apiKey,
            model,
            undefined,
            {
              maxTokens: TRANSLATION_MAX_TOKENS,
              maxAttempts: OPENROUTER_MAX_ATTEMPTS,
              onResponse,
              onAttemptStart,
            },
          ),
      );
      const results = paidUsage.result;
      pending.forEach((item, index) => {
        const result = results[index];
        // Parenthetical glosses and "one / the other" alternatives are asked
        // against in the translation prompt; strip them here so a model that
        // adds one anyway cannot put it on a card or into the spoken clip.
        const target = toPlainItemText(result?.translated ?? "");
        if (!target) return;

        // Deterministic formatting first, warnings second: a missing capital or
        // final period on a sentence is a thing we can just fix, and the item's
        // own kind decides whether sentence rules apply at all — never the
        // "does it look like a sentence" heuristic, which flags a word whose
        // translation happens to run long.
        const isSentence = item.kind === "sentence";
        const polished = polishPair(
          { text: item.text, lang: languageFrom },
          { text: target, lang: languageTo },
          { isSentence },
        );

        const validation = validateTranslation({
          source: polished.source.fixed,
          target: polished.target.fixed,
          fromLang: languageFrom,
          toLang: languageTo,
          isSentence,
        });
        resolved.set(item.text, {
          kind: item.kind,
          textKnown: polished.source.fixed,
          textTarget: polished.target.fixed,
          warnings: validation.map((warning) => warning.message),
          reused: false,
        });
      });
    } catch (err) {
      if (err instanceof OpenRouterChatError && err.isOutOfCredits) {
        throw new WordChatUnavailableError(
          "Translation is temporarily unavailable. Please try again later.",
        );
      }
      throw err;
    }
  }

  if (
    paidUsage &&
    (paidUsage.usageObserved || paidUsage.minimumCostUsd > 0)
  ) {
    await recordWordChatUsage({
      userId: input.userId,
      sessionId: input.sessionId,
      callType: "translation",
      stage: "review_completed",
      model,
      meta: paidUsage.meta,
      itemCount: pending.length,
      reservation: paidUsage.reservation,
      minimumCostUsd: paidUsage.minimumCostUsd,
    });
  }

  // Preserve the learner's ordering; drop anything that failed to translate
  // rather than showing an empty row they cannot act on.
  const rows = items
    .map((item) => resolved.get(item.text))
    .filter((row): row is TranslatedRow => Boolean(row));

  return {
    rows,
    diagnostics: buildCallDiagnostics({
      callType: "translation",
      model,
      meta: paidUsage?.meta,
      startedAt,
      // `openRouterTranslate` builds and batches its own prompts; rebuilding the
      // first batch here is the honest way to show what was sent without
      // reaching into its internals.
      ...(input.includeRequest && pending.length > 0
        ? {
            request: {
              maxTokens: TRANSLATION_MAX_TOKENS,
              provider: null,
              messages: [
                { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
                {
                  role: "user",
                  content: buildOpenRouterTranslationPrompt({
                    texts: pending.map((item) => item.text),
                    fromLang: languageFrom,
                    toLang: languageTo,
                    previousPairs: [],
                  }),
                },
              ],
            },
          }
        : {}),
    }),
  };
}
