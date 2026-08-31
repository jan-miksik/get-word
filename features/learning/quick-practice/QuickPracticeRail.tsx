'use client';

import { useI18n } from '@/components/I18nProvider';
import { BlockRail } from '@/features/learning/components/SessionRail';

/**
 * How far the bonus block has got, drawn exactly as a session's own stretch of
 * work: one hairline of ticks at the left edge of the study area, filling
 * bottom to top.
 *
 * It hangs off the study area rather than off the round because that is where
 * the session's rails hang — the panel below scrolls, and a rail that scrolls
 * with its card is not a rail. Only the left side is drawn: the right one is
 * the day's plan, and the day this block follows is already walked.
 *
 * The rail is the whole of the block's chrome. There is deliberately no way
 * out drawn beside it: every round carries the skip the study stream's rounds
 * carry, and anything more turned the block back into a screen of its own.
 */
export function QuickPracticeRail({ done, total }: { done: number; total: number }) {
  const { t } = useI18n();
  if (total === 0) return null;

  return (
    <>
      <BlockRail done={done} total={total} color="var(--rail-review)" />
      <p aria-live="polite" className="sr-only">
        {t('quickPractice.runProgress', { round: Math.min(done + 1, total), total })}
      </p>
    </>
  );
}
