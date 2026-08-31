'use client';

import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { LanguageCombobox } from '@/features/shared/languages/LanguageCombobox';
import type { LearningLanguage } from '@/features/shared/languages/types';

type ListFilterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  fromLanguages: LearningLanguage[];
  toLanguages: LearningLanguage[];
  loadingLanguages: boolean;
  filterFrom: string;
  filterTo: string;
  onFilterFromChange: (value: string) => void;
  onFilterToChange: (value: string) => void;
  hasRecommended: boolean;
  recommendedOnly: boolean;
  onRecommendedOnlyChange: (value: boolean) => void;
  hasActiveFilter: boolean;
  onClear: () => void;
};

export function ListFilterModal({
  isOpen,
  onClose,
  fromLanguages,
  toLanguages,
  loadingLanguages,
  filterFrom,
  filterTo,
  onFilterFromChange,
  onFilterToChange,
  hasRecommended,
  recommendedOnly,
  onRecommendedOnlyChange,
  hasActiveFilter,
  onClear,
}: ListFilterModalProps) {
  const { t } = useI18n();
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="onboarding-overlay fixed inset-0 z-[65] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <section
        className="onboarding-card relative w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold">{t('lists.filterTitle')}</h2>
          <button
            type="button"
            className="text-lg leading-none onboarding-text-soft transition-opacity hover:opacity-70"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <LanguageCombobox
            id="list-filter-from"
            label={t('onboarding.iKnow')}
            value={filterFrom}
            languages={fromLanguages}
            loading={loadingLanguages}
            onChange={onFilterFromChange}
            disabledCodes={filterTo ? [filterTo] : []}
          />
          <LanguageCombobox
            id="list-filter-to"
            label={t('onboarding.iWantToLearn')}
            value={filterTo}
            languages={toLanguages}
            loading={loadingLanguages}
            onChange={onFilterToChange}
            disabledCodes={filterFrom ? [filterFrom] : []}
          />

          {hasRecommended ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={recommendedOnly}
                onChange={(e) => onRecommendedOnlyChange(e.target.checked)}
                className="h-4 w-4 accent-[var(--ob-accent,var(--sea))]"
              />
              {t('lists.filterRecommendedOnly')}
            </label>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            className="text-sm font-bold underline onboarding-text-soft disabled:opacity-40"
            onClick={onClear}
            disabled={!hasActiveFilter}
          >
            {t('lists.filterClear')}
          </button>
          <button
            type="button"
            className="onboarding-option onboarding-option-highlight rounded-xl px-5 py-2 text-sm font-extrabold"
            onClick={onClose}
          >
            {t('lists.filterDone')}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
