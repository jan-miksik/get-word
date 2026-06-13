'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { LearningLanguage } from './types';

function filterLanguages(languages: LearningLanguage[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return languages;
  return languages.filter((language) => (
    language.name.toLowerCase().includes(normalizedQuery) ||
    language.code.toLowerCase().includes(normalizedQuery)
  ));
}

type LanguageComboboxProps = {
  id: string;
  label: string;
  value: string;
  languages: LearningLanguage[];
  loading: boolean;
  onChange: (value: string) => void;
};

export function LanguageCombobox({
  id,
  label,
  value,
  languages,
  loading,
  onChange,
}: LanguageComboboxProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selectedLanguage = languages.find((language) => language.code === value);
  const hasSelection = Boolean(selectedLanguage || value);
  const shownLanguages = filterLanguages(languages, query);
  const placeholder = loading
    ? t('onboarding.loadingLanguages')
    : t('onboarding.searchLanguages');

  function selectLanguage(code: string) {
    onChange(code);
    setQuery('');
    setOpen(false);
  }

  return (
    <label className="relative block min-w-0">
      <span className="mb-2 block text-lg font-extrabold uppercase tracking-wide sm:text-xl">{label}</span>
      <div className="onboarding-combobox min-h-[66px] px-3 py-2">
        <div className="mb-1 flex min-w-0 items-center gap-2 text-sm font-bold">
          <span className="inline-flex min-w-6 justify-center text-lg" aria-hidden="true">
            {hasSelection ? selectedLanguage?.flag ?? '•' : ''}
          </span>
          <span className={`min-w-0 flex-1 truncate ${hasSelection ? '' : 'onboarding-text-soft'}`}>
            {hasSelection ? selectedLanguage?.name ?? value.toUpperCase() : t('onboarding.selectLanguage')}
          </span>
        </div>
        <input
          id={id}
          type="search"
          role="combobox"
          value={query}
          autoComplete="off"
          placeholder={placeholder}
          aria-label={`${label} language`}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          className="onboarding-combobox-input w-full bg-transparent text-sm outline-none"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open ? (
        <div
          id={`${id}-options`}
          role="listbox"
          className="onboarding-combobox-list absolute z-30 mt-2 max-h-72 w-full overflow-y-auto p-1"
        >
          {loading ? (
            <div className="px-3 py-2 text-sm onboarding-text-soft">{t('onboarding.loadingLanguages')}</div>
          ) : shownLanguages.length > 0 ? (
            shownLanguages.map((language) => (
              <button
                key={language.code}
                type="button"
                role="option"
                aria-selected={language.code === value}
                className="onboarding-combobox-option flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectLanguage(language.code)}
              >
                <span className="inline-flex min-w-6 justify-center text-base" aria-hidden="true">
                  {language.flag ?? ''}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{language.name}</span>
                <span className="text-xs uppercase onboarding-text-soft">{language.code}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm onboarding-text-soft">{t('onboarding.noLanguagesFound')}</div>
          )}
        </div>
      ) : null}
    </label>
  );
}
