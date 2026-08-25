'use client';

import { useI18n } from '@/components/I18nProvider';
import type { I18nKey } from '@/lib/i18n/locales/en';
import type { QuickPracticeMethodId } from './rounds';

const LABEL: Record<QuickPracticeMethodId, I18nKey> = {
  choice: 'quickPractice.methodChoice',
  matching: 'quickPractice.methodMatching',
  bubbles: 'quickPractice.methodBubbles',
};

const HINT: Record<QuickPracticeMethodId, I18nKey> = {
  choice: 'quickPractice.methodChoiceHint',
  matching: 'quickPractice.methodMatchingHint',
  bubbles: 'quickPractice.methodBubblesHint',
};

/**
 * Drawn in `currentColor` throughout: `.onboarding-option` inverts its text
 * colour on hover, and an icon painted in fixed ink would stay dark on the
 * filled button.
 */
function MethodIcon({ method }: { method: QuickPracticeMethodId }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {method === 'choice' ? (
        <>
          <rect x="3" y="4" width="18" height="6.5" rx="2" />
          <rect x="3" y="13.5" width="18" height="6.5" rx="2" fill="currentColor" opacity="0.9" />
        </>
      ) : method === 'matching' ? (
        <>
          <rect x="3" y="3.5" width="7.5" height="7" rx="2" />
          <rect x="13.5" y="13.5" width="7.5" height="7" rx="2" fill="currentColor" opacity="0.9" />
          <path d="M10.5 7h4.25a2.5 2.5 0 0 1 2.5 2.5v4" />
        </>
      ) : (
        <>
          <circle cx="8.5" cy="9" r="5" />
          <circle cx="16.5" cy="16" r="3.5" fill="currentColor" opacity="0.9" />
        </>
      )}
    </svg>
  );
}

/**
 * The one-tap step between saving words and playing with them.
 *
 * Not a screen of its own: it rides on the confirmation the learner is already
 * looking at, so choosing a game is a tap rather than a detour. Only the
 * methods the saved words can actually support are listed — see
 * `availableQuickPracticeMethods`.
 */
export function QuickPracticeOffer({
  methods,
  onStart,
}: {
  methods: readonly QuickPracticeMethodId[];
  onStart: (method: QuickPracticeMethodId) => void;
}) {
  const { t } = useI18n();
  if (methods.length === 0) return null;

  return (
    <section className="space-y-3 text-left">
      <div className="text-center">
        <h3 className="text-base font-black">{t('quickPractice.offerTitle')}</h3>
        <p className="mt-1 text-xs leading-relaxed onboarding-text-soft">
          {t('quickPractice.offerBody')}
        </p>
      </div>
      <div className="grid gap-2">
        {methods.map((method) => (
          <button
            key={method}
            type="button"
            onClick={() => onStart(method)}
            className="onboarding-option group flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
          >
            <MethodIcon method={method} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">{t(LABEL[method])}</span>
              <span className="mt-0.5 block text-[11px] leading-snug onboarding-text-soft">
                {t(HINT[method])}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="shrink-0 text-lg transition-transform duration-200 group-hover:translate-x-1"
            >
              →
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
