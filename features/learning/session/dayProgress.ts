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
  pendingIds?: ReadonlySet<string>;
  /** Answers already on record when the plan froze, see `SessionPlan`. */
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
    // A single pass is settled by "answered today", which survives a reload and
    // a second device. A repeat has to count answers instead, from the floor
    // recorded when the plan froze.
    const isDone = (id: string) => (passes === 1
      ? answeredOnDay(progress[id], dayKey, timezone)
      : answerCount(progress[id]) - (input.answerBaseline?.[id] ?? 0) >= passes);
    const isLive = (id: string) => liveIds.has(id) || (passes > 1 && Boolean(input.settlingIds?.has(id)));

    const done = block.ids.filter(isDone).length;
    const pending = input.pendingIds
      ? block.ids.filter((id) => input.pendingIds!.has(id) && !isDone(id)).length
      : 0;
    const liveRemaining = block.ids.filter(isLive).length;
    const unavailable = block.ids.filter((id) => !isLive(id) && !isDone(id)).length;
    return { key: block.key, kind: block.kind, total: block.ids.length, done, pending, liveRemaining, unavailable };
  });
}
