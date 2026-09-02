import type { SessionBlockKind } from './blocks';
import type { SessionBlockProgress } from './dayProgress';

/**
 * One drawn segment of the day's progress rail.
 *
 * A segment is not a session block. A plan can hold several *consecutive*
 * blocks of the same kind — the bonus round is cut into stretches of ten — and
 * drawing each of them separately makes the work look like more, smaller pieces
 * than the learner experiences: six thin slivers read as six chores, not as one
 * stretch of repeats.
 */
export interface SessionProgressSegment {
  key: string;
  kind: SessionBlockKind;
  total: number;
  done: number;
  pending: number;
  /** Items in this stretch the stream cannot serve; see `reachableTotal`. */
  unavailable: number;
  /** True when the block the session is working through folded into this one. */
  active: boolean;
  /** Blocks folded in here, in plan order. */
  blockKeys: readonly string[];
}

/**
 * The day's blocks as the rail draws them: one segment per *run* of work of the
 * same kind.
 *
 * This is a view of the plan, not a change to it. `SessionBlock[]` keeps its
 * order and its boundaries, the planner and the SRS never see this function —
 * only the pixels do.
 *
 * Only neighbours fold together. That is the whole rule, and it is what makes
 * the rail show the day the learner actually walks: repeats, then new ground,
 * then the check on that new ground reads as three stretches, because it is
 * three. Folding by kind alone put that closing check back at the bottom with
 * the opening repeats, so a day of `review → new → review` was drawn as a rail
 * that ended on new words — the one thing it never does.
 *
 * The fold still earns its place where it was introduced: the bonus round is
 * cut into stretches of ten, and those stretches *are* neighbours, so they
 * draw as the one continuous run of repeats they feel like rather than as six
 * anonymous slivers.
 */
export function toProgressSegments(
  blocks: readonly SessionBlockProgress[],
  activeIndex: number,
): SessionProgressSegment[] {
  const segments: SessionProgressSegment[] = [];

  blocks.forEach((block, index) => {
    const active = index === activeIndex;
    const held = segments[segments.length - 1];
    if (held && held.kind === block.kind) {
      held.total += block.total;
      held.done += block.done;
      held.pending += block.pending;
      held.unavailable += block.unavailable;
      held.active = held.active || active;
      held.blockKeys = [...held.blockKeys, block.key];
      return;
    }

    segments.push({
      key: block.key,
      kind: block.kind,
      total: block.total,
      done: block.done,
      pending: block.pending,
      unavailable: block.unavailable,
      active,
      blockKeys: [block.key],
    });
  });

  return segments;
}

/**
 * What the rail can actually measure: the planned items minus the ones the
 * stream cannot serve — answered on another device, filtered out of the
 * selection, no longer in a subscribed list.
 *
 * They still count in `total`, which is what keeps the day's own bookkeeping
 * honest about what was planned (and what turns the closing card into "you have
 * run out of words"). A rail is a different question: it says how much of the
 * stretch in front of me is left, and a stretch that can never be walked to the
 * end is a rail that can never fill.
 */
export function reachableTotal(segment: Pick<SessionProgressSegment, 'total' | 'unavailable'>): number {
  return Math.max(0, segment.total - segment.unavailable);
}

/**
 * How full a segment is drawn, 0–100. Answers waiting to be committed count as
 * done so the rail moves on the tap, exactly as a single block's fill did.
 *
 * A stretch with nothing left to serve draws full: the session steps over it
 * rather than stopping on it, so it is behind the learner either way.
 */
export function segmentFillPercent(segment: SessionProgressSegment): number {
  if (segment.total <= 0) return 0;
  const reachable = reachableTotal(segment);
  if (reachable <= 0) return 100;
  const done = Math.min(segment.done + segment.pending, reachable);
  return (done / reachable) * 100;
}

/**
 * A segment's share of the rail's length. Flex grow is proportional by
 * definition, so the numbers are the item counts themselves — an empty segment
 * still gets 1 so it cannot collapse to nothing.
 */
export function segmentFlexGrow(segment: SessionProgressSegment): number {
  return Math.max(segment.total, 1);
}
