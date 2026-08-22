'use client';

import { STAGES } from '@/lib/words';
import { useI18n } from '@/components/I18nProvider';

/**
 * The ladder's last rung. A word sitting here has already survived a 60-day
 * gap, so the next correct answer proves nothing more — that is the moment to
 * offer retirement instead of scheduling yet another 60 days.
 */
export const TOP_STAGE_INDEX = STAGES.length - 1;

export function isTopStage(stageIndex: number): boolean {
  return Math.max(0, Math.min(stageIndex, TOP_STAGE_INDEX)) === TOP_STAGE_INDEX;
}

/**
 * Offer, never automatic: a wrong tap here would drop the word out of the
 * rotation for good, so the learner has to ask for it. The same action lives in
 * the custom-interval popover and on the deck's up-swipe; this is the copy of
 * it that surfaces on its own once a word reaches the top stage.
 */
export function FullyKnownOffer({
  onRetire,
  className = '',
}: {
  onRetire: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onRetire}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#12750f] bg-[#12750f]/[0.08] px-4 py-2 text-[0.82rem] font-bold leading-tight text-[#12750f] [touch-action:manipulation] transition-colors hover:bg-[#12750f]/20 active:bg-[#12750f]/30 ${className}`}
    >
      <span aria-hidden="true">✓</span>
      <span>{t('card.fullyKnownNoRepeat')}</span>
    </button>
  );
}
