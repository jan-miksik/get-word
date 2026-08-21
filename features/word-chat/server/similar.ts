import {
  OpenRouterChatError,
  callOpenRouterChatParsedWithMeta,
  parseJsonLoose,
} from "@/lib/openrouter-chat";
import { getLocalizedLanguageName } from "@/lib/i18n/languages";
import { similarityRatio } from "@/lib/levenshtein";
import { polishPair } from "@/lib/formatting-polish";
import {
  OPENROUTER_API_URL,
  OPENROUTER_MAX_ATTEMPTS,
  OPENROUTER_RETRY_BASE_DELAY_MS,
  OPENROUTER_TIMEOUT_MS,
  MAX_WORD_CHAT_ITEM_CHARS,
  WORD_CHAT_PROPOSAL_MODEL,
  WORD_CHAT_PROVIDER_PREFERENCES,
  getServerApiKey,
} from "./config";
import { WordChatUnavailableError } from "./chat";
import { dedupKey, loadExclusions } from "./corpus";
import { buildCallDiagnostics, type WordChatCallDiagnostics } from "./diagnostics";
import { recordWordChatUsage, runReservedWordChatCall } from "./usage";
import { toPlainItemText } from "../plainItemText";

/**
 * How many neighbours a single seed may produce.
 *
 * Small on purpose. The learner asked for the words most easily confused with
 * the one in front of them, and past the third the answers stop being confusable
 * and start being "also in the same topic" — which is what the generic list
 * generator used to return here, and why the feature read as broken.
 */
export const MAX_SIMILAR_ITEMS = 3;

/**
 * Combined reasoning and answer budget.
 *
 * The reply itself is a handful of pairs, but finding lookalikes is a search
 * through the language rather than a recall, and the model does that search in
 * its reasoning tokens — which come out of this same budget. Too small a
 * ceiling does not produce a shorter answer, it produces no answer at all.
 */
const SIMILAR_MAX_TOKENS = 4_000;

/**
 * Reasoning is left at the model's own effort, unlike the proposal call.
 *
 * Writing ten items about a topic is recall; finding the words that merely LOOK
 * like one given word is a search through the language, and at low effort the
 * model stops searching and starts inventing plausible-looking forms that are
 * not words at all.
 */
const SIMILAR_REASONING = { exclude: true } as const;

/**
 * Candidates asked for beyond what is kept.
 *
 * The spelling floor below rejects whatever came back on the wrong criterion,
 * and a model that misreads the question misreads it for the whole answer. The
 * spare candidates are what keeps a partly-wrong answer from arriving as one
 * lonely word.
 */
const SIMILAR_OVERASK = 2;

export interface SimilarWordPair {
  known: string;
  target: string;
}

function languageName(code: string, locale: string): string {
  return getLocalizedLanguageName(code, locale) ?? code.toUpperCase();
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  // The same de-editorialising every other generated item goes through: no
  // bracketed notes, no "this / that" alternatives on a card nobody can answer.
  return toPlainItemText(value).slice(0, MAX_WORD_CHAT_ITEM_CHARS);
}

export function buildSimilarWordsPrompt(input: {
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  seed: SimilarWordPair;
  count: number;
}): { system: string; user: string } {
  const target = languageName(input.languageTo, input.chatLanguage);
  const known = languageName(input.languageFrom, input.chatLanguage);

  const system = `
You find the ${target} expressions that are written most like one specific ${target} expression a learner is studying. They know ${known}.

Similarity here means SPELLING, and nothing else. Judge it on the ${target} side, letter by letter, on the written form — never on the ${known} translation, never on meaning, never on topic. Two words that mean related things but look different are wrong answers here. Two words that look almost identical but mean completely unrelated things are exactly right.

Return a mix of two closeness levels, closest first:
- Near twins: the same letters apart from tone marks, diacritics, or a single letter. Where ${target} writes syllables separately, a difference inside one syllable counts.
- Half-alike: roughly half the letters in common — one syllable shared, or the same length and shape with several letters changed.

Calibration in another language; do NOT copy it. If the seed were the Czech word "kolej" (a railway track, or student housing):
- NEAR TWIN: "kolem" — one letter apart, and it means something entirely different ("around"). That unrelatedness is fine, and typical.
- HALF-ALIKE: "koleno" ("knee") — the first four letters are shared, the word is longer.
- WRONG: "vlak" ("train") — the right topic, the wrong criterion. It looks nothing like the seed, so it does not belong here.

Rules:
- Propose AT MOST ${input.count} candidates, most similar first. Return fewer, or none, rather than padding with words that are merely related in meaning.
- Every item must be an expression that really exists in ${target} and that a competent speaker would recognise. A plausible-looking form is not enough: if you are not sure the expression is real, leave it out and return fewer items. This is the rule that matters most — a made-up lookalike is worse than no lookalike.
- Never return the seed itself, an inflection of it, or a different spelling of the same word. In particular, dropping or adding a diacritic to reach a form that is not itself a separate word is a misspelling of the seed, not a neighbour.
- Never return part of the seed, and never the seed with a word added to it. It has to be its own expression, not a longer or shorter way of saying the same thing.
- Single words or short set phrases only. Never a sentence, never an explanation, never an example of use.
- "target" is the ${target} expression. "known" is its plain ${known} translation — one wording, no parentheses, no brackets, no slash alternatives, no glosses or notes. The translation is only there so the learner can study the pair; it plays no part in choosing the item.
- "why" is "twin" for the near twins and "half" for the half-alike ones.

Return only valid JSON, no markdown:
{ "items": [ { "target": "...", "known": "...", "why": "twin" } ] }
`.trim();

  const user = `The learner is studying this pair:
${target}: ${input.seed.target}
${known}: ${input.seed.known}

Which ${target} expressions are written most like "${input.seed.target}"?`;

  return { system, user };
}

