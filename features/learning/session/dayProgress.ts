import type { ProgressData } from '@/features/sync/contracts';
import { localDayKeyAt } from '@/lib/local-day';
import type { SessionBlock, SessionBlockKind } from './blocks';

export interface SessionBlockProgress {
  key: string;
  kind: SessionBlockKind;
  total: number;
  done: number;
  /**
   * Answered in this tab but not yet written to `progress` — the deck defers
   * the SRS write until its exit animation ends. Counted for display only, so
   * the rails move on the tap while block advancement still waits for the
   * committed answer.
   */
  pending: number;
  liveRemaining: number;
  unavailable: number;
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
}

export function answeredOnDay(entry: ProgressData | undefined, dayKey: string, timezone?: string): boolean {
  const timestamp = Math.max(entry?.lastKnownAt ?? 0, entry?.lastUnknownAt ?? 0);
  return timestamp > 0 && localDayKeyAt(timestamp, timezone) === dayKey;
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

    const done = block.ids.filter(isDone).length;
    const pending = input.pendingAnswers
      ? block.ids.filter((id) => !isDone(id) && settles(id, queuedAnswer(id))).length
      : 0;
    const liveRemaining = block.ids.filter(isLive).length;
    const unavailable = block.ids.filter((id) => !isLive(id) && !isDone(id)).length;
    return { key: block.key, kind: block.kind, total: block.ids.length, done, pending, liveRemaining, unavailable };
  });
}
