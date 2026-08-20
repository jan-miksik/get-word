export type SessionBlockKind = 'review' | 'new';

export interface SessionBlock {
  /** Stable within a stored daily plan. */
  key: string;
  kind: SessionBlockKind;
  ids: string[];
}

export interface SessionBlockOptions {
  /** Returning learners start with a new-word block, but still finish on review. */
  leadWithNew?: boolean;
}

/** Heuristic for cadence, not a maximum size of an individual block. */
const TARGET_ITEMS_PER_NEW_BLOCK = 18;
const MIN_NEW_BLOCKS = 2;
const MAX_NEW_BLOCKS = 5;
const WARM_UP_WEIGHT = 0.5;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Splits a positive total deterministically, allocating remainders from the front. */
function splitEvenly(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

function splitReviews(total: number, parts: number, warmUp: boolean): number[] {
  if (!warmUp || parts === 1) return splitEvenly(total, parts);
  const first = Math.max(
    1,
    Math.round((total * WARM_UP_WEIGHT) / (WARM_UP_WEIGHT + parts - 1)),
  );
  return [first, ...splitEvenly(total - first, parts - 1)];
}

function nextKey(blocks: readonly SessionBlock[], kind: SessionBlockKind): string {
  return `${kind}-${blocks.filter((block) => block.kind === kind).length}`;
}

/**
 * Splits already-selected IDs into alternating blocks without changing their order.
 * A normal plan is R N ... R; a returning plan is N R ... N R.
 */
export function planSessionBlocks(
  reviewIds: readonly string[],
  newIds: readonly string[],
  options: SessionBlockOptions = {},
): SessionBlock[] {
  if (reviewIds.length === 0 && newIds.length === 0) return [];
  if (reviewIds.length === 0) return [{ key: 'new-0', kind: 'new', ids: [...newIds] }];
  if (newIds.length === 0) return [{ key: 'review-0', kind: 'review', ids: [...reviewIds] }];

  // A one-item review bucket cannot both start and finish a non-empty normal plan.
  const leadWithNew = options.leadWithNew || reviewIds.length < 2;
  const desiredNewBlockCount = clamp(
    Math.round((reviewIds.length + newIds.length) / TARGET_ITEMS_PER_NEW_BLOCK),
    MIN_NEW_BLOCKS,
    MAX_NEW_BLOCKS,
  );
  const newBlockCount = leadWithNew
    ? Math.min(desiredNewBlockCount, newIds.length, reviewIds.length)
    : Math.min(desiredNewBlockCount, newIds.length, reviewIds.length - 1);
  const reviewBlockCount = leadWithNew ? newBlockCount : newBlockCount + 1;
  const reviewSizes = splitReviews(reviewIds.length, reviewBlockCount, !leadWithNew);
  const newSizes = splitEvenly(newIds.length, newBlockCount);
  const blocks: SessionBlock[] = [];
  let reviewOffset = 0;
  let newOffset = 0;
  const add = (kind: SessionBlockKind, source: readonly string[], size: number, offset: number) => {
    const ids = source.slice(offset, offset + size);
    if (ids.length > 0) blocks.push({ key: nextKey(blocks, kind), kind, ids });
  };

  for (let index = 0; index < newBlockCount; index += 1) {
    if (leadWithNew) {
      add('new', newIds, newSizes[index], newOffset);
      newOffset += newSizes[index];
      add('review', reviewIds, reviewSizes[index], reviewOffset);
      reviewOffset += reviewSizes[index];
    } else {
      add('review', reviewIds, reviewSizes[index], reviewOffset);
      reviewOffset += reviewSizes[index];
      add('new', newIds, newSizes[index], newOffset);
      newOffset += newSizes[index];
    }
  }
  if (!leadWithNew) add('review', reviewIds, reviewIds.length - reviewOffset, reviewOffset);
  return blocks;
}
