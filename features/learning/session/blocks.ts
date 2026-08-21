export type SessionBlockKind = 'review' | 'new';

export interface SessionBlock {
  /** Stable within a stored daily plan. */
  key: string;
  kind: SessionBlockKind;
  ids: string[];
  /**
   * How many answers today each id owes this block. Everything is a single
   * pass except a same-day repeat of words first met earlier in the very same
   * session — the only review a learner with no repeats due can get, and the
   * reason a first day is still shaped `new → review` rather than one long
   * march through unknown words.
   */
  pass?: number;
}

export interface SessionBlockPlanInput {
  /** Repeats that open the day. Empty on a first day, or after a long absence. */
  warmUpIds: readonly string[];
  newIds: readonly string[];
  /** Repeats that close the day and carry it to the goal. */
  closingReviewIds: readonly string[];
  /**
   * Fill a closing block with same-day repeats of the new words just seen when
   * real repeats run out. Without this a beginner's day is new words only.
   */
  fillWithRepeats?: boolean;
}

/** Heuristic for cadence, not a maximum size of an individual block. */
const TARGET_NEW_PER_BATCH = 8;
const MAX_NEW_BATCHES = 3;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Splits a positive total deterministically, allocating remainders from the front. */
function splitEvenly(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

function slice(ids: readonly string[], sizes: readonly number[]): string[][] {
  let offset = 0;
  return sizes.map((size) => {
    const part = ids.slice(offset, offset + size);
    offset += size;
    return part;
  });
}

function push(blocks: SessionBlock[], kind: SessionBlockKind, ids: string[], pass?: number): void {
  if (ids.length === 0) return;
  const key = `${kind}-${blocks.filter((block) => block.kind === kind).length}`;
  blocks.push(pass && pass > 1 ? { key, kind, ids, pass } : { key, kind, ids });
}

/**
 * Shapes an already-selected day into blocks without reordering anything.
 *
 * The day reads `review → new → review`: warm up on words already known, meet
 * the new ones while attention is freshest, then close on repeats — so the last
 * thing the day does is consolidate rather than pile on. A large batch of new
 * words is split across up to three passes with review in between, because
 * twenty unknown words in one unbroken run is the hardest possible way to meet
 * them.
 *
 * Whatever repeats are left over after the day's plan is deliberately NOT here:
 * it is a bonus offered once the day is closed, not a fourth block the learner
 * has to finish to be done.
 */
export function planSessionBlocks(input: SessionBlockPlanInput): SessionBlock[] {
  const warmUpIds = [...input.warmUpIds];
  const newIds = [...input.newIds];
  const closingReviewIds = [...input.closingReviewIds];
  if (warmUpIds.length === 0 && newIds.length === 0 && closingReviewIds.length === 0) return [];

  const blocks: SessionBlock[] = [];
  push(blocks, 'review', warmUpIds);

  if (newIds.length === 0) {
    push(blocks, 'review', closingReviewIds);
    return blocks;
  }

  // Every new batch must have something to close on, or the day would end on
  // unknown words. Without same-day repeats to fall back on, the number of
  // batches is capped by how many real repeats there are to space them with.
  const desiredBatches = clamp(Math.round(newIds.length / TARGET_NEW_PER_BATCH), 1, MAX_NEW_BATCHES);
  const batchCount = input.fillWithRepeats
    ? desiredBatches
    : Math.min(desiredBatches, Math.max(1, closingReviewIds.length));
  const newBatches = slice(newIds, splitEvenly(newIds.length, batchCount));
  const reviewParts = slice(closingReviewIds, splitEvenly(closingReviewIds.length, batchCount));

  newBatches.forEach((batch, index) => {
    push(blocks, 'new', batch);
    const review = reviewParts[index] ?? [];
    if (review.length > 0) push(blocks, 'review', review);
    // A day with no repeats of its own still closes on review: the words from
    // the batch just seen come back for a second pass.
    else if (input.fillWithRepeats) push(blocks, 'review', batch, 2);
  });
  return blocks;
}
