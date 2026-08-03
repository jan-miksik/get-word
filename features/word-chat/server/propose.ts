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
  EXCLUSION_PROMPT_LIMIT,
  MAX_WORD_CHAT_ITEM_CHARS,
  PROPOSAL_MAX_TOKENS,
  PROPOSAL_REASONING,
  TARGET_ITEM_COUNT,
  WORD_CHAT_PROPOSAL_MODEL,
  WORD_CHAT_PROVIDER_PREFERENCES,
  getServerApiKey,
} from "./config";
import { WordChatUnavailableError } from "./chat";
import { buildProposalPrompt } from "./prompt";
import { proposalDifficultyIssue } from "../difficulty";
import { proposalLanguageIssue } from "../proposalLanguage";
import { toPlainItemText } from "../plainItemText";
import { buildCallDiagnostics, type WordChatCallDiagnostics } from "./diagnostics";
import {
  dedupKey,
  loadCorpusPool,
  loadExclusions,
  loadTakeoverCandidates,
  type CorpusEntry,
} from "./corpus";
import {
  recordWordChatUsage,
  runReservedWordChatCall,
} from "./usage";
import type {
  ProposalResult,
  ProposedItem,
  WordChatContentMode,
  WordChatLanguageLevel,
  WordChatMessage,
} from "../types";
import { firstMeaningfulTopicLabel } from "../topicLabels";

const MAX_CATEGORY_NAME_CHARS = 60;

/**
 * How many attempts may be rejected by the content guards — below the requested
 * level, or written in English instead of the learner's language — before they
 * stand down. One fresh attempt is worth paying for; spending the whole budget
 * on a heuristic would turn a usable list into an error screen.
 */
const QUALITY_RETRY_BUDGET = 1;

type RawItem = {
  kind?: unknown;
  role?: unknown;
  text?: unknown;
  confidence?: unknown;
};

type ProposalItemRole = "sentence" | "category_member" | "situational_expression";

type ValidatedRawItem = {
  kind: "sentence" | "word";
  role: ProposalItemRole;
  text: string;
  confidence?: unknown;
};

type ValidatedInternalProposal = {
  categoryName: string;
  topicLabel: string;
  reviewLabel: string;
  items: ValidatedRawItem[];
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
 * Choose which of the learner's existing items the model is warned about.
 *
 * The full exclusion set is enforced server-side afterwards, so this only
 * decides prompt size. Relevant entries come first — a learner with 3000 words
 * would otherwise spend the whole block on items unrelated to what they just
 * asked for, and the model would propose duplicates we then have to drop.
 */
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
  return typeof value === "string"
    ? toPlainItemText(value).slice(0, MAX_WORD_CHAT_ITEM_CHARS)
    : "";
}

/** Reuse lookup: comparison key → the row to snap a matching proposal onto. */
export type CorpusMatch = {
  id: string;
  text: string;
  verified: boolean;
  takeoverCandidate?: { sourceItemId: string; sourceListName: string };
};

export function corpusPoolByText(pool: CorpusEntry[]): Map<string, CorpusMatch> {
  const byText = new Map<string, CorpusMatch>();
  for (const entry of pool) {
    const key = dedupKey(entry.text);
    // `loadCorpusPool` orders curated rows first, so the first row to claim a
    // key is the best-reviewed one holding that text.
    if (!key || byText.has(key)) continue;
    byText.set(key, {
      id: entry.id,
      text: entry.text,
      verified: entry.verified,
      ...(entry.takeoverEligible && entry.listName
        ? {
            takeoverCandidate: {
              sourceItemId: entry.id,
              sourceListName: entry.listName,
            },
          }
        : {}),
    });
  }
  return byText;
}

export function validateProposalStructure(input: {
  contentMode: WordChatContentMode;
  raw: RawItem[];
}): ValidatedRawItem[] {
  const items = input.raw.map((entry): ValidatedRawItem => {
    const role = entry.role;
    const kind = entry.kind;
    const text = cleanItemText(entry.text);
    const validRole =
      role === "sentence" || role === "category_member" || role === "situational_expression";
    if (!validRole || !text) {
      throw new OpenRouterChatError("Word chat returned an item with an invalid role or text.", true);
    }
    if (
      (role === "sentence" && kind !== "sentence") ||
      (role !== "sentence" && kind !== "word")
    ) {
      throw new OpenRouterChatError("Word chat returned an item whose role does not match its kind.", true);
    }
    return { kind: kind as "sentence" | "word", role, text, confidence: entry.confidence };
  });

  const counts = items.reduce(
    (current, item) => ({ ...current, [item.role]: current[item.role] + 1 }),
    { sentence: 0, category_member: 0, situational_expression: 0 } as Record<ProposalItemRole, number>,
  );
  const expected =
    input.contentMode === "category_inventory"
      ? { sentence: 3, category_member: 7, situational_expression: 0 }
      : input.contentMode === "situation"
        ? { sentence: 3, category_member: 0, situational_expression: 7 }
        : { sentence: 3, category_member: 4, situational_expression: 3 };
  if (
    items.length !== TARGET_ITEM_COUNT ||
    counts.sentence !== expected.sentence ||
    counts.category_member !== expected.category_member ||
    counts.situational_expression !== expected.situational_expression
  ) {
    throw new OpenRouterChatError("Word chat returned an invalid proposal role distribution.", true);
  }
  return items;
}

