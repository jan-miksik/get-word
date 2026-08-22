'use client';

import { useI18n } from '@/components/I18nProvider';
import type { SessionBlockProgress } from '@/features/learning/session/dayProgress';
import type { SessionFlowState } from '@/features/learning/session/flow';
import {
  reachableTotal,
  segmentFillPercent,
  segmentFlexGrow,
  toProgressSegments,
} from '@/features/learning/session/progressSegments';

/**
 * How many ticks the block rail may draw. Beyond this it is summarised — one
 * tick stands for several items — because below roughly three pixels a tick and
 * the gap after it stop being two things.
 */
const MAX_TICKS = 24;

function blockColor(kind: SessionBlockProgress['kind']): string {
  return kind === 'new' ? 'var(--rail-new)' : 'var(--rail-review)';
}

/**
 * Two hairline rails hugging the very edges of the study area, filling bottom
 * to top.
 *
 * The two sides answer two different questions. The left rail is *this block*:
 * how much of the stretch in front of me is left. The right rail is *today*:
 * the shape of the whole plan, one segment per block, in the order they will be
 * met. One quantity each, so a few-pixel strip read out of the corner of an eye
 * stays readable.
 */
function railGeometry(done: number, total: number): { ticks: number; filled: number } {
  const ticks = Math.min(Math.max(total, 1), MAX_TICKS);
  const clampedDone = Math.min(Math.max(done, 0), total);
  // Summarised rails must not read as finished while work remains, so the last
  // tick is held back until the rail's own total is done.
  const filled =
    clampedDone >= total ? ticks : Math.min(ticks - 1, Math.floor((clampedDone / total) * ticks));
  return { ticks, filled };
}

function railFrame(side: 'left' | 'right'): string {
  return [
    'pointer-events-none absolute inset-y-0 flex w-[5px] flex-col-reverse gap-[3px] py-2',
    side === 'left' ? 'left-0' : 'right-0',
  ].join(' ');
}

/**
 * The current block, one tick per item.
 *
 * Ticks rather than one continuous bar: a countable row of marks says "four
 * more cards" at a glance, where a bar only says "most of the way". Short rails
 * get one tick per item; longer ones are summarised so the marks stay legible.
 */
function BlockRail({ done, total, color }: { done: number; total: number; color: string }) {
  const { ticks, filled } = railGeometry(done, total);
  return (
    <div aria-hidden className={railFrame('left')}>
      {Array.from({ length: ticks }, (_, index) => (
        <span
          key={index}
          className="flex-1 rounded-[2px] motion-safe:transition-colors motion-safe:duration-500"
          style={
            index < filled
              ? { background: color, boxShadow: `0 0 8px 0 ${color}` }
              : { background: 'var(--rail-track)' }
          }
        />
      ))}
    </div>
  );
}

/**
 * Today, as its segments: one per stretch of work, sized by how many items it
 * holds and coloured by what kind of work it is — so the rail reads as the
 * day's actual shape (the repeats, the new ground) rather than an anonymous row
 * of marks.
 *
 * The plan's several review blocks are drawn as one review segment; see
 * `toProgressSegments`, which is the whole of that merge — the session order
 * itself is untouched.
 *
 * Each segment fills continuously instead of tick by tick. A day of thirty
 * items summarised onto twenty-four ticks moved by less than one tick per
 * answer, so answering a card often changed nothing visible; a proportional
 * fill inside the current segment always moves.
 */
function DayRail({ blocks, activeIndex }: { blocks: readonly SessionBlockProgress[]; activeIndex: number }) {
  return (
    <div aria-hidden className={railFrame('right')}>
      {toProgressSegments(blocks, activeIndex).map((segment) => {
        const color = blockColor(segment.kind);
        return (
          <div
            key={segment.key}
            className="relative w-full overflow-hidden rounded-[2px]"
            style={{
              // Sized by the segment's share of the day, but never thinner than
              // a mark that can still be seen.
              flexGrow: segmentFlexGrow(segment),
              flexBasis: 0,
              minHeight: '6px',
              background: 'var(--rail-track)',
            }}
          >
            <span
              className="absolute inset-x-0 bottom-0 rounded-[2px] motion-safe:transition-[height] motion-safe:duration-500"
              style={{
                height: `${segmentFillPercent(segment)}%`,
                background: color,
                boxShadow: segment.active ? `0 0 8px 0 ${color}` : undefined,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function SessionRail({ flow }: { flow: SessionFlowState }) {
  const { t } = useI18n();
  const { block } = flow;
  if (flow.dayTotal === 0) return null;
  // Nothing left to pace once the day's plan is walked. A full rail standing
  // beside the closing card is a progress bar for work that no longer exists,
  // and it competes with the card that is actually saying how the day ended.
  if (flow.complete) return null;

  // The block rail measures the walk, so it counts only what the stream can
  // still serve. Items the block planned but cannot deliver used to sit in the
  // denominator, which left the rail short of the top on the very answer that
  // finished the block.
  const blockTotal = block ? reachableTotal(block) : 0;
  const color = block ? blockColor(block.kind) : 'var(--rail-review)';
  const label = block?.kind === 'new' ? t('learning.sessionPlanNew') : t('learning.sessionPlanReview');

  return (
    <>
      {block && blockTotal > 0 ? (
        <BlockRail done={block.done + block.pending} total={blockTotal} color={color} />
      ) : null}
      <DayRail blocks={flow.blocks} activeIndex={flow.index} />
      {/* Keyed on the block so a new block remounts the label and replays its
          flash-then-fade animation. No timer, no state: the whole behaviour is
          "show this briefly, then get out of the way". */}
      {block ? (
        <p
          key={block.key}
          aria-live="polite"
          className="session-rail-label pointer-events-none absolute bottom-4 left-[14px] z-10 m-0 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-white"
          style={{ background: color }}
        >
          {label}
        </p>
      ) : null}
    </>
  );
}
