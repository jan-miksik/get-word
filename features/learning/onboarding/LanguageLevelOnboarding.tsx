'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { getLanguageQuestionForm } from '@/lib/i18n/language-in-question';
import { getLocalizedLanguageName } from '@/lib/i18n/languages';
import {
  type WordChatLanguageLevel,
} from '@/features/word-chat/public.client';
import { OnboardingScreen, OnboardingTitle } from './OnboardingScreen';

const LEVEL_RANGES = [
  {
    value: 'A0',
    levels: ['A0', 'A1'],
    range: 'A1',
    labelKey: 'onboarding.level.beginner',
  },
  {
    value: 'A2',
    levels: ['A2', 'B1'],
    range: 'A2–B1',
    labelKey: 'onboarding.level.intermediate',
  },
  {
    value: 'B2',
    levels: ['B2', 'C1'],
    range: 'B2–C1',
    labelKey: 'onboarding.level.advanced',
  },
] as const satisfies readonly {
  value: WordChatLanguageLevel;
  levels: readonly WordChatLanguageLevel[];
  range: string;
  labelKey: 'onboarding.level.beginner' | 'onboarding.level.intermediate' | 'onboarding.level.advanced';
}[];

function LevelIcon() {
  return (
    <svg aria-hidden viewBox="0 0 64 64" className="onboarding-step-icon" fill="none">
      <circle
        cx="32"
        cy="32"
        r="29"
        fill="var(--ob-surface-hover, var(--paper-hi))"
        stroke="var(--ob-ink, var(--ink))"
        strokeWidth="2"
      />
      <rect x="16" y="36" width="8" height="12" rx="2" fill="var(--ob-surface, var(--paper))" stroke="var(--ob-ink, var(--ink))" strokeWidth="2.5" />
      <rect x="28" y="28" width="8" height="20" rx="2" fill="var(--ob-accent, var(--sea))" stroke="var(--ob-ink, var(--ink))" strokeWidth="2.5" />
      <rect x="40" y="18" width="8" height="30" rx="2" fill="var(--ob-surface, var(--paper))" stroke="var(--ob-ink, var(--ink))" strokeWidth="2.5" />
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
  // Nothing is chosen for a fresh learner. A saved exact CEFR point still
  // highlights the broad range that contains it when someone revisits the step.
  const [level, setLevel] = useState<WordChatLanguageLevel | null>(initialLevel);
  const [submitted, setSubmitted] = useState(false);
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

      {/* Three broad choices are easier to self-assess than six adjacent CEFR
          points. They save their conservative lower bound for new answers;
          revisiting an older exact answer keeps that value within its range. */}
      <div role="radiogroup" aria-label={t('wordChat.levelSettingLabel')} className="grid gap-2 text-left">
        {LEVEL_RANGES.map((option, index) => {
          const description = t(option.labelKey);
          const selected = option.levels.some((candidate) => candidate === level);
          const disabled = pending || submitted;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${description}, ${option.range}`}
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                const nextLevel = initialLevel && option.levels.some(
                  (candidate) => candidate === initialLevel,
                )
                  ? initialLevel
                  : option.value;
                setLevel(nextLevel);
                setSubmitted(true);
                void onSubmit(nextLevel);
              }}
              className={[
                'onboarding-option group flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 motion-safe:animate-[word-chat-setup-option-in_260ms_ease-out_both]',
                selected ? 'onboarding-option-highlight' : '',
              ].join(' ')}
              style={{ animationDelay: `${60 + index * 45}ms` }}
            >
              <span className="min-w-0">
                <span className="block text-base font-extrabold leading-snug sm:text-lg">
                  {description}
                </span>
                <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-wide onboarding-text-soft">
                  {option.range}
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
    </OnboardingScreen>
  );
}
