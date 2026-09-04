'use client';

import { useI18n } from '@/components/I18nProvider';

/**
 * Says out loud that this card belongs to the immediate second pass.
 *
 * Without it the stretch is indistinguishable from an ordinary five-minute
 * repeat: same words, same exercise configuration, and — before the reveal card
 * lost its grading buttons here — the same two buttons offering intervals that
 * this pass deliberately never applies. The rail's label flashes once when the
 * stretch opens; this stays for every card in it.
 */
export function ReinforcementBadge({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <p
      className={[
        'mx-auto mb-2 w-fit rounded-full bg-wash-sea px-2.5 py-1 text-center',
        'text-[0.6rem] font-bold uppercase tracking-[0.1em] text-sea-deep',
        className,
      ].join(' ')}
    >
      {t('learning.sessionPlanReinforcement')}
    </p>
  );
}