/**
 * Generate confusable neighbours for one studied pair.
 *
 * Deliberately its own call rather than a mode of `proposeItems`: that prompt
 * builds someone's first study set — a fixed count of sentences plus supporting
 * items, at a CEFR level, written on the known side — and asking it for
 * confusable neighbours returned exactly what it is built to return, a themed
 * beginner list with no relation to the word on screen.
 *
 * Both sides come back from the same call, so the pair the learner saves is the
 * pair the model actually meant. Re-translating the known side afterwards was
 * the other half of the old bug: similarity lives on the target side, and a
 * round trip through the known side does not preserve it.
 */
export async function proposeSimilarWords(input: {
  userId: string;
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  seed: SimilarWordPair;
  count?: number;
  model?: string;
  includeRequest?: boolean;
}): Promise<{ items: SimilarWordPair[]; diagnostics: WordChatCallDiagnostics }> {
  const apiKey = getServerApiKey();
  if (!apiKey) throw new WordChatUnavailableError();

  const model = input.model || WORD_CHAT_PROPOSAL_MODEL;
  const startedAt = Date.now();
  const count = Math.min(Math.max(1, input.count ?? MAX_SIMILAR_ITEMS), MAX_SIMILAR_ITEMS);

  const exclusions = await loadExclusions({
    userId: input.userId,
    languageFrom: input.languageFrom,
    languageTo: input.languageTo,
  });
  const exclusionKeys = new Set(exclusions.map(dedupKey).filter(Boolean));

  const { system, user } = buildSimilarWordsPrompt({
    languageFrom: input.languageFrom,
    languageTo: input.languageTo,
    chatLanguage: input.chatLanguage,
    seed: input.seed,
    count: count + SIMILAR_OVERASK,
  });

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];

  const paid = await runReservedWordChatCall(
    {
      userId: input.userId,
      sessionId: input.sessionId,
      callType: "proposal",
      stage: "proposal_completed",
      model,
      request: {
        maxTokens: SIMILAR_MAX_TOKENS,
        reasoning: SIMILAR_REASONING,
        responseFormat: { type: "json_object" },
        provider: WORD_CHAT_PROVIDER_PREFERENCES,
        messages,
      },
      maxOutputTokens: SIMILAR_MAX_TOKENS,
      maxAttempts: OPENROUTER_MAX_ATTEMPTS,
    },
    ({ onResponse, onAttemptStart }) =>
      callOpenRouterChatParsedWithMeta(
        {
          apiKey,
          model,
          apiUrl: OPENROUTER_API_URL,
          maxAttempts: OPENROUTER_MAX_ATTEMPTS,
          retryBaseDelayMs: OPENROUTER_RETRY_BASE_DELAY_MS,
          timeoutMs: OPENROUTER_TIMEOUT_MS,
          maxTokens: SIMILAR_MAX_TOKENS,
          reasoning: { ...SIMILAR_REASONING },
          responseFormat: { type: "json_object" },
          provider: { ...WORD_CHAT_PROVIDER_PREFERENCES },
          messages,
          onResponse,
          onAttemptStart,
        },
        (content) => parseSimilarWords(content),
      ),
  );

  const items = materializeSimilarWords({
    raw: paid.result.value,
    seed: input.seed,
    languageFrom: input.languageFrom,
    languageTo: input.languageTo,
    exclusionKeys,
    limit: count,
  });

  await recordWordChatUsage({
    userId: input.userId,
    sessionId: input.sessionId,
    callType: "proposal",
    stage: "proposal_completed",
    model,
    meta: paid.meta,
    itemCount: items.length,
    reservation: paid.reservation,
    minimumCostUsd: paid.minimumCostUsd,
  });

  return {
    items,
    diagnostics: buildCallDiagnostics({
      callType: "proposal",
      model,
      meta: paid.meta,
      startedAt,
      ...(input.includeRequest
        ? {
            request: {
              maxTokens: SIMILAR_MAX_TOKENS,
              provider: WORD_CHAT_PROVIDER_PREFERENCES,
              messages,
            },
          }
        : {}),
    }),
  };
}

export function parseSimilarWords(content: string): SimilarWordPair[] {
  const parsed = parseJsonLoose(content) as Record<string, unknown> | null;
  const raw = Array.isArray(parsed?.items) ? (parsed.items as unknown[]) : null;
  if (!raw) {
    throw new OpenRouterChatError("Similar words returned no items array.", true);
  }
  return raw.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    return { known: cleanText(row.known), target: cleanText(row.target) };
  });
}

