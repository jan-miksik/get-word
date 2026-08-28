'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { getLanguageQuestionForm } from '@/lib/i18n/language-in-question';
import { getLocalizedLanguageName } from '@/lib/i18n/languages';
import {
  WORD_CHAT_LANGUAGE_LEVELS,
  splitWordChatLevelLabel,
  wordChatLevelLabelKey,
  type WordChatLanguageLevel,
} from '@/features/word-chat/public.client';
import { OnboardingScreen, OnboardingTitle } from './OnboardingScreen';

function LevelIcon() {
  return (
    <svg aria-hidden viewBox="0 0 64 64" className="onboarding-step-icon" fill="none">
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
  onBack,
  onSubmit,
}: {
  initialLevel?: WordChatLanguageLevel | null;
  /** Language code of what they are learning, shown above the question. */
  targetLanguage?: string | null;
  pending?: boolean;
  /** Back to the languages. Omitted when there is nothing before this step. */
  onBack?: () => void;
  onSubmit: (level: WordChatLanguageLevel) => void | Promise<void>;
}) {
  const { t, language: uiLanguage } = useI18n();
  // Nothing is chosen until the learner chooses it. Landing on this screen with
  // A0 already filled in makes the lowest level the path of least resistance,
  // and the answer decides how hard every generated word will be.
  const [level, setLevel] = useState<WordChatLanguageLevel | null>(initialLevel);
  const questionLanguage = getLanguageQuestionForm(targetLanguage, uiLanguage);
  const targetLanguageName = targetLanguage
    ? getLocalizedLanguageName(targetLanguage, uiLanguage) ?? targetLanguage.toUpperCase()
    : null;

  return (
    <OnboardingScreen step="level" onBack={onBack} contentClassName="text-center">
      <LevelIcon />
      {/* The question names the language itself where the UI locale has a form
          we can vouch for ("Jak dobře umíš vietnamsky?"). Everywhere else it
          asks about "the language" and the name goes above it instead —
          dropping a name into a sentence needs the right case, which not every
          translation of this screen can guarantee. */}
      {targetLanguageName && !questionLanguage ? (
        <p className="m-0 mt-3 text-xs font-black uppercase tracking-[0.16em] text-[color:var(--ob-accent)]">
          {targetLanguageName}
        </p>
      ) : null}
      <OnboardingTitle className="mb-5 mt-2">
        {questionLanguage
          ? t('wordChat.levelTitleLanguage', { language: questionLanguage })
          : t('wordChat.levelTitle')}
      </OnboardingTitle>

      {/* The chat's own level question, which this screen took over: the
          description is the answer and carries the weight, and the CEFR code
          sits under it as a footnote for the people who read in those. */}
      <div role="radiogroup" aria-label={t('wordChat.levelSettingLabel')} className="grid gap-2 text-left">
        {WORD_CHAT_LANGUAGE_LEVELS.map((option, index) => {
          const label = t(wordChatLevelLabelKey(option));
          const { code, description } = splitWordChatLevelLabel(option, label);
          const selected = level === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              onClick={() => setLevel(option)}
              className={[
                'onboarding-option group flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] motion-safe:animate-[word-chat-setup-option-in_260ms_ease-out_both]',
                selected ? 'onboarding-option-highlight' : '',
              ].join(' ')}
              style={{ animationDelay: `${60 + index * 45}ms` }}
            >
              <span className="min-w-0">
                <span className="block text-base font-extrabold leading-snug sm:text-lg">
                  {description}
                </span>
                <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-wide onboarding-text-soft">
                  {code}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="shrink-0 translate-x-0 text-lg transition-transform duration-200 group-hover:translate-x-1"
              >
                →
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={pending || level === null}
        onClick={() => {
          if (level) void onSubmit(level);
        }}
        className="onboarding-option onboarding-option-highlight mt-6 w-full px-5 py-3.5 text-base font-extrabold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('onboarding.continue')}
      </button>
    </OnboardingScreen>
  );
}
