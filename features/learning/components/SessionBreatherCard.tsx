'use client';

import { useI18n } from '@/components/I18nProvider';
import type { SessionBreather } from '@/features/learning/session/useSessionBreather';

/**
 * The pause between two blocks, and the day's one and only scoreboard.
 *
 * Like its sibling interstitials this renders inside the study surface rather
 * than `.onboarding-screen`, so the `--ob-*` variables are undefined and the
 * warm ink palette is written out directly.
 */
export function SessionBreatherCard({
  breather,
  onContinue,
}: {
  breather: SessionBreather;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const { flow } = breather;
  const dayPercent = flow.dayTotal > 0 ? Math.min(100, Math.round((flow.dayDone / flow.dayTotal) * 100)) : 0;
  const remaining = Math.max(0, flow.dayTotal - flow.dayDone);
  const complete = breather.kind === 'complete';

  const kindColor = (kind: 'review' | 'new') =>
    kind === 'review' ? 'var(--rail-review)' : 'var(--rail-new)';

  return (
    <div className="flex h-full min-h-64 items-center justify-center px-4 py-6">
      <section className="w-full max-w-xl rounded-2xl p-6 text-center text-[#1f1a12] sm:p-8">
        <div className="text-4xl" aria-hidden>{complete ? '🎉' : '✓'}</div>

        <h2 className="m-0 mt-3 text-2xl font-black leading-tight text-[#1f1a12]">
          {complete ? t('learning.sessionDayDoneTitle') : t('learning.sessionBreatherTitle')}
        </h2>

        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#4a4032]">
          {breather.kind === 'between'
            ? t(
                breather.finished.kind === 'review'
                  ? 'learning.sessionBreatherBodyReview'
                  : 'learning.sessionBreatherBodyNew',
                { count: breather.finished.done },
              )
            : t('learning.sessionDayDoneBody')}
        </p>

        {/* Where the day stands — the number the rail deliberately does not carry. */}
        <div className="mx-auto mt-6 max-w-sm">
          <div className="flex items-baseline justify-between text-xs font-bold text-[#4a4032]">
            <span>{t('learning.sessionDayLabel')}</span>
            <span className="tabular-nums">{flow.dayDone}/{flow.dayTotal}</span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full"
            style={{ background: 'var(--rail-track)' }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={flow.dayTotal}
            aria-valuenow={flow.dayDone}
          >
            <div
              className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
              style={{ width: `${dayPercent}%`, background: 'var(--rail-review)' }}
            />
          </div>
          {!complete && remaining > 0 ? (
            <p className="m-0 mt-2 text-xs text-[#4a4032]">
              {t('learning.sessionDayRemaining', { count: remaining })}
            </p>
          ) : null}
        </div>

        {breather.kind === 'between' ? (
          <p className="mx-auto mt-5 flex items-center justify-center gap-2 text-sm font-bold text-[#1f1a12]">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: kindColor(breather.next.kind) }}
            />
            {t(
              breather.next.kind === 'review'
                ? 'learning.sessionBreatherNextReview'
                : 'learning.sessionBreatherNextNew',
              { count: breather.next.total },
            )}
          </p>
        ) : null}

        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2">
          <button
            type="button"
            onClick={onContinue}
            className="onboarding-option onboarding-option-highlight rounded-xl px-5 py-3 text-base font-extrabold"
          >
            {complete ? t('learning.sessionDayDoneAction') : t('learning.sessionBreatherAction')}
          </button>
        </div>
      </section>
    </div>
  );
}
