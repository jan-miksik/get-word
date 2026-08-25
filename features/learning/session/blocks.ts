import { TIME_PHASE_SHARES } from './timeCountdown';

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
  /**
   * Which stretch of a minutes day this block belongs to, 0–2. Present only on
   * a time plan: a words day is walked block by block, a minutes day is walked
   * by the clock, and the phase is what ties one to the other.
   */
  phase?: number;
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

function push(
  blocks: SessionBlock[],
  kind: SessionBlockKind,
  ids: string[],
  options: { pass?: number; phase?: number } = {},
): void {
  if (ids.length === 0) return;
  const key = `${kind}-${blocks.filter((block) => block.kind === kind).length}`;
  const block: SessionBlock = { key, kind, ids };
  if (options.pass && options.pass > 1) block.pass = options.pass;
  if (options.phase !== undefined) block.phase = options.phase;
  blocks.push(block);
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
    else if (input.fillWithRepeats) push(blocks, 'review', batch, { pass: 2 });
  });
  return blocks;
}

export interface TimeSessionBlockPlanInput {
  /** Every repeat the day selected, in the order it should be met. */
  reviewIds: readonly string[];
  newIds: readonly string[];
  /** How many items the budget was estimated to hold; sizes the stretches. */
  itemBudget: number;
  /** Close on same-day repeats when the day has no real repeats of its own. */
  fillWithRepeats?: boolean;
  /** Coming back after a long absence: open on new ground, not on the backlog. */
  openOnNew?: boolean;
}

/**
 * Shapes a minutes day into its three time stretches.
 *
 * The clock, not a card count, decides when one stretch ends — see
 * `timePhaseIndex` — so a block here is not a quota to finish but the material
 * that stretch is allowed to draw on:
 *
 *   0–30%   repeats, or new words when there is nothing to repeat
 *   30–60%  the day's new ground
 *   60–100% the rest of the repeats, then any new words still unmet
 *
 * Each stretch is stocked with its own share of the day's estimated items, so a
 * learner moving at the expected pace arrives at each boundary having just
 * finished the material in front of it. Running out early is not a failure: the
 * session simply falls forward into the next stretch.
 */
export function planTimeSessionBlocks(input: TimeSessionBlockPlanInput): SessionBlock[] {
  const review = [...input.reviewIds];
  const fresh = [...input.newIds];
  if (review.length === 0 && fresh.length === 0) return [];

  const budget = Math.max(input.itemBudget, review.length + fresh.length);
  const share = (index: number) => Math.max(1, Math.round(budget * TIME_PHASE_SHARES[index]));

  const blocks: SessionBlock[] = [];
  // A day with nothing to repeat opens on new ground rather than on an empty
  // warm-up the learner would only see as a skipped stretch. So does a return
  // after a long absence, where the backlog is the worst possible welcome.
  const openOnNew = fresh.length > 0 && (review.length === 0 || input.openOnNew === true);
  const openingKind: SessionBlockKind = openOnNew ? 'new' : 'review';
  const opening = openOnNew ? fresh.splice(0, share(0)) : review.splice(0, share(0));
  push(blocks, openingKind, opening, { phase: 0 });

  push(blocks, 'new', fresh.splice(0, share(1)), { phase: 1 });

  // The tail: repeats first, because closing on consolidation is the point of
  // the shape, and only then whatever new words the earlier stretches could not
  // hold — the "if there is still time" part of the plan.
  push(blocks, 'review', review.splice(0), { phase: 2 });
  push(blocks, 'new', fresh.splice(0), { phase: 2 });

  // Not enough real repeats to fill the closing stretch: the words met today
  // come back for a second pass, so the day still ends on consolidation rather
  // than on unknown words — or, worse, on an empty stretch that would close the
  // day at sixty per cent of its own budget.
  if (input.fillWithRepeats) push(blocks, 'review', [...input.newIds], { pass: 2, phase: 2 });
  return blocks;
}
