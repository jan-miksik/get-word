'use client';

import { useI18n } from '@/components/I18nProvider';
import type { SessionFlowState } from '@/features/learning/session/flow';

/**
 * Two hairline rails hugging the left and right edges of the study area,
 * filling bottom to top.
 *
 * The rail is deliberately about *one block* and nothing else. Where the day
 * stands belongs on the breather between blocks, which has room for words; a
 * four-pixel strip read out of the corner of an eye can carry one quantity, and
 * a colour saying whether this stretch is repeats or new ground.
 */
export function SessionRail({ flow }: { flow: SessionFlowState }) {
  const { t } = useI18n();
  const { block } = flow;
  if (!block || block.total === 0) return null;

  const percent = Math.min(100, Math.round((block.done / block.total) * 100));
  const color = block.kind === 'review' ? 'var(--rail-review)' : 'var(--rail-new)';
  const label = block.kind === 'review' ? t('learning.sessionPlanReview') : t('learning.sessionPlanNew');

  const rail = (side: 'left' | 'right') => (
    <div
      key={side}
      aria-hidden
      className={[
        'pointer-events-none absolute inset-y-3 w-[4px] overflow-hidden rounded-full',
        side === 'left' ? 'left-[6px]' : 'right-[6px]',
      ].join(' ')}
      style={{ background: 'var(--rail-track)' }}
    >
      <div
        className="absolute inset-x-0 bottom-0 rounded-full motion-safe:transition-[height] motion-safe:duration-500 motion-safe:ease-out"
        style={{ height: `${percent}%`, background: color, boxShadow: `0 0 10px 0 ${color}` }}
      />
    </div>
  );

  return (
    <>
      {rail('left')}
      {rail('right')}
      {/* Keyed on the block so a new block remounts the label and replays its
          flash-then-fade animation. No timer, no state: the whole behaviour is
          "show this briefly, then get out of the way". */}
      <p
        key={block.key}
        aria-live="polite"
        className="session-rail-label pointer-events-none absolute bottom-4 left-[18px] z-10 m-0 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-white"
        style={{ background: color }}
      >
        {label}
      </p>
    </>
  );
}
