import type { SessionBlockKind } from './blocks';
import type { SessionBlockProgress } from './dayProgress';

/**
 * One drawn segment of the day's progress rail.
 *
 * A segment is not a session block. The plan alternates review and new work —
 * repeats, new ground, repeats again — and drawing every block separately makes
 * the day look like more, smaller pieces than the learner experiences: two thin
 * blue slivers with a green one wedged between them read as three chores, not
 * as "today's repeats plus today's new words".
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
 * The day's blocks as the rail draws them: every review block folded into one
 * segment, sized by the items they hold together.
 *
 * This is a view of the plan, not a change to it. The session still runs
 * review → new → review, `SessionBlock[]` keeps its order and its boundaries,
 * the planner and the SRS never see this function — only the pixels do.
 *
 * New blocks stay as they are and keep their place; the merged review segment
 * takes the position of the first review block, which is where the day's
 * repeats begin. So `new(5), review(6), new(5), review(4)` is drawn as
 * `new(5), review(10), new(5)` — sized 1 : 2 : 1.
 */
export function toProgressSegments(
  blocks: readonly SessionBlockProgress[],
  activeIndex: number,
): SessionProgressSegment[] {
  const segments: SessionProgressSegment[] = [];
  let reviewSegment: SessionProgressSegment | null = null;

  blocks.forEach((block, index) => {
    const active = index === activeIndex;
    if (block.kind === 'review' && reviewSegment) {
      reviewSegment.total += block.total;
      reviewSegment.done += block.done;
      reviewSegment.pending += block.pending;
      reviewSegment.unavailable += block.unavailable;
      reviewSegment.active = reviewSegment.active || active;
      reviewSegment.blockKeys = [...reviewSegment.blockKeys, block.key];
      return;
    }

    const segment: SessionProgressSegment = {
      key: block.key,
      kind: block.kind,
      total: block.total,
      done: block.done,
      pending: block.pending,
      unavailable: block.unavailable,
      active,
      blockKeys: [block.key],
    };
    segments.push(segment);
    if (block.kind === 'review') reviewSegment = segment;
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
