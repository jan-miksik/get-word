'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import {
  getLanguageFlag,
  getLocalizedLanguageName,
  getNativeLanguageName,
  normalizeLanguageCode,
  normalizeLanguageSearchText,
} from '@/lib/i18n/languages';
import type { LearningLanguage } from './types';

// Resolve the two names we show for a language: its name in the current UI
// language, and its own native/origin name (e.g. "Vietnamese" + "Tiếng Việt").
function resolveNames(language: LearningLanguage, uiLanguage: string) {
  const code = normalizeLanguageCode(language.code);
  const localized = getLocalizedLanguageName(code, uiLanguage) ?? language.name;
  const native = getNativeLanguageName(code);
  return { code, localized, native };
}

function filterLanguages(
  languages: LearningLanguage[],
  query: string,
  uiLanguage: string,
) {
  const rawQuery = query.trim().toLowerCase();
  if (!rawQuery) return languages;
  const foldedQuery = normalizeLanguageSearchText(query);
  return languages.filter((language) => {
    const { code, localized, native } = resolveNames(language, uiLanguage);
    const names = [language.name, code, localized, native].filter(
      (value): value is string => Boolean(value && value.trim()),
    );
    return names.some((name) => {
      const rawName = name.toLowerCase();
      return (
        rawName.includes(rawQuery) ||
        (foldedQuery.length >= 2 &&
          normalizeLanguageSearchText(name).includes(foldedQuery))
      );
    });
  });
}

type LanguageComboboxProps = {
  id: string;
  label: string;
  value: string;
  languages: LearningLanguage[];
  loading: boolean;
  onChange: (value: string) => void;
  // Draw an accent ring around the field while it is still empty, to point the
  // user at the input that needs their attention. The cue clears itself once a
  // language is selected, so both comboboxes look identical once filled.
  highlight?: boolean;
};

export function LanguageCombobox({
  id,
  label,
  value,
  languages,
  loading,
  onChange,
  highlight = false,
}: LanguageComboboxProps) {
  const { t, language: uiLanguage } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLLabelElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedLanguage = languages.find((language) => language.code === value);
  const hasSelection = Boolean(selectedLanguage || value);
  const shownLanguages = filterLanguages(languages, query, uiLanguage);
  const placeholder = loading
    ? t('onboarding.loadingLanguages')
    : t('onboarding.searchLanguages');

  const selectedNames = selectedLanguage
    ? resolveNames(selectedLanguage, uiLanguage)
    : null;
  const selectedFlag = hasSelection
    ? selectedLanguage?.flag ?? getLanguageFlag(value) ?? '•'
    : '';
  const selectedPrimary = selectedNames?.localized ?? value.toUpperCase();

  function selectLanguage(code: string) {
    onChange(code);
    setQuery('');
    setOpen(false);
    // Drop focus from the search input so the mobile keyboard dismisses after
    // a selection instead of lingering over the rest of the onboarding form.
    inputRef.current?.blur();
  }

  // Close only on a genuine click/focus outside the combobox. Relying on the
  // input's `blur` event closes the dropdown spuriously, because the wrapping
  // `<label>` re-dispatches clicks to the input (causing a blur→focus bounce).
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <label ref={rootRef} className="relative block min-w-0">
      <span className="mb-2 block text-lg font-extrabold uppercase tracking-wide sm:text-xl">{label}</span>
      <div
        className={`onboarding-combobox min-h-[66px] px-3 py-2 ${
          highlight && !hasSelection ? 'onboarding-combobox-highlight' : ''
        }`}
      >
        <div className="mb-1 flex h-7 min-w-0 items-center gap-2 text-sm font-bold">
          {hasSelection ? (
            <span className="inline-flex min-w-6 justify-center text-lg leading-none" aria-hidden="true">
              {selectedFlag}
            </span>
          ) : null}
          <span
            className={`min-w-0 flex-1 truncate ${
              hasSelection ? '' : 'onboarding-text-soft text-base'
            }`}
          >
            {hasSelection ? selectedPrimary : t('onboarding.selectLanguage')}
          </span>
        </div>
        <input
          ref={inputRef}
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
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
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
            shownLanguages.map((language) => {
              const { code, localized, native } = resolveNames(language, uiLanguage);
              const flag = language.flag ?? getLanguageFlag(code);
              return (
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
                    {flag ?? ''}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{localized}</span>
                    {native && native !== localized ? (
                      <span className="block truncate text-[0.7rem] leading-tight onboarding-text-soft">
                        {native}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs uppercase onboarding-text-soft">{language.code}</span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 text-sm onboarding-text-soft">{t('onboarding.noLanguagesFound')}</div>
          )}
        </div>
      ) : null}
    </label>
  );
}
