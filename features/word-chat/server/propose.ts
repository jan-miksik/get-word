import {
  OpenRouterChatError,
  callOpenRouterChatParsedWithMeta,
  parseJsonLoose,
} from "@/lib/openrouter-chat";
import type { LearnerBrief } from "@/lib/learner-brief";
import {
  MAX_ITEMS_PER_SESSION,
  OPENROUTER_API_URL,
  OPENROUTER_MAX_ATTEMPTS,
  OPENROUTER_RETRY_BASE_DELAY_MS,
  OPENROUTER_TIMEOUT_MS,
  CORPUS_PROMPT_LIMIT,
  EXCLUSION_PROMPT_LIMIT,
  PROPOSAL_MAX_TOKENS,
  TARGET_ITEM_COUNT,
  WORD_CHAT_PROPOSAL_MODEL,
  WORD_CHAT_PROVIDER_PREFERENCES,
  getServerApiKey,
} from "./config";
import { WordChatUnavailableError } from "./chat";
import { buildProposalPrompt } from "./prompt";
import { buildCallDiagnostics, type WordChatCallDiagnostics } from "./diagnostics";
import {
  dedupKey,
  loadCorpusItems,
  loadCorpusPool,
  loadExclusions,
  type CorpusEntry,
} from "./corpus";
import { recordWordChatUsage } from "./usage";
import type { ProposalResult, ProposedItem, WordChatMessage } from "../types";

const MAX_CATEGORY_NAME_CHARS = 60;
const MAX_ITEM_CHARS = 200;

type RawItem = {
  kind?: unknown;
  source?: unknown;
  text?: unknown;
  corpusItemId?: unknown;
  confidence?: unknown;
};

const TOKEN_STOPWORDS = new Set([
  "and",
  "are",
  "for",
  "the",
  "this",
  "that",
  "you",
  "your",
  "but",
  "with",
  "bez",
  "co",
  "jak",
  "jako",
  "jsem",
  "jsi",
  "jsou",
  "kde",
  "kdy",
  "ktery",
  "ktera",
  "ktere",
  "mam",
  "pro",
  "ten",
  "to",
  "ty",
  "uz",
  "ve",
  "v",
  "va",
  "la",
  "cua",
  "cho",
  "toi",
  "ban",
]);

function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function tokenizeForSearch(text: string): string[] {
  return Array.from(normalizeSearchText(text).matchAll(/[\p{L}\p{N}]+/gu), (match) => match[0])
    .filter((token) => token.length >= 3 && !TOKEN_STOPWORDS.has(token));
}

function contextText(input: {
  messages: WordChatMessage[];
  brief: LearnerBrief | null;
}): string {
  const brief = input.brief;
  return [
    ...input.messages.map((message) => message.content),
    ...(brief?.goals ?? []),
    ...(brief?.situations ?? []),
    ...(brief?.missingTopics ?? []),
    brief?.preferredRegister ?? "",
  ].join(" ");
}

function searchTerms(input: {
  messages: WordChatMessage[];
  brief: LearnerBrief | null;
}): Set<string> {
  return new Set(tokenizeForSearch(contextText(input)));
}

function scoreTextForPrompt(text: string, terms: Set<string>): number {
  if (terms.size === 0) return 0;

  const tokens = tokenizeForSearch(text);
  const tokenSet = new Set(tokens);
  const stems = new Set(tokens.filter((token) => token.length >= 4).map((token) => token.slice(0, 4)));

  let score = 0;
  for (const term of terms) {
    if (tokenSet.has(term)) {
      score += 3;
      continue;
    }
    if (term.length >= 4 && stems.has(term.slice(0, 4))) score += 1;
  }
  return score;
}

function rankPromptTexts<T>(
  rows: T[],
  textForRow: (row: T) => string,
  terms: Set<string>,
  limit: number,
): T[] {
  if (limit <= 0) return [];
  if (rows.length <= limit) return rows;

  const scored = rows.map((row, index) => ({
    row,
    index,
    score: scoreTextForPrompt(textForRow(row), terms),
  }));

  const pickedIndexes = new Set<number>();
  const picked: T[] = [];

  for (const entry of scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)) {
    pickedIndexes.add(entry.index);
    picked.push(entry.row);
    if (picked.length >= limit) return picked;
  }

  for (const entry of scored) {
    if (pickedIndexes.has(entry.index)) continue;
    picked.push(entry.row);
    if (picked.length >= limit) return picked;
  }

  return picked;
}

/**
 * Keep the model-facing corpus small without losing deterministic reuse.
 *
 * The DB query intentionally loads a wider curated/common pool. This step uses
 * the learner's current conversation and bounded brief to put relevant entries
 * first, then backfills from curated order so a vague "basics" request still has
 * high-quality reusable material.
 */
