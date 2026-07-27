/**
 * Structured memory of what a learner told the word-chat, stored on their
 * personal list (`word_lists.learner_brief`) and fed back into the next
 * session so the second chat does not start from a blank slate.
 *
 * Deliberately a bounded schema rather than a free-text summary: a free
 * summary accumulates names, addresses, health details, employers and family
 * over time. Every field here is either a short topical label or an enum, and
 * the model is instructed to keep it that way.
 *
 * Chat transcripts are never stored. After each commit the previous brief plus
 * the new session produce a REPLACEMENT brief; there is no append log.
 */

export const LEARNER_BRIEF_VERSION = 1;

const LEARNER_BRIEF_REGISTERS = ["formal", "neutral", "casual"] as const;

type LearnerBriefRegister = (typeof LEARNER_BRIEF_REGISTERS)[number];

export type LearnerBrief = {
  version: number;
  /** Why they are learning, e.g. "talk to salon clients". */
  goals: string[];
  /** Concrete recurring situations, e.g. "booking appointments". */
  situations: string[];
  /** Topics already covered by committed categories. */
  coveredTopics: string[];
  /** Topics the learner wants but has not covered yet. */
  missingTopics?: string[];
  preferredRegister?: LearnerBriefRegister;
  updatedAt: string;
};

/** Caps that keep the brief small enough to inline in every prompt. */
export const LEARNER_BRIEF_LIMITS = {
  maxEntries: 12,
  maxEntryChars: 80,
} as const;

function normalizeEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim().slice(0, LEARNER_BRIEF_LIMITS.maxEntryChars);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= LEARNER_BRIEF_LIMITS.maxEntries) break;
  }
  return result;
}

function normalizeRegister(value: unknown): LearnerBriefRegister | undefined {
  return LEARNER_BRIEF_REGISTERS.includes(value as LearnerBriefRegister)
    ? (value as LearnerBriefRegister)
    : undefined;
}

/**
 * Coerce anything (model output, a legacy row, undefined) into a valid brief.
 * Unknown keys are dropped rather than merged: the whole point of the schema is
 * that the model cannot smuggle free text into storage.
 */
export function normalizeLearnerBrief(input: unknown, now = new Date()): LearnerBrief {
  const source = (input ?? {}) as Record<string, unknown>;
  const register = normalizeRegister(source.preferredRegister);
  const missingTopics = normalizeEntries(source.missingTopics);

  return {
    version: LEARNER_BRIEF_VERSION,
    goals: normalizeEntries(source.goals),
    situations: normalizeEntries(source.situations),
    coveredTopics: normalizeEntries(source.coveredTopics),
    ...(missingTopics.length > 0 ? { missingTopics } : {}),
    ...(register ? { preferredRegister: register } : {}),
    updatedAt: now.toISOString(),
  };
}

/** True when the brief carries nothing worth sending back to the model. */
export function isLearnerBriefEmpty(brief: LearnerBrief | null | undefined): boolean {
  if (!brief) return true;
  return (
    brief.goals.length === 0 &&
    brief.situations.length === 0 &&
    brief.coveredTopics.length === 0 &&
    (brief.missingTopics?.length ?? 0) === 0 &&
    !brief.preferredRegister
  );
}

/**
 * Merge a freshly committed category's topic into an existing brief without a
 * model call. Used as the cheap path (and the fallback when brief regeneration
 * fails) so `coveredTopics` never silently goes stale.
 */
export function withCoveredTopic(
  brief: LearnerBrief | null | undefined,
  topic: string,
  now = new Date(),
): LearnerBrief {
  const base = normalizeLearnerBrief(brief ?? {}, now);
  const trimmed = topic.trim().slice(0, LEARNER_BRIEF_LIMITS.maxEntryChars);
  if (!trimmed) return base;
  const alreadyCovered = base.coveredTopics.some(
    (entry) => entry.toLowerCase() === trimmed.toLowerCase(),
  );
  if (alreadyCovered) return base;
  return {
    ...base,
    coveredTopics: [...base.coveredTopics, trimmed].slice(
      -LEARNER_BRIEF_LIMITS.maxEntries,
    ),
    missingTopics: base.missingTopics?.filter(
      (entry) => entry.toLowerCase() !== trimmed.toLowerCase(),
    ),
  };
}