function parseProposal(
  content: string,
  input: {
    languageFrom: string;
    languageLevel: WordChatLanguageLevel;
    contentMode: WordChatContentMode;
    /**
     * False once the retry budget is spent. Both guards are heuristics, so a
     * batch they dislike is still a usable list; failing the whole request over
     * one would trade slightly-too-easy words for a generic error screen.
     */
    enforceQuality: boolean;
  },
): ValidatedInternalProposal {
  const parsed = parseJsonLoose(content) as Record<string, unknown> | null;
  const raw = Array.isArray(parsed?.items) ? (parsed.items as RawItem[]) : null;
  if (!raw || raw.length === 0) {
    throw new OpenRouterChatError("Word chat returned no proposed items.", true);
  }
  const items = validateProposalStructure({ contentMode: input.contentMode, raw });
  if (input.enforceQuality) {
    // Language first: a batch in the wrong language is unusable, whatever its
    // level, and a retry is the only thing that can fix it.
    const languageIssue = proposalLanguageIssue({
      languageFrom: input.languageFrom,
      items,
    });
    if (languageIssue) {
      throw new OpenRouterChatError(
        `Word chat returned a proposal in the wrong language: ${languageIssue}.`,
        true,
      );
    }

    const difficultyIssue = proposalDifficultyIssue({
      level: input.languageLevel,
      languageFrom: input.languageFrom,
      items,
    });
    if (difficultyIssue) {
      throw new OpenRouterChatError(
        `Word chat returned a proposal below the requested level: ${difficultyIssue}.`,
        true,
      );
    }
  }
  const rawCategoryName = cleanLabel(parsed?.categoryName, "", MAX_CATEGORY_NAME_CHARS);
  const rawTopicLabel = cleanLabel(parsed?.topicLabel, "", MAX_CATEGORY_NAME_CHARS);
  const categoryName =
    firstMeaningfulTopicLabel(rawCategoryName, rawTopicLabel) || "My words";
  return {
    categoryName,
    // Do not fall back to the editable category here: it may intentionally
    // contain a person's name. The dedicated topic is privacy-constrained by
    // the prompt; if it is absent, the brief pass can infer a safe label from
    // the conversation instead.
    topicLabel: firstMeaningfulTopicLabel(rawTopicLabel),
    reviewLabel: cleanLabel(parsed?.reviewLabel, "General vocabulary", MAX_CATEGORY_NAME_CHARS),
    items,
  };
}

/**
 * Turn raw model output into items we are willing to show.
 *
 * Two jobs. First, the guarantee the prompt cannot give: the exclusion list is
 * re-applied after normalization, duplicates within the batch are dropped, and
 * the result is clamped. A prompt rule is a hint; this is the check.
 *
 * Second, reuse. The model was told nothing about existing content, so every
 * item arrives as free text; anything whose comparison key matches an existing
 * item is snapped onto that row. The row's own spelling wins, which is what
 * makes the reused translation and audio downstream safe to attach.
 */
export function materializeProposedItems(input: {
  raw: RawItem[];
  exclusionKeys: Set<string>;
  maxItems?: number;
  /**
   * Comparison key → existing row, built from `loadCorpusPool`. Absent in tests
   * and when the pair has no content yet, in which case everything stays
   * generated and gets a fresh translation.
   */
  corpusTextRefs?: Map<string, CorpusMatch>;
}): ProposedItem[] {
  const seen = new Set<string>();
  const items: ProposedItem[] = [];
  const limit = input.maxItems ?? MAX_ITEMS_PER_SESSION;

  for (const entry of input.raw) {
    const kind = entry.kind === "sentence" ? "sentence" : "word";
    const confidence = normalizeConfidence(entry.confidence);

    let text = cleanItemText(entry.text);
    if (!text) continue;

    const match = input.corpusTextRefs?.get(dedupKey(text));
    // The existing row's exact text replaces the model's near-miss ("Chtít." →
    // "chtít"), so the pair the learner saves is the pair that was translated
    // and voiced, character for character.
    if (match) text = match.text;

    const key = dedupKey(text);
    if (!key || seen.has(key) || input.exclusionKeys.has(key)) continue;
    seen.add(key);

    items.push(
      match
        ? {
            kind,
            confidence,
            source: "corpus",
            corpusItemId: match.id,
            verified: match.verified,
            text,
            ...(match.takeoverCandidate
              ? { takeoverCandidate: match.takeoverCandidate }
              : {}),
          }
        : { kind, confidence, source: "generated", text },
    );

    if (items.length >= limit) break;
  }

  return items;
}

/**
 * Public boundary for a proposal. Roles exist only on the validated internal
 * document; everything after this point is the established client item shape.
 */
