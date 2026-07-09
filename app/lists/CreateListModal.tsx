'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import type { CreateListOptions } from '@/features/lists/client/actions';
import {
  getLanguageFlag,
  getLocalizedLanguageName,
  getNativeLanguageName,
  normalizeLanguageCode,
  normalizeLanguageSearchText,
} from '@/lib/i18n/languages';

type LanguageOption = { code: string; name: string; ttsAvailable?: boolean };

// Resolve the two names we show for a language: its name in the current UI
// language, and its own native/origin name (e.g. "Vietnamese" + "Tiếng Việt").
// Mirrors the onboarding combobox so the editor selectors read the same way.
function resolveNames(language: LanguageOption, uiLanguage: string) {
  const code = normalizeLanguageCode(language.code);
  const localized = getLocalizedLanguageName(code, uiLanguage) ?? language.name;
  const native = getNativeLanguageName(code);
  return { code, localized, native };
}

function filterLanguages(
  languages: LanguageOption[],
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

type EditorLanguageComboboxProps = {
  id: string;
  label: string;
  value: string;
  languages: LanguageOption[];
  onChange: (value: string) => void;
};

// Same layout as the onboarding combobox (flag + localized/native names) but
// wearing the editor's dark-navy surface tokens so it fits the New-list modal.
function EditorLanguageCombobox({
  id,
  label,
  value,
  languages,
  onChange,
}: EditorLanguageComboboxProps) {
  const { t, language: uiLanguage } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = languages.find((language) => language.code === value);
  const hasSelection = Boolean(selected || value);
  const shown = filterLanguages(languages, query, uiLanguage);

  const selectedNames = selected ? resolveNames(selected, uiLanguage) : null;
  const selectedFlag = hasSelection
    ? getLanguageFlag(value) ?? '•'
    : '';
  const selectedPrimary = selectedNames?.localized ?? value.toUpperCase();

  function selectLanguage(code: string) {
    onChange(code);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  // Close only on a genuine pointer-down outside the combobox; the input's own
  // blur fires spuriously (e.g. tapping an option) and closes the dropdown too
  // early.
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
    <div ref={rootRef} className="relative block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-soft">
        {label}
      </span>
      <div className="rounded-lg border border-border-subtle bg-background px-3 py-2 focus-within:border-accent">
        <div className="mb-1 flex min-w-0 items-center gap-2 text-sm font-medium">
          {hasSelection ? (
            <span
              className="inline-flex min-w-6 justify-center text-lg leading-none"
              aria-hidden="true"
            >
              {selectedFlag}
            </span>
          ) : null}
          <span className={`min-w-0 flex-1 truncate ${hasSelection ? 'text-text' : 'text-text-soft'}`}>
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
          placeholder={t('onboarding.searchLanguages')}
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          className="w-full bg-transparent text-sm text-text outline-none placeholder:text-text-soft"
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
          className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border-subtle bg-background-elevated p-1 shadow-lg"
        >
          {shown.length > 0 ? (
            shown.map((language) => {
              const { code, localized, native } = resolveNames(language, uiLanguage);
              const flag = getLanguageFlag(code);
              return (
                <button
                  key={language.code}
                  type="button"
                  role="option"
                  aria-selected={language.code === value}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-background/60 ${
                    language.code === value ? 'text-accent' : 'text-text'
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectLanguage(language.code)}
                >
                  <span
                    className="inline-flex min-w-6 justify-center text-base"
                    aria-hidden="true"
                  >
                    {flag ?? ''}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{localized}</span>
                    {native && native !== localized ? (
                      <span className="block truncate text-[0.7rem] leading-tight text-text-soft">
                        {native}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs uppercase text-text-soft">{language.code}</span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 text-sm text-text-soft">
              {t('onboarding.noLanguagesFound')}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export type { CreateListOptions };

type CreateListModalProps = {
  isOpen: boolean;
  languages: LanguageOption[];
  initialLangFrom: string;
  initialLangTo: string;
  onClose: () => void;
  onCreate: (
    name: string,
    langFrom: string,
    langTo: string,
    options: CreateListOptions,
  ) => Promise<void>;
};

export function CreateListModal({
  isOpen,
  languages,
  initialLangFrom,
  initialLangTo,
  onClose,
  onCreate,
}: CreateListModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [langFrom, setLangFrom] = useState(initialLangFrom);
  const [langTo, setLangTo] = useState(initialLangTo);
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setIsPublic(false);
      setLangFrom(initialLangFrom);
      setLangTo(initialLangTo);
      const id = window.setTimeout(() => nameRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [isOpen, initialLangFrom, initialLangTo]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const canCreate = name.trim().length > 0 && langFrom !== langTo && !creating;

  async function handleCreate() {
    if (!canCreate) return;
    setCreating(true);
    try {
      await onCreate(name.trim(), langFrom, langTo, {
        description: description.trim(),
        isPublic,
      });
      onClose();
    } finally {
      setCreating(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative mt-12 w-full max-w-md rounded-2xl border border-border-subtle bg-background-elevated shadow-xl sm:mt-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <h2 className="text-base font-semibold text-text">{t('lists.newList')}</h2>
          <button
            type="button"
            className="text-lg leading-none text-text-soft transition-colors hover:text-text"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-soft">
              {t('lists.listName')}
            </span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              placeholder={t('lists.listName')}
              className="w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCreate();
              }}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-soft">
              {t('lists.description')}
            </span>
            <textarea
              value={description}
              rows={2}
              placeholder={t('lists.descriptionPlaceholder')}
              className="w-full resize-none rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <EditorLanguageCombobox
              id="create-list-from"
              label={t('onboarding.iKnow')}
              value={langFrom}
              languages={languages}
              onChange={setLangFrom}
            />
            <EditorLanguageCombobox
              id="create-list-to"
              label={t('onboarding.iWantToLearn')}
              value={langTo}
              languages={languages}
              onChange={setLangTo}
            />
          </div>

          {langFrom === langTo ? (
            <p className="text-xs text-[var(--text-soft)]">{t('onboarding.samePairWarning')}</p>
          ) : null}

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-soft">
              {t('share.manageTitle')}
            </span>
            <div
              role="radiogroup"
              className="grid grid-cols-2 gap-1 rounded-lg border border-border-subtle bg-background p-1"
            >
              <button
                type="button"
                role="radio"
                aria-checked={!isPublic}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  !isPublic
                    ? 'bg-accent text-background shadow-sm'
                    : 'text-text-soft hover:text-text'
                }`}
                onClick={() => setIsPublic(false)}
              >
                {t('share.visibilityPrivate')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={isPublic}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isPublic
                    ? 'bg-accent text-background shadow-sm'
                    : 'text-text-soft hover:text-text'
                }`}
                onClick={() => setIsPublic(true)}
              >
                {t('share.visibilityPublic')}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-text-soft">
              {isPublic ? t('lists.publicListHelp') : t('share.visibilityPrivateSub')}
            </p>
          </div>
        </div>

        <div className="flex gap-2 border-t border-border-subtle px-5 py-4">
          <button
            type="button"
            className="flex-1 rounded-lg border border-border-subtle py-2 text-sm font-medium text-text transition-colors hover:bg-background/50"
            onClick={onClose}
          >
            {t('lists.cancelCreate')}
          </button>
          <button
            type="button"
            disabled={!canCreate}
            className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-background shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
            onClick={handleCreate}
          >
            {creating ? t('lists.creating') : t('lists.create')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