export function selectPromptCorpusPool(input: {
  pool: CorpusEntry[];
  messages: WordChatMessage[];
  brief: LearnerBrief | null;
  limit?: number;
}): CorpusEntry[] {
  const terms = searchTerms({ messages: input.messages, brief: input.brief });
  return rankPromptTexts(
    input.pool,
    (entry) => `${entry.categoryName ?? ""} ${entry.text}`,
    terms,
    input.limit ?? CORPUS_PROMPT_LIMIT,
  );
}

export function selectPromptExclusions(input: {
  exclusions: string[];
  messages: WordChatMessage[];
  brief: LearnerBrief | null;
  limit?: number;
}): string[] {
  const terms = searchTerms({ messages: input.messages, brief: input.brief });
  return rankPromptTexts(
    input.exclusions,
    (text) => text,
    terms,
    input.limit ?? EXCLUSION_PROMPT_LIMIT,
  );
}

function cleanLabel(value: unknown, fallback: string, maxChars: number): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return (text || fallback).slice(0, maxChars);
}

function normalizeConfidence(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.min(1, Math.max(0, parsed));
}

function cleanItemText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, MAX_ITEM_CHARS) : "";
}

function corpusPoolByText(pool: CorpusEntry[]): Map<string, string> {
  const byText = new Map<string, string>();
  for (const entry of pool) {
    const key = dedupKey(entry.text);
    if (!key || byText.has(key)) continue;
    byText.set(key, entry.id);
  }
  return byText;
}

function parseProposal(content: string): {
  categoryName: string;
  reviewLabel: string;
  raw: RawItem[];
} {
  const parsed = parseJsonLoose(content) as Record<string, unknown> | null;
  const raw = Array.isArray(parsed?.items) ? (parsed.items as RawItem[]) : null;
  if (!raw || raw.length === 0) {
    throw new OpenRouterChatError("Word chat returned no proposed items.", true);
  }
  return {
    categoryName: cleanLabel(parsed?.categoryName, "My words", MAX_CATEGORY_NAME_CHARS),
    reviewLabel: cleanLabel(parsed?.reviewLabel, "General vocabulary", MAX_CATEGORY_NAME_CHARS),
    raw,
  };
}

/**
 * Turn raw model output into items we are willing to show.
 *
 * This is where the model's promises get checked rather than trusted: corpus
 * ids must resolve to rows that still exist, the exclusion list is re-applied
 * after normalization (case-folded), duplicates within the batch are dropped,
 * and the result is clamped. A prompt rule is a quality hint; this is the
 * guarantee.
 */
export async function materializeProposedItems(input: {
  raw: RawItem[];
  exclusionKeys: Set<string>;
  maxItems?: number;
  /**
   * Text-key lookup for verified corpus rows. The model sometimes repeats an
   * offered corpus text as a "generated" item instead of returning its ref; when
   * the text is an exact normalized match, promote it back to corpus so the
   * reviewed translation/audio are reused.
   */
  corpusTextRefs?: Map<string, string>;
  /**
   * Maps the short refs the prompt used (`c7`) back to real item ids. Absent in
   * tests and whenever the pool was empty, in which case the model's value is
   * taken at face value and simply has to resolve.
   */
  corpusRefs?: Map<string, string>;
}): Promise<ProposedItem[]> {
  const resolveRef = (ref: string): string | null =>
    input.corpusRefs ? input.corpusRefs.get(ref) ?? null : ref;

  const corpusIds = input.raw
    .filter((item) => item.source === "corpus" && typeof item.corpusItemId === "string")
    .map((item) => resolveRef(item.corpusItemId as string))
    .filter((id): id is string => Boolean(id));
  const generatedCorpusIds = input.raw
    .filter((item) => item.source !== "corpus")
    .map((item) => input.corpusTextRefs?.get(dedupKey(cleanItemText(item.text))))
    .filter((id): id is string => Boolean(id));
  const corpusItems = await loadCorpusItems([...new Set([...corpusIds, ...generatedCorpusIds])]);

  const seen = new Set<string>();
  const items: ProposedItem[] = [];
  const limit = input.maxItems ?? MAX_ITEMS_PER_SESSION;

  for (const entry of input.raw) {
    const kind = entry.kind === "sentence" ? "sentence" : "word";
    const confidence = normalizeConfidence(entry.confidence);

    let text: string;
    let corpusItemId: string | undefined;

    if (entry.source === "corpus" && typeof entry.corpusItemId === "string") {
      const resolvedId = resolveRef(entry.corpusItemId);
      const row = resolvedId ? corpusItems.get(resolvedId) : undefined;
      // A hallucinated or deleted id is dropped, not silently downgraded to a
      // generated item: the model was told to reuse something specific, and we
      // have no idea what it meant.
      if (!row) continue;
      text = row.textKnown;
      corpusItemId = row.id;
    } else {
      text = cleanItemText(entry.text);
      const matchedCorpusId = input.corpusTextRefs?.get(dedupKey(text));
      const row = matchedCorpusId ? corpusItems.get(matchedCorpusId) : undefined;
      if (row) {
        text = row.textKnown;
        corpusItemId = row.id;
      }
    }

    if (!text) continue;

    const key = dedupKey(text);
    if (!key || seen.has(key) || input.exclusionKeys.has(key)) continue;
    seen.add(key);

    items.push(
      corpusItemId
        ? { kind, confidence, source: "corpus", corpusItemId, verified: true, text }
        : { kind, confidence, source: "generated", text },
    );

    if (items.length >= limit) break;
  }

  return items;
}

