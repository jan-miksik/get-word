'use client';

import { useI18n } from '@/components/I18nProvider';
import { ContinueButton } from '@/features/learning/components/ContinueButton';

type Props = {
  onAddWords: () => void;
  onDismiss: () => void;
};

export function AddPersonalWordsPrompt({ onAddWords, onDismiss }: Props) {
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-64 items-center justify-center px-4 py-6">
      {/* Renders inside the study surface, not `.onboarding-screen`, so the
          `--ob-*` variables are undefined here — use the warm ink palette
          directly, like the sibling interstitial cards. */}
      <section className="w-full max-w-xl rounded-2xl p-6 text-center text-ink-800 sm:p-8">
        <h2 className="m-0 text-2xl font-black leading-tight text-ink-800">
          {t('wordChat.moreWordsTitle')}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500">
          {t('wordChat.moreWordsBody')}
        </p>
        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2">
          {/* The same slab the study cards advance on — this prompt is the end
              of the deck, so its primary action reads as the session's continue
              rather than as a one-off onboarding option. */}
          <ContinueButton onClick={onAddWords} label={t('wordChat.moreWordsAction')} showArrow={false} />
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2 text-xs font-bold underline onboarding-text-soft"
          >
            {t('wordChat.moreWordsDismiss')}
          </button>
        </div>
      </section>
    </div>
  );
}
