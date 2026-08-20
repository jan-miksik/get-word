import type { ProgressData } from '@/features/sync/contracts';
import { localDayKeyAt } from '@/lib/local-day';
import type { SessionBlock, SessionBlockKind } from './blocks';

export interface SessionBlockProgress {
  key: string;
  kind: SessionBlockKind;
  total: number;
  done: number;
  liveRemaining: number;
  unavailable: number;
}

export function answeredOnDay(entry: ProgressData | undefined, dayKey: string, timezone?: string): boolean {
  const timestamp = Math.max(entry?.lastKnownAt ?? 0, entry?.lastUnknownAt ?? 0);
  return timestamp > 0 && localDayKeyAt(timestamp, timezone) === dayKey;
}

export function computeBlockProgress(
  blocks: readonly SessionBlock[],
  progress: Record<string, ProgressData>,
  liveIds: ReadonlySet<string>,
  dayKey: string,
  timezone?: string,
): SessionBlockProgress[] {
  return blocks.map((block) => {
    const done = block.ids.filter((id) => answeredOnDay(progress[id], dayKey, timezone)).length;
    const liveRemaining = block.ids.filter((id) => liveIds.has(id)).length;
    const unavailable = block.ids.filter(
      (id) => !liveIds.has(id) && !answeredOnDay(progress[id], dayKey, timezone),
    ).length;
    return {
      key: block.key,
      kind: block.kind,
      total: block.ids.length,
      done,
      liveRemaining,
      unavailable,
    };
  });
}
