'use client';

import { useCallback, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { SurveyDefinition } from '@/features/learning/surveys/types';

interface SurveyPromptCardProps {
  survey: SurveyDefinition;
  onSubmit: (optionId: string, freeText: string | null) => void;
  onDismiss: () => void;
}

/**
 * A one-shot feedback prompt, config-driven from `SurveyDefinition` — this
 * component never branches on which survey it is (no `recent_changes`/
 * `bug_check` knowledge here), so a future survey is just a new config
 * entry. Not a study exercise: no SRS outcome, so it lives as a sibling to
 * the other interstitial cards, never inside StudyExerciseCard.
 */
export function SurveyPromptCard({ survey, onSubmit, onDismiss }: SurveyPromptCardProps) {
  const { t } = useI18n();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [freeText, setFreeText] = useState('');

  const selectedOption = survey.options.find((option) => option.id === selectedOptionId) ?? null;

  const handleSubmit = useCallback(() => {
    if (!selectedOption) return;
    onSubmit(selectedOption.id, selectedOption.revealsFreeText ? freeText.trim() || null : null);
  }, [freeText, onSubmit, selectedOption]);

  return (
    <div className="relative h-full overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] text-ink-800">
      <article className="mx-auto flex min-h-full w-full max-w-[620px] flex-col justify-center gap-4 py-4">
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('survey.dismissLabel')}
          className="absolute right-4 top-2 flex h-9 w-9 items-center justify-center rounded-full text-[1.3rem] leading-none text-ink-350 transition-colors hover:text-ink-800"
        >
          &times;
        </button>

        <h2 className="m-0 max-w-[560px] text-[1.5rem] font-black leading-tight text-ink-800 sm:text-[1.7rem]">
          {t(survey.questionKey)}
        </h2>

        <div role="radiogroup" aria-label={t(survey.questionKey)} className="flex flex-col gap-2">
          {survey.options.map((option) => {
            const selected = option.id === selectedOptionId;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSelectedOptionId(option.id)}
                className={`flex items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[1rem] font-semibold transition-colors ${
                  selected
                    ? 'border-sea bg-paper-shade text-ink-800'
                    : 'border-ink-350/40 bg-paper text-ink-500 hover:border-sea/60'
                }`}
              >
                {t(option.labelKey)}
              </button>
            );
          })}
        </div>

        {selectedOption?.revealsFreeText && (
          <label className="flex flex-col gap-1.5 text-sm">
            {selectedOption.freeTextIntroKey && (
              <span className="font-medium text-ink-500">{t(selectedOption.freeTextIntroKey)}</span>
            )}
            <textarea
              value={freeText}
              onChange={(event) => setFreeText(event.target.value)}
              maxLength={1000}
              rows={4}
              placeholder={
                selectedOption.freeTextPlaceholderKey ? t(selectedOption.freeTextPlaceholderKey) : undefined
              }
              className="resize-none rounded-lg border-2 border-ink-350/40 bg-paper px-3 py-2 text-ink-800 outline-none focus:border-sea"
            />
          </label>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selectedOption}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full border-2 border-sea bg-sea px-5 py-3 text-[1.05rem] font-black text-paper-shade transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('survey.submitLabel')}
        </button>
      </article>
    </div>
  );
}
