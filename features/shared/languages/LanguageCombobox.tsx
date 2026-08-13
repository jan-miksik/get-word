'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { getLanguageVariantTag } from '@/lib/language-variants';
import {
  getLanguageFlag,
  getLocalizedLanguageName,
  getNativeLanguageName,
  normalizeLanguageCode,
  normalizeLanguageSearchText,
} from '@/lib/i18n/languages';
import type { SupportedLearningLanguage } from './types';

// Resolve the two names we show for a language: its name in the current UI
// language, and its own native/origin name (e.g. "Vietnamese" + "Tiếng Việt").
function resolveNames(language: SupportedLearningLanguage, uiLanguage: string) {
  const code = normalizeLanguageCode(language.code);
  // Regional variants label through `displayCode`, so British and American
  // English read as two distinct names instead of two identical "English" rows.
  const labelCode = normalizeLanguageCode(language.displayCode ?? language.code);
  const localized = getLocalizedLanguageName(labelCode, uiLanguage) ?? language.name;
  const native = getNativeLanguageName(labelCode);
  return { code, localized, native, tag: getLanguageVariantTag(language.code) };
}

function filterLanguages(
  languages: SupportedLearningLanguage[],
  query: string,
  uiLanguage: string,
) {
  const rawQuery = query.trim().toLowerCase();
  if (!rawQuery) return languages;
  const foldedQuery = normalizeLanguageSearchText(query);
  return languages.filter((language) => {
    const { code, localized, native, tag } = resolveNames(language, uiLanguage);
    const names = [language.name, code, localized, native, tag].filter(
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
  languages: SupportedLearningLanguage[];
  loading: boolean;
  onChange: (value: string) => void;
  disabledCodes?: string[];
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
  disabledCodes = [],
  highlight = false,
}: LanguageComboboxProps) {
  const { t, language: uiLanguage } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // Default to the desktop combobox on the server and first client paint so
  // hydration matches; the effect below flips touch devices to the sheet.
  const [isTouch, setIsTouch] = useState(false);
  // Bottom offset + max height for the touch sheet, tracked against the visual
  // viewport so the sheet rides above the Android keyboard instead of fighting
  // the layout-viewport resize that made the absolute dropdown flicker.
  const [sheetMetrics, setSheetMetrics] = useState({ bottom: 0, maxHeight: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const selectedLanguage = languages.find((language) => language.code === value);
  const hasSelection = Boolean(selectedLanguage || value);
  const shownLanguages = filterLanguages(languages, query, uiLanguage);
  const disabledCodeSet = new Set(disabledCodes.map(normalizeLanguageCode));
  const placeholder = loading
    ? t('onboarding.loadingLanguages')
    : t('onboarding.searchLanguages');

  const selectedNames = selectedLanguage
    ? resolveNames(selectedLanguage, uiLanguage)
    : null;
  const selectedFlag = hasSelection
    ? selectedLanguage?.flag ?? getLanguageFlag(value) ?? '•'
    : '';
  // No locale tag on the closed field: the localized name already carries the
  // region ("angličtina (Velká Británie)" vs "angličtina (USA)"), so a trailing
  // "· EN-GB" only repeated it. The tag stays in the option rows, where names
  // are truncated and the column tells the two variants apart at a glance.
  const selectedPrimary = selectedNames?.localized ?? value.toUpperCase();

  function selectLanguage(code: string) {
    if (disabledCodeSet.has(normalizeLanguageCode(code))) return;
    onChange(code);
    setQuery('');
    setOpen(false);
    // Drop focus from the search input so the mobile keyboard dismisses after
    // a selection instead of lingering over the rest of the onboarding form.
    inputRef.current?.blur();
    sheetInputRef.current?.blur();
  }

  function focusInput() {
    inputRef.current?.focus();
    setOpen(true);
  }

  // Detect coarse pointers once mounted. Kept out of render state initialization
  // so SSR and the first client render agree (both desktop), avoiding a
  // hydration mismatch before this resolves.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setIsTouch(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Desktop only: close on a completed click outside the combobox. Relying on
  // the input's `blur` event closes the dropdown spuriously. The touch sheet
  // handles its own dismissal via the backdrop.
  useEffect(() => {
    if (!open || isTouch) return;
    function handleClick(event: MouseEvent) {
      const root = rootRef.current;
      const target = event.target;
      const clickedInside =
        root &&
        ((target instanceof Node && root.contains(target)) ||
          (typeof event.composedPath === 'function' && event.composedPath().includes(root)));
      if (!clickedInside) setOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [open, isTouch]);

  // Touch sheet: keep it pinned above the keyboard and lock the background so a
  // stray page scroll can neither dismiss the sheet nor drift behind it.
  useEffect(() => {
    if (!open || !isTouch) return;
    const vv = window.visualViewport;
    const update = () => {
      if (vv) {
        const bottom = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        setSheetMetrics({ bottom, maxHeight: Math.max(220, vv.height - 24) });
      } else {
        setSheetMetrics({ bottom: 0, maxHeight: Math.max(220, window.innerHeight - 24) });
      }
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, isTouch]);

  const optionRows = loading ? (
    <div className="px-3 py-2 text-sm onboarding-text-soft">{t('onboarding.loadingLanguages')}</div>
  ) : shownLanguages.length > 0 ? (
    shownLanguages.map((language) => {
      const { code, localized, native } = resolveNames(language, uiLanguage);
      const flag = language.flag ?? getLanguageFlag(code);
      const disabled = disabledCodeSet.has(code);
      return (
        <button
          key={language.code}
          type="button"
          role="option"
          aria-selected={language.code === value}
          disabled={disabled}
          className={`onboarding-combobox-option flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
            disabled ? 'cursor-not-allowed opacity-40' : ''
          }`}
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
          {/* Regional variants label through their locale ("EN-GB", "EN-US"):
              the stored code for British English is a bare "en", which next to
              "en-US" reads as plain English versus a regional one. */}
          <span className="text-xs uppercase onboarding-text-soft">
            {getLanguageVariantTag(language.code) ?? language.code}
          </span>
        </button>
      );
    })
  ) : (
    <div className="px-3 py-2 text-sm onboarding-text-soft">{t('onboarding.noLanguagesFound')}</div>
  );

  // Shared affordance marking the field as a picker that opens a language list.
  const chevron = (
    <svg
      className="onboarding-text-soft shrink-0"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );

  // Touch: the closed field is a plain button so tapping it opens the sheet
  // without focusing a text input — no keyboard, no viewport resize, no
  // flicker. The search input lives inside the sheet and only raises the
  // keyboard when the visitor deliberately taps it to type.
  if (isTouch) {
    return (
      <div ref={rootRef} className="relative block min-w-0">
        <span className="block text-lg font-extrabold uppercase tracking-wide sm:text-xl">
          {label}
        </span>
        <button
          type="button"
          id={id}
          aria-label={`${label} language`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          className={`onboarding-combobox min-h-[66px] w-full px-3 py-2 text-left ${
            highlight && !hasSelection ? 'onboarding-combobox-highlight' : ''
          }`}
          onClick={() => setOpen(true)}
        >
          <div className="flex min-h-[46px] min-w-0 items-center gap-2.5 font-bold">
            {hasSelection ? (
              <span className="inline-flex min-w-7 justify-center text-2xl leading-none" aria-hidden="true">
                {selectedFlag}
              </span>
            ) : null}
            <span
              className={`min-w-0 flex-1 truncate text-lg ${
                hasSelection ? '' : 'onboarding-text-soft text-base font-semibold'
              }`}
            >
              {hasSelection ? selectedPrimary : t('onboarding.selectLanguage')}
            </span>
            {chevron}
          </div>
        </button>
        {open && typeof document !== 'undefined'
          ? createPortal(
              <div
                className="onboarding-combobox-backdrop"
                onClick={() => setOpen(false)}
              >
                <div
                  className="onboarding-combobox-sheet"
                  style={{ bottom: sheetMetrics.bottom, maxHeight: sheetMetrics.maxHeight || undefined }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="onboarding-combobox-sheet-search">
                    <input
                      ref={sheetInputRef}
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
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setOpen(false);
                      }}
                    />
                  </div>
                  <div
                    id={`${id}-options`}
                    role="listbox"
                    className="onboarding-combobox-sheet-list"
                    style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
                  >
                    {optionRows}
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative block min-w-0 ${open ? 'z-40' : ''}`}>
      {/* Plain heading, not a `<label htmlFor>`: associating it would forward
          clicks to the input in browser-specific ways. Tapping the heading is
          deliberately not an open trigger. */}
      <span
        className="block text-lg font-extrabold uppercase tracking-wide sm:text-xl"
        onPointerDown={() => setOpen(false)}
      >
        {label}
      </span>
      {/* The list is anchored to this wrapper rather than to the root. Where a
          caller aligns two pickers with subgrid — the landing hero does — the
          root is a grid container, and an absolutely positioned child of a grid
          container takes the container's padding box as its containing block
          instead of its place in the flow. The list was landing at top:0, over
          the field and its heading, rather than under the field. */}
      <div className="relative min-w-0">
        <div
          className={`onboarding-combobox min-h-[66px] px-3 py-2 ${
            highlight && !hasSelection ? 'onboarding-combobox-highlight' : ''
          }`}
          onPointerDown={(event) => {
            if (event.target === inputRef.current) return;
            event.preventDefault();
            focusInput();
          }}
        >
          <div className="mb-1 flex h-7 min-w-0 items-center gap-2 font-bold">
            {hasSelection ? (
              <span className="inline-flex min-w-6 justify-center text-xl leading-none" aria-hidden="true">
                {selectedFlag}
              </span>
            ) : null}
            <span
              className={`min-w-0 flex-1 truncate text-lg ${
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
            onPointerDown={() => setOpen(true)}
            onClick={() => setOpen(true)}
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
            className="onboarding-combobox-list absolute left-0 top-full z-30 mt-2 max-h-72 w-full overflow-y-auto p-1"
            style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
          >
            {optionRows}
          </div>
        ) : null}
      </div>
    </div>
  );
}
