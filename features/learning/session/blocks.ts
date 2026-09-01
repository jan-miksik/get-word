export type SessionBlockKind = 'review' | 'new';

export interface SessionBlock {
  /** Stable within a stored daily plan. */
  key: string;
  kind: SessionBlockKind;
  ids: string[];
  /**
   * How many answers today each id owes this block. Everything is a single
   * pass except a same-day repeat of words first met earlier in the very same
   * session. That second answer is the immediate reinforcement following every
   * new-word block.
   */
  pass?: number;
  /**
   * A same-session check of words introduced by the preceding new block.
   * It uses the word's current (normally five-minute) exercise configuration;
   * its result completes the session block without changing the SRS stage or
   * the already scheduled due date.
   */
  reinforcement?: true;
  /**
   * Which stretch of a minutes day this block belongs to, 0–2. Present only on
   * a time plan: a words day is walked block by block, a minutes day is walked
   * by the clock, and the phase is what ties one to the other.
   */
  phase?: number;
}

export interface SessionBlockPlanInput {
  /** Every repeat the day selected, in the order it should be met. */
  reviewIds: readonly string[];
  newIds: readonly string[];
  /**
   * Open on new ground rather than on repeats. A day with no repeats at all
   * opens on new words whether this is set or not.
   *
   * No caller sets it today: a words day with a fixed new-word count is always
   * `due → new → reinforcement`, so the after-an-absence reordering was dropped
   * from `planSession`. Kept deliberately for the time goal, where the mix is
   * dynamic and opening on new ground may earn its place again.
   */
  openOnNew?: boolean;
  /**
   * Close the introduction with a second pass over the new words just seen.
   * The pass is session reinforcement, not an SRS review.
   */
  fillWithRepeats?: boolean;
}

function push(
  blocks: SessionBlock[],
  kind: SessionBlockKind,
  ids: string[],
  options: { pass?: number; phase?: number; reinforcement?: true } = {},
): void {
  if (ids.length === 0) return;
  const key = `${kind}-${blocks.filter((block) => block.kind === kind).length}`;
  const block: SessionBlock = { key, kind, ids };
  if (options.pass && options.pass > 1) block.pass = options.pass;
  if (options.phase !== undefined) block.phase = options.phase;
  if (options.reinforcement) block.reinforcement = true;
  blocks.push(block);
}

/**
 * Shapes an already-selected day into its learning stretches.
 *
 * Someone who already has words opens on due repeats, then learns a bounded
 * batch of new words, then immediately checks that same batch once. A beginner
 * has no opening repeat block, so the same rule naturally collapses to
 * `new → reinforcement`.
 *
 * Three logical slots, never more. Empty slots disappear rather than producing
 * a blank transition.
 *
 * Whatever repeats are left over after the day's plan is deliberately NOT here:
 * it is a bonus offered once the day is closed, not a third stretch the learner
 * has to finish to be done.
 */
export function planSessionBlocks(input: SessionBlockPlanInput): SessionBlock[] {
  const reviewIds = [...input.reviewIds];
  const newIds = [...input.newIds];
  if (reviewIds.length === 0 && newIds.length === 0) return [];

  const blocks: SessionBlock[] = [];
  const pushNew = () => push(blocks, 'new', newIds);
  const pushDue = () => push(blocks, 'review', reviewIds);
  const pushReinforcement = () => {
    if (input.fillWithRepeats) push(blocks, 'review', newIds, { pass: 2, reinforcement: true });
  };

  // A day with no repeats has no repeats to open on, whatever the caller asked.
  if (reviewIds.length === 0 || input.openOnNew === true) {
    pushNew();
    pushDue();
  } else {
    pushDue();
    pushNew();
  }
  pushReinforcement();
  return blocks;
}

export interface TimeSessionBlockPlanInput {
  /** Every repeat the day selected, in the order it should be met. */
  reviewIds: readonly string[];
  newIds: readonly string[];
}

/**
 * Shapes a minutes day into its clock-owned stretches.
 *
 * The clock, not a card count, decides when one stretch ends — see
 * `timePhaseIndex` — so a block here is not a quota to finish but the material
 * that stretch is allowed to draw on:
 *
 * A first day is `new → reinforce those new words`. Once a learner has a
 * review backlog it is `review → new → reinforce those new words`.
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

  const blocks: SessionBlock[] = [];
  let phase = 0;
  push(blocks, 'review', review, { phase });
  if (review.length > 0) phase += 1;
  push(blocks, 'new', fresh, { phase });
  if (fresh.length > 0) {
    phase += 1;
    push(blocks, 'review', fresh, { pass: 2, phase, reinforcement: true });
  }
  return blocks;
}