export function materializeProposal(input: {
  validated: ValidatedInternalProposal;
  exclusionKeys: Set<string>;
  maxItems?: number;
  corpusTextRefs?: Map<string, CorpusMatch>;
}): ProposedItem[] {
  return materializeProposedItems({
    raw: input.validated.items,
    exclusionKeys: input.exclusionKeys,
    maxItems: input.maxItems,
    corpusTextRefs: input.corpusTextRefs,
  });
}

/**
 * Build the proposal: conversation + exclusions in, ~10 known-language items
 * out, then matched against existing content on the way back.
 *
 * The reuse pool is loaded in parallel with the model call's inputs but never
 * sent to it — see `buildProposalPrompt`. Nothing is written to the database
 * here; the whole proposal is draft state until the learner confirms in Review.
 */
export async function proposeItems(input: {
  userId: string;
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  languageLevel: WordChatLanguageLevel;
  contentMode: WordChatContentMode;
  brief: LearnerBrief | null;
  messages: WordChatMessage[];
  baseListId?: string;
  /** Editor override from the debug panel; falls back to the configured model. */
  model?: string;
  /** Include the exact request in the diagnostics. Editors only. */
  includeRequest?: boolean;
}): Promise<ProposalResult & { diagnostics: WordChatCallDiagnostics }> {
  const apiKey = getServerApiKey();
  if (!apiKey) throw new WordChatUnavailableError();

  const model = input.model || WORD_CHAT_PROPOSAL_MODEL;
  const startedAt = Date.now();

  // The reuse pool is not part of the prompt any more, so it does not have to
  // be ready before the model call — only before the reply is processed. It
  // loads alongside the call instead of ahead of it, which is what keeps a
  // widening pool off the learner's critical path.
  //
  // A failure here degrades rather than fails the session: every item stays
  // "generated" and gets a fresh translation, which is what would have happened
  // without a pool anyway.
  const corpusPoolPromise = Promise.all([
    loadTakeoverCandidates({
      userId: input.userId,
      languageFrom: input.languageFrom,
      languageTo: input.languageTo,
      baseListId: input.baseListId,
    }),
    loadCorpusPool({
      languageFrom: input.languageFrom,
      languageTo: input.languageTo,
    }),
  ])
    .then(([takeover, corpus]) => [...takeover, ...corpus])
    .catch((err): CorpusEntry[] => {
      console.error("[word-chat] reuse pool unavailable, proposing without it", err);
      return [];
    });

  const exclusions = await loadExclusions({
    userId: input.userId,
    languageFrom: input.languageFrom,
    languageTo: input.languageTo,
  });

  const exclusionKeys = new Set(exclusions.map(dedupKey).filter(Boolean));
  const promptExclusions = selectPromptExclusions({
    exclusions,
    messages: input.messages,
    brief: input.brief,
  });

  const { system, user } = buildProposalPrompt({
    languageFrom: input.languageFrom,
    languageTo: input.languageTo,
    chatLanguage: input.chatLanguage,
    languageLevel: input.languageLevel,
    contentMode: input.contentMode,
    messages: input.messages,
    brief: input.brief,
    exclusions: promptExclusions,
  });

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];

  // `parse` runs once per attempt inside the shared retry loop, so counting
  // calls here is what tells the guards which attempt they are on.
  let qualityAttempts = 0;

  const paid = await runReservedWordChatCall(
    {
      userId: input.userId,
      sessionId: input.sessionId,
      callType: "proposal",
      stage: "proposal_completed",
      model,
      request: {
        maxTokens: PROPOSAL_MAX_TOKENS,
        reasoning: PROPOSAL_REASONING,
        responseFormat: { type: "json_object" },
        provider: WORD_CHAT_PROVIDER_PREFERENCES,
        messages,
      },
      maxOutputTokens: PROPOSAL_MAX_TOKENS,
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
          maxTokens: PROPOSAL_MAX_TOKENS,
          reasoning: { ...PROPOSAL_REASONING },
          responseFormat: { type: "json_object" },
          provider: { ...WORD_CHAT_PROVIDER_PREFERENCES },
          messages,
          onResponse,
          onAttemptStart,
        },
        (content) => {
          qualityAttempts += 1;
          return parseProposal(content, {
            languageFrom: input.languageFrom,
            languageLevel: input.languageLevel,
            contentMode: input.contentMode,
            enforceQuality: qualityAttempts <= QUALITY_RETRY_BUDGET,
          });
        },
      ),
  );
  const { value } = paid.result;
  const meta = paid.meta;

  // An entry the learner already studies is not reuse material: matching onto it
  // would only produce an item the exclusion check drops a line later.
  const corpusTextRefs = corpusPoolByText(
    (await corpusPoolPromise).filter((entry) => !exclusionKeys.has(dedupKey(entry.text))),
  );

  const items = materializeProposal({
    validated: value,
    exclusionKeys,
    corpusTextRefs,
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
    reservation: paid.reservation,
    minimumCostUsd: paid.minimumCostUsd,
  });

  if (items.length === 0) {
    throw new OpenRouterChatError("Word chat produced no usable items.", false);
  }

  return {
    categoryName: value.categoryName,
    topicLabel: value.topicLabel,
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
