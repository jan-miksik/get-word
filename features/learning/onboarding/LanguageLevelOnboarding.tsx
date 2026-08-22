'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { getLocalizedLanguageName } from '@/lib/i18n/languages';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';
import {
  WORD_CHAT_LANGUAGE_LEVELS,
  splitWordChatLevelLabel,
  wordChatLevelLabelKey,
  type WordChatLanguageLevel,
} from '@/features/word-chat/public.client';
import { OnboardingProgress } from './OnboardingProgress';

function LevelIcon() {
  return (
    <svg aria-hidden viewBox="0 0 64 64" className="mx-auto h-14 w-14" fill="none">
      <circle
        cx="32"
        cy="32"
        r="29"
        fill="var(--ob-surface-hover, #FFF8E8)"
        stroke="var(--ob-ink, #2A2218)"
        strokeWidth="2"
      />
      <rect x="16" y="36" width="8" height="12" rx="2" fill="var(--ob-surface, #F4EFE2)" stroke="var(--ob-ink, #2A2218)" strokeWidth="2.5" />
      <rect x="28" y="28" width="8" height="20" rx="2" fill="var(--ob-accent, #1E6FA8)" stroke="var(--ob-ink, #2A2218)" strokeWidth="2.5" />
      <rect x="40" y="18" width="8" height="30" rx="2" fill="var(--ob-surface, #F4EFE2)" stroke="var(--ob-ink, #2A2218)" strokeWidth="2.5" />
    </svg>
  );
}

/**
 * Asked once, right after the languages, and stored against the target language
 * rather than the account: someone can be starting Spanish while reading German
 * comfortably. The word chat reads the same value instead of asking again.
 */
export function LanguageLevelOnboarding({
  initialLevel = null,
  targetLanguage,
  pending = false,
  onSubmit,
}: {
  initialLevel?: WordChatLanguageLevel | null;
  /** Language code of what they are learning, shown above the question. */
  targetLanguage?: string | null;
  pending?: boolean;
  onSubmit: (level: WordChatLanguageLevel) => void | Promise<void>;
}) {
  const { t, language: uiLanguage } = useI18n();
  const [level, setLevel] = useState<WordChatLanguageLevel>(initialLevel ?? 'A0');
  const targetLanguageName = targetLanguage
    ? getLocalizedLanguageName(targetLanguage, uiLanguage) ?? targetLanguage.toUpperCase()
    : null;

  return (
    <main
      style={warmPaletteVars}
      className="flex min-h-[100dvh] w-full items-center justify-center bg-[color:var(--ob-surface)] px-4 py-8 text-[color:var(--ob-ink)] sm:py-12"
    >
      <section className="onboarding-card w-full max-w-lg p-5 text-center sm:p-7">
        <OnboardingProgress step="level" />
        <LevelIcon />
        {/* The language is shown beside the question rather than inside it:
            dropping a language name into a sentence needs the right case, which
            is not something every translation of this screen can guarantee. */}
        {targetLanguageName ? (
          <p className="m-0 mt-3 text-xs font-black uppercase tracking-[0.16em] text-[color:var(--ob-accent)]">
            {targetLanguageName}
          </p>
        ) : null}
        <h1 className="mb-5 mt-2 text-3xl font-black">{t('wordChat.levelTitle')}</h1>

        <div role="radiogroup" aria-label={t('wordChat.levelSettingLabel')} className="grid gap-2 text-left">
          {WORD_CHAT_LANGUAGE_LEVELS.map((option) => {
            const { code, description } = splitWordChatLevelLabel(option, t(wordChatLevelLabelKey(option)));
            const selected = level === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setLevel(option)}
                className={[
                  'onboarding-option flex items-baseline gap-3 px-4 py-3 text-left',
                  selected ? 'onboarding-option-highlight' : '',
                ].join(' ')}
              >
                <strong className="text-sm font-black tabular-nums">{code}</strong>
                <span className="text-sm font-semibold">{description}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={() => void onSubmit(level)}
          className="onboarding-option onboarding-option-highlight mt-6 w-full px-5 py-3.5 text-base font-extrabold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-wait disabled:opacity-50"
        >
          {t('onboarding.continue')}
        </button>
      </section>
    </main>
  );
}
