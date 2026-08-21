'use client';

import { useI18n } from '@/components/I18nProvider';
import type { SessionFlowState } from '@/features/learning/session/flow';

/**
 * How many ticks a rail may draw. Beyond this a rail is summarised — one tick
 * stands for several items — because below roughly three pixels a tick and the
 * gap after it stop being two things.
 */
const MAX_TICKS = 24;

/**
 * Two hairline rails hugging the very edges of the study area, filling bottom
 * to top.
 *
 * The two sides answer two different questions. The left rail is *this block*:
 * how much of the stretch in front of me is left, coloured by whether it is
 * repeats or new ground. The right rail is *today*: how much of the whole day's
 * plan is behind me. One quantity each, so a few-pixel strip read out of the
 * corner of an eye stays readable.
 *
 * They are drawn as ticks rather than one continuous bar: a countable row of
 * marks says "four more cards" at a glance, where a bar only says "most of the
 * way". Short rails get one tick per item; longer ones are summarised so the
 * marks stay legible.
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

function Rail({
  side,
  done,
  total,
  color,
}: {
  side: 'left' | 'right';
  done: number;
  total: number;
  color: string;
}) {
  const { ticks, filled } = railGeometry(done, total);
  return (
    <div
      aria-hidden
      className={[
        'pointer-events-none absolute inset-y-0 flex w-[5px] flex-col-reverse gap-[3px] py-2',
        side === 'left' ? 'left-0' : 'right-0',
      ].join(' ')}
    >
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

export function SessionRail({ flow }: { flow: SessionFlowState }) {
  const { t } = useI18n();
  const { block } = flow;
  if (flow.dayTotal === 0) return null;

  const color = block?.kind === 'new' ? 'var(--rail-new)' : 'var(--rail-review)';
  const label = block?.kind === 'new' ? t('learning.sessionPlanNew') : t('learning.sessionPlanReview');

  return (
    <>
      {block && block.total > 0 ? (
        <Rail side="left" done={block.done + block.pending} total={block.total} color={color} />
      ) : null}
      <Rail
        side="right"
        done={flow.dayDone + flow.dayPending}
        total={flow.dayTotal}
        color="var(--rail-day)"
      />
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
