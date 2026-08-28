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
   * A same-session check of words introduced by the preceding new block.
   * It uses the word's current (normally five-minute) exercise configuration,
   * but a successful answer reinforces that stage instead of advancing it.
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
   * Open on new ground rather than on repeats. Set for a return after a long
   * absence, where the backlog is the worst possible welcome; a day with no
   * repeats at all opens on new words whether this is set or not.
   */
  openOnNew?: boolean;
  /**
   * Close a day that has no repeats of its own on a second pass over the new
   * words just seen. Without this a beginner's day is new words only.
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
 * Shapes an already-selected day into its two stretches.
 *
 * The day is one stretch of repeats and one of new words, and which comes first
 * is the whole of the decision. Someone who already has words opens on repeats:
 * the material is familiar, and it is the maintenance the day owes before it
 * grows. Someone with nothing to repeat — a first day, or a day where nothing
 * came due — opens on new words, because that is the only work there is, and
 * closes on a second pass over what they just met.
 *
 * Two stretches, never more. The rail beside the deck is read out of the corner
 * of an eye, and a day chopped into five alternating pieces gave it five fresh
 * starts: the bar fell back to empty four times over a session the learner
 * experienced as one continuous run of work.
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
  const pushReview = () => {
    if (reviewIds.length > 0) return push(blocks, 'review', reviewIds);
    // Nothing of its own to repeat: the day still ends on consolidation, with
    // the words it introduced coming back for a second pass.
    if (input.fillWithRepeats) push(blocks, 'review', newIds, { pass: 2, reinforcement: true });
  };

  // A day with no repeats has no repeats to open on, whatever the caller asked.
  if (reviewIds.length === 0 || input.openOnNew === true) {
    pushNew();
    pushReview();
  } else {
    pushReview();
    pushNew();
  }
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
  if (input.fillWithRepeats) {
    push(blocks, 'review', [...input.newIds], { pass: 2, phase: 2, reinforcement: true });
  }
  return blocks;
}
