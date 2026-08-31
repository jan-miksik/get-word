import type { ProgressData } from '@/features/sync/contracts';
import { localDayKeyAt } from '@/lib/local-day';
import { hasIntroducedWord } from '@/packages/domain/goals/goal';
import type { SessionBlock, SessionBlockKind } from './blocks';

export interface SessionBlockProgress {
  key: string;
  kind: SessionBlockKind;
  total: number;
  done: number;
  /**
   * Answered in this tab but not yet written to `progress` — the deck defers
   * the SRS write until its exit animation ends. The rails and block flow move
   * on the answer; `SessionFlowState.settled` separately says when every write
   * behind that visible progress has landed.
   */
  pending: number;
  liveRemaining: number;
  unavailable: number;
  /**
   * Minigame rounds planned inside this block, and how many of them the learner
   * has finished. Games are cards the learner has to walk past, so the block
   * rail counts them — but they are deliberately kept out of `total`/`done`,
   * which stay the *words* the day's goal is written in.
   */
  gameTotal?: number;
  gameDone?: number;
  /** Rounds that were planned and are no longer reachable; see `unavailable`. */
  gameUnavailable?: number;
  /** A same-day second pass: paced as review, excluded from daily review totals. */
  reinforcement?: boolean;
  /** The time stretch this block belongs to; only a minutes plan has one. */
  phase?: number;
}

export interface BlockProgressInput {
  progress: Record<string, ProgressData>;
  /** Ids the stream can still serve right now. */
  liveIds: ReadonlySet<string>;
  /** Answered earlier today and settling; only a second-pass block can use them. */
  settlingIds?: ReadonlySet<string>;
  dayKey: string;
  timezone?: string;
  /**
   * Answers taken in this tab but not yet written to `progress` — the deck
   * defers the SRS write until its exit animation ends. Keyed by the answer
   * count the word carried at the tap, so an entry stops counting by itself the
   * moment `progress` catches up: no cleanup pass, and nothing can go stale.
   */
  pendingAnswers?: Record<string, number>;
  /**
   * Answers already on record when the block froze, see `SessionPlan`. An id
   * with a baseline is settled by answering it again rather than by having been
   * answered today at all — which is what a same-day repeat and the bonus round
   * both need, since their words may well carry an earlier answer from today.
   */
  answerBaseline?: Record<string, number>;
  /**
   * The minigame rounds each block holds, keyed by block key. A round is a card
   * the learner meets, so the block rail has a slot for it; the day's goal is
   * still counted in words alone, which is why this never touches `total`.
   */
  blockGames?: Record<string, BlockGameProgress>;
}

export interface BlockGameProgress {
  /** Rounds ever planned for this block, including ones already played. */
  total: number;
  done: number;
  /** Planned, unplayed, and no longer in the stream — nothing left to walk. */
  unavailable: number;
}

export function answeredOnDay(entry: ProgressData | undefined, dayKey: string, timezone?: string): boolean {
  const timestamp = Math.max(entry?.lastKnownAt ?? 0, entry?.lastUnknownAt ?? 0);
  return timestamp > 0 && localDayKeyAt(timestamp, timezone) === dayKey;
}

/**
 * New words first met on one local day, from the optimistic progress map.
 *
 * The server remains the durable source for history, but the closing card is
 * rendered on the same tick as the last answer. Reading only its rollup there
 * makes a completed twenty-word stretch briefly fall back to the frozen
 * five-word plan. `introducedAt` is immutable, so this local count is safe to
 * merge with (never subtract from) the server's figure while sync catches up.
 */
export function countIntroducedOnDay(
  progress: Record<string, ProgressData>,
  dayKey: string,
  timezone?: string,
): number {
  return Object.values(progress).filter((entry) => {
    const timestamp = entry.introducedAt ?? 0;
    return timestamp > 0 && localDayKeyAt(timestamp, timezone) === dayKey;
  }).length;
}

function answerCount(entry: ProgressData | undefined): number {
  return (entry?.knownCount ?? 0) + (entry?.unknownCount ?? 0);
}

export function computeBlockProgress(
  blocks: readonly SessionBlock[],
  input: BlockProgressInput,
): SessionBlockProgress[] {
  const { progress, liveIds, dayKey, timezone } = input;
  return blocks.map((block) => {
    const passes = block.pass ?? 1;
    // A minutes plan may carry more unseen words than its estimate so a fast
    // learner does not hit an artificial wall. Its closing reinforcement only
    // owns the subset actually introduced before the clock boundary.
    const ids = block.phase !== undefined && block.reinforcement
      ? block.ids.filter((id) =>
          hasIntroducedWord(progress[id]) || input.pendingAnswers?.[id] !== undefined)
      : block.ids;
    // A single pass with no recorded floor is settled by "answered today", which
    // survives a reload and a second device. Anything with a floor counts
    // answers from it instead — a same-day repeat owes two, the bonus round owes
    // one more than the learner had already given when they opted in.
    const settles = (id: string, queued: number) => {
      const baseline = input.answerBaseline?.[id];
      return baseline === undefined && passes === 1
        ? queued > 0 || answeredOnDay(progress[id], dayKey, timezone)
        : answerCount(progress[id]) + queued - (baseline ?? 0) >= passes;
    };
    const isDone = (id: string) => settles(id, 0);
    // One tap is one answer, wherever that word sits. A word listed in two
    // blocks — the closing block repeats what the new block just introduced —
    // used to count its single queued answer as progress in BOTH of them, which
    // is what made the day rail's new and review stretches grow together on the
    // same tap. Asking whether the block would be settled *by* that one answer
    // gives the repeat block nothing until the answer it is actually waiting for.
    const queuedAnswer = (id: string): number => {
      const atTap = input.pendingAnswers?.[id];
      return atTap !== undefined && answerCount(progress[id]) <= atTap ? 1 : 0;
    };
    const isLive = (id: string) => liveIds.has(id) || (passes > 1 && Boolean(input.settlingIds?.has(id)));

    const done = ids.filter(isDone).length;
    const pending = input.pendingAnswers
      ? ids.filter((id) => !isDone(id) && settles(id, queuedAnswer(id))).length
      : 0;
    const liveRemaining = ids.filter(isLive).length;
    const unavailable = ids.filter((id) => !isLive(id) && !isDone(id)).length;
    const games = input.blockGames?.[block.key];
    return {
      key: block.key,
      kind: block.kind,
      total: ids.length,
      done,
      pending,
      liveRemaining,
      unavailable,
      gameTotal: games?.total ?? 0,
      gameDone: games?.done ?? 0,
      gameUnavailable: games?.unavailable ?? 0,
      ...(block.reinforcement ? { reinforcement: true } : {}),
      ...(block.phase === undefined ? {} : { phase: block.phase }),
    };
  });
}