/**
 * How alike two written forms are, ignoring case, punctuation and word breaks.
 *
 * Measured twice — once as written, once with the diacritics folded away — and
 * the kinder score wins, because a pair that differs only in tone marks is the
 * closest kind of twin there is and must not be scored as two different letters.
 */
function compact(value: string): string {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** The written form with every diacritic and stroke removed. */
function fold(value: string): string {
  return compact(
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d"),
  );
}

/** How many marks the written form carries. Strokes count; plain letters do not. */
function markCount(value: string): number {
  const decomposed = value.normalize("NFD");
  const combining = decomposed.match(/[\u0300-\u036f]/g)?.length ?? 0;
  const strokes = decomposed.match(/đ/gi)?.length ?? 0;
  return combining + strokes;
}

/** Words as written, ignoring case and marks. */
function foldedTokens(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => fold(token))
    .filter(Boolean);
}

export function writtenSimilarity(a: string, b: string): number {
  return Math.max(
    similarityRatio(compact(a), compact(b)),
    similarityRatio(fold(a), fold(b)),
  );
}

/**
 * Whether an item is the seed wearing a disguise rather than another word.
 *
 * Two disguises show up in practice, and a plain edit-distance floor waves both
 * through because they score as near-perfect matches:
 *
 *   - The seed with marks dropped. In a language that writes tone with
 *     diacritics that is a misspelling, not a neighbour — "cảm on" for "cảm ơn".
 *     A genuine twin CHANGES a mark rather than losing one ("trăm" → "trạm"), so
 *     the same fold with fewer marks is the tell.
 *   - The seed with a word taken off or added on: "nhà" for "nhà ga", or
 *     "cảm ơn nhiều" for "cảm ơn". The learner already studies that expression;
 *     a piece of it is not a second thing to learn.
 */
export function isSeedInDisguise(candidate: string, seed: string): boolean {
  if (fold(candidate) === fold(seed) && markCount(candidate) < markCount(seed)) {
    return true;
  }
  const candidateTokens = foldedTokens(candidate);
  const seedTokens = foldedTokens(seed);
  if (candidateTokens.length === seedTokens.length) return false;
  const [shorter, longer] =
    candidateTokens.length < seedTokens.length
      ? [candidateTokens, seedTokens]
      : [seedTokens, candidateTokens];
  const remaining = [...longer];
  return shorter.every((token) => {
    const index = remaining.indexOf(token);
    if (index === -1) return false;
    remaining.splice(index, 1);
    return true;
  });
}

/**
 * How alike a neighbour has to look before it is worth showing.
 *
 * The learner's own words for it were "similar or very similar" and "at least
 * half". Half the letters is also where the learning side already draws the line
 * between a distractor that teaches something and one that is simply another
 * word (`similarityBandForTerms`, band II).
 *
 * The floor is not a second opinion about the model's taste — it is the check
 * that the criterion was spelling at all. A model asked for lookalikes will
 * sometimes answer with the same-topic word instead, and that answer scores far
 * below this.
 */
const MIN_WRITTEN_SIMILARITY = 0.5;

/**
 * The checks the prompt cannot guarantee: no seed echo or disguise of one, no
 * duplicates, nothing the learner already studies, nothing that fails the
 * spelling test, and formatting brought in line with the rest of the app's
 * items.
 *
 * Survivors are re-ordered by how alike they actually look, so the closest
 * lookalike leads however the model happened to sort them.
 */
export function materializeSimilarWords(input: {
  raw: SimilarWordPair[];
  seed: SimilarWordPair;
  languageFrom: string;
  languageTo: string;
  exclusionKeys: Set<string>;
  limit: number;
}): SimilarWordPair[] {
  const seedTargetKey = dedupKey(input.seed.target);
  const seedKnownKey = dedupKey(input.seed.known);
  const seenTarget = new Set<string>();
  const scored: Array<{ item: SimilarWordPair; similarity: number }> = [];

  for (const entry of input.raw) {
    if (!entry.known || !entry.target) continue;
    const targetKey = dedupKey(entry.target);
    const knownKey = dedupKey(entry.known);
    if (!targetKey || !knownKey) continue;
    if (targetKey === seedTargetKey || knownKey === seedKnownKey) continue;
    if (seenTarget.has(targetKey)) continue;
    if (input.exclusionKeys.has(knownKey)) continue;

    if (isSeedInDisguise(entry.target, input.seed.target)) continue;
    const similarity = writtenSimilarity(entry.target, input.seed.target);
    if (similarity < MIN_WRITTEN_SIMILARITY) continue;
    seenTarget.add(targetKey);

    const polished = polishPair(
      { text: entry.known, lang: input.languageFrom },
      { text: entry.target, lang: input.languageTo },
      { isSentence: false },
    );
    scored.push({
      item: { known: polished.source.fixed, target: polished.target.fixed },
      similarity,
    });
  }

  return scored
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, input.limit)
    .map((entry) => entry.item);
}
