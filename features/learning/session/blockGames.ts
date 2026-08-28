import type { BlockGameProgress } from './dayProgress';

/**
 * Minigame rounds each block has offered so far, keyed by block key.
 *
 * A block's rounds are not fixed the way its words are. They are re-derived
 * from the words still standing, so the set shrinks as the block is answered —
 * which is exactly the wrong shape for a rail: a denominator that falls as the
 * learner works makes the fill jump backwards. The ledger is therefore
 * cumulative. A round that has ever been offered keeps its slot, and a round
 * that leaves without being played is reported as unreachable rather than
 * quietly deleted, the same way an unavailable word is.
 */
export type BlockGameLedger = Readonly<Record<string, readonly string[]>>;

export interface BlockGameGroup {
  key: string;
  items: readonly unknown[];
}

function gameIdsOf(group: BlockGameGroup): string[] {
  const ids: string[] = [];
  for (const item of group.items) {
    if (!item || typeof item !== 'object' || !('_isMinigame' in item)) continue;
    const { id } = item as { id?: unknown };
    if (typeof id === 'string') ids.push(id);
  }
  return ids;
}

/** Adds whatever the current stream shows to the ledger, never removing. */
export function recordBlockGames(previous: BlockGameLedger, groups: readonly BlockGameGroup[]): BlockGameLedger {
  let changed = false;
  const next: Record<string, readonly string[]> = { ...previous };
  for (const group of groups) {
    const ids = gameIdsOf(group);
    if (ids.length === 0) continue;
    const known = new Set(next[group.key] ?? []);
    const before = known.size;
    for (const id of ids) known.add(id);
    if (known.size === before) continue;
    next[group.key] = [...known];
    changed = true;
  }
  return changed ? next : previous;
}

/**
 * What the rails need: how many rounds a block holds, how many are behind the
 * learner, and how many can no longer be reached.
 */
export function summarizeBlockGames(
  ledger: BlockGameLedger,
  groups: readonly BlockGameGroup[],
  finished: ReadonlySet<string>,
): Record<string, BlockGameProgress> {
  const present = new Map(groups.map((group) => [group.key, new Set(gameIdsOf(group))]));
  const summary: Record<string, BlockGameProgress> = {};
  for (const [key, ids] of Object.entries(ledger)) {
    const live = present.get(key);
    let done = 0;
    let unavailable = 0;
    for (const id of ids) {
      if (finished.has(id)) done += 1;
      else if (!live?.has(id)) unavailable += 1;
    }
    summary[key] = { total: ids.length, done, unavailable };
  }
  return summary;
}
