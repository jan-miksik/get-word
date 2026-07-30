/**
 * What a returning learner is offered as a tappable chip before they type.
 *
 * A first visit gets no chips: generic starter situations ("Travel", "At the
 * office") were guesses that steered the conversation more than they helped it.
 * A learner whose opener says "last time we did X" is different — the brief
 * already knows what they said they wanted and which situations they described,
 * so one chip from it is a concrete next step rather than a guess.
 *
 * Pure and model-free — this runs on every open, from data the context call
 * already returns.
 */

export type FollowUpChipSource = {
  /** Topics the learner asked for but has not studied yet. */
  missingTopics: string[];
  /** Concrete recurring situations they described. */
  situations: string[];
  /** Why they are learning at all. */
  goals: string[];
  /** Topics already committed to their list. */
  coveredTopics: string[];
};

export type FollowUpChip = {
  /** Chip label, i.e. the topic itself. */
  topic: string;
  /**
   * `topic` — "I'd like to work on X"; `continue` — one more pass over the most
   * recent topic, offered only when the brief has nothing else left to suggest.
   */
  kind: 'topic' | 'continue';
};

/**
 * One chip, not a row of them. The intro is meant to read as an invitation to
 * say what you actually need; a menu of topics turns it into a picker, and the
 * second-best suggestion is rarely worth that.
 */
export const FOLLOW_UP_CHIP_LIMIT = 1;

/**
 * Fold away case and diacritics so "Úřední slovníček" and "urední slovnicek"
 * are one topic. Briefs are model-written and the same idea comes back spelled
 * slightly differently between sessions.
 */
function normalizeTopic(topic: string): string {
  return topic
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Same topic, allowing for one label being a longer wording of the other. */
function sameTopic(a: string, b: string): boolean {
  const left = normalizeTopic(a);
  const right = normalizeTopic(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // Containment only for labels long enough that an overlap means something —
  // otherwise a covered "práce" would swallow every unrelated topic.
  const shorter = left.length <= right.length ? left : right;
  const longer = shorter === left ? right : left;
  return shorter.length >= 5 && longer.includes(shorter);
}

/**
 * Build the returning-learner chips, most specific intent first: what they said
 * they still want, then the situations they described, then their goals.
 * Anything already covered is dropped — it is on their list already.
 *
 * Returns an empty array when the brief has nothing to offer; the caller then
 * shows no chip at all.
 */
export function buildFollowUpChips(
  source: FollowUpChipSource,
  limit = FOLLOW_UP_CHIP_LIMIT,
): FollowUpChip[] {
  const covered = source.coveredTopics.filter((topic) => topic.trim().length > 0);
  const chips: FollowUpChip[] = [];

  for (const topic of [...source.missingTopics, ...source.situations, ...source.goals]) {
    if (chips.length >= limit) break;
    const trimmed = topic.trim();
    if (!trimmed) continue;
    if (covered.some((entry) => sameTopic(entry, trimmed))) continue;
    if (chips.some((chip) => sameTopic(chip.topic, trimmed))) continue;
    chips.push({ topic: trimmed, kind: 'topic' });
  }

  // Nothing left to branch into, but we do know what the last session was
  // about. Offering to go deeper there still beats "Talking to customers".
  const lastCovered = covered[covered.length - 1];
  if (chips.length === 0 && lastCovered) {
    chips.push({ topic: lastCovered.trim(), kind: 'continue' });
  }

  return chips;
}