/**
 * Build the proposal: conversation + verified corpus pool + exclusions in, ~10
 * known-language items out. Nothing is written to the database here — the whole
 * proposal is draft state until the learner confirms in Review.
 */
export async function proposeItems(input: {
  userId: string;
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  brief: LearnerBrief | null;
  messages: WordChatMessage[];
  /** Editor override from the debug panel; falls back to the configured model. */
  model?: string;
  /** Include the exact request in the diagnostics. Editors only. */
  includeRequest?: boolean;
}): Promise<ProposalResult & { diagnostics: WordChatCallDiagnostics }> {
  const apiKey = getServerApiKey();
  if (!apiKey) throw new WordChatUnavailableError();

  const model = input.model || WORD_CHAT_PROPOSAL_MODEL;
  const startedAt = Date.now();

  const [corpusPool, exclusions] = await Promise.all([
    loadCorpusPool({
      languageFrom: input.languageFrom,
      languageTo: input.languageTo,
    }),
    loadExclusions({
      userId: input.userId,
      languageFrom: input.languageFrom,
      languageTo: input.languageTo,
    }),
  ]);

  const exclusionKeys = new Set(exclusions.map(dedupKey).filter(Boolean));
  // A corpus entry the learner already studies is not reuse material.
  const offeredPool = corpusPool.filter((entry) => !exclusionKeys.has(dedupKey(entry.text)));
  const corpusTextRefs = corpusPoolByText(offeredPool);
  const promptPool = selectPromptCorpusPool({
    pool: offeredPool,
    messages: input.messages,
    brief: input.brief,
  });
  const promptExclusions = selectPromptExclusions({
    exclusions,
    messages: input.messages,
    brief: input.brief,
  });

  // Short refs in the prompt, real ids on the way back. The pool is the single
  // biggest part of this request, and UUIDs were most of it.
  const corpusRefs = new Map<string, string>();
  const offeredEntries = promptPool.map((entry, index) => {
    const ref = `c${index + 1}`;
    corpusRefs.set(ref, entry.id);
    return { ref, text: entry.text };
  });

  const { system, user } = buildProposalPrompt({
    languageFrom: input.languageFrom,
    languageTo: input.languageTo,
    chatLanguage: input.chatLanguage,
    messages: input.messages,
    brief: input.brief,
    corpusPool: offeredEntries,
    exclusions: promptExclusions,
  });

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];

  const { value, meta } = await callOpenRouterChatParsedWithMeta(
    {
      apiKey,
      model,
      apiUrl: OPENROUTER_API_URL,
      maxAttempts: OPENROUTER_MAX_ATTEMPTS,
      retryBaseDelayMs: OPENROUTER_RETRY_BASE_DELAY_MS,
      timeoutMs: OPENROUTER_TIMEOUT_MS,
      maxTokens: PROPOSAL_MAX_TOKENS,
      responseFormat: { type: "json_object" },
      provider: { ...WORD_CHAT_PROVIDER_PREFERENCES },
      messages,
    },
    parseProposal,
  );

  const items = await materializeProposedItems({
    raw: value.raw,
    exclusionKeys,
    corpusTextRefs,
    corpusRefs,
    // Ask for ~10 but accept a couple more rather than discarding good items;
    // the session cap is enforced separately, on what the learner keeps.
    maxItems: Math.min(TARGET_ITEM_COUNT + 4, MAX_ITEMS_PER_SESSION),
  });

  await recordWordChatUsage({
    userId: input.userId,
    sessionId: input.sessionId,
    callType: "proposal",
    stage: "proposal_completed",
    model,
    meta,
    itemCount: items.length,
  });

  if (items.length === 0) {
    throw new OpenRouterChatError("Word chat produced no usable items.", false);
  }

  return {
    categoryName: value.categoryName,
    reviewLabel: value.reviewLabel,
    items,
    diagnostics: buildCallDiagnostics({
      callType: "proposal",
      model,
      meta,
      startedAt,
      ...(input.includeRequest
        ? {
            request: {
              maxTokens: PROPOSAL_MAX_TOKENS,
              provider: WORD_CHAT_PROVIDER_PREFERENCES,
              messages,
            },
          }
        : {}),
    }),
  };
}
