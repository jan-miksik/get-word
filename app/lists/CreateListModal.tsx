'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';

type LanguageOption = { code: string; name: string; ttsAvailable?: boolean };

function filterLanguages(languages: LanguageOption[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return languages;
  return languages.filter(
    (language) =>
      language.name.toLowerCase().includes(normalized) ||
      language.code.toLowerCase().includes(normalized),
  );
}

type EditorLanguageComboboxProps = {
  id: string;
  label: string;
  value: string;
  languages: LanguageOption[];
  onChange: (value: string) => void;
};

function EditorLanguageCombobox({
  id,
  label,
  value,
  languages,
  onChange,
}: EditorLanguageComboboxProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = languages.find((language) => language.code === value);
  const hasSelection = Boolean(selected || value);
  const shown = filterLanguages(languages, query);

  function selectLanguage(code: string) {
    onChange(code);
    setQuery('');
    setOpen(false);
  }

  return (
    <label className="relative block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-soft">
        {label}
      </span>
      <div className="rounded-lg border border-border-subtle bg-background px-3 py-2 focus-within:border-accent">
        <div className="mb-1 truncate text-sm font-medium">
          <span className={hasSelection ? 'text-text' : 'text-text-soft'}>
            {hasSelection
              ? selected?.name ?? value.toUpperCase()
              : t('onboarding.selectLanguage')}
          </span>
        </div>
        <input
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
          className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border-subtle bg-background-elevated p-1 shadow-lg"
        >
          {shown.length > 0 ? (
            shown.map((language) => (
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
                <span className="min-w-0 flex-1 truncate font-medium">{language.name}</span>
                <span className="text-xs uppercase text-text-soft">{language.code}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-text-soft">
              {t('onboarding.noLanguagesFound')}
            </div>
          )}
        </div>
      ) : null}
    </label>
  );
}

type CreateListModalProps = {
  isOpen: boolean;
  languages: LanguageOption[];
  initialLangFrom: string;
  initialLangTo: string;
  onClose: () => void;
  onCreate: (name: string, langFrom: string, langTo: string) => Promise<void>;
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
  const [langFrom, setLangFrom] = useState(initialLangFrom);
  const [langTo, setLangTo] = useState(initialLangTo);
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
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
      await onCreate(name.trim(), langFrom, langTo);
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
            <p className="text-xs text-danger">{t('onboarding.samePairWarning')}</p>
          ) : null}
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
