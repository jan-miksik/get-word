'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { GoogleUsageResponse, WordList } from '@/features/lists/types';
import { GoogleUsagePanel } from './GoogleUsagePanel';
import { useI18n } from '@/components/I18nProvider';

interface ListSidebarProps {
  lists: WordList[];
  selectedListId: string | null;
  subscribedListIds: Set<string>;
  googleUsage?: GoogleUsageResponse | null;
  languages?: { code: string; name: string; ttsAvailable?: boolean }[];
  initialCreateLanguageFrom?: string | null;
  initialCreateLanguageTo?: string | null;
  onSelectList: (id: string) => void;
  onCreateList: (name: string, langFrom: string, langTo: string) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
  onSubscribe: (listId: string) => Promise<void>;
  onUnsubscribe: (listId: string) => Promise<void>;
  onFork?: (listId: string) => Promise<void>;
  openCreateSignal?: number;
}

export function ListSidebar({
  lists,
  selectedListId,
  subscribedListIds,
  googleUsage,
  languages = [],
  initialCreateLanguageFrom,
  initialCreateLanguageTo,
  onSelectList,
  onCreateList,
  onDeleteList,
  onSubscribe,
  onUnsubscribe,
  onFork,
  openCreateSignal = 0,
}: ListSidebarProps) {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLangFrom, setNewLangFrom] = useState('cs');
  const [newLangTo, setNewLangTo] = useState('vi');
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [returningToApp, setReturningToApp] = useState(false);

  const ownLists = lists.filter((l) => l.isOwner ?? l.ownerId !== null);
  const publicLists = lists.filter((l) => !(l.isOwner ?? l.ownerId !== null) && l.isPublic);

  useEffect(() => {
    if (openCreateSignal > 0) {
      setShowCreate(true);
    }
  }, [openCreateSignal]);

  useEffect(() => {
    if (initialCreateLanguageFrom) setNewLangFrom(initialCreateLanguageFrom);
    if (initialCreateLanguageTo) setNewLangTo(initialCreateLanguageTo);
  }, [initialCreateLanguageFrom, initialCreateLanguageTo]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await onCreateList(newName.trim(), newLangFrom, newLangTo);
      setNewName('');
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleSubscription(listId: string) {
    setTogglingId(listId);
    try {
      if (subscribedListIds.has(listId)) {
        await onUnsubscribe(listId);
      } else {
        await onSubscribe(listId);
      }
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(list: WordList) {
    const shouldDelete = window.confirm(t('lists.deleteConfirm', { name: list.name }));
    if (!shouldDelete) return;

    setDeletingId(list.id);
    try {
      await onDeleteList(list.id);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleFork(listId: string) {
    if (!onFork) return;
    setTogglingId(`fork:${listId}`);
    try {
      await onFork(listId);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border-subtle">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-text-soft hover:text-accent transition-colors mb-2"
          onClick={(event) => {
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.altKey ||
              event.ctrlKey ||
              event.shiftKey
            ) {
              return;
            }
            setReturningToApp(true);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('lists.backToApp')}
        </Link>
        <h2 className="text-lg font-semibold text-text">{t('lists.wordLists')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {ownLists.length > 0 && (
          <div className="mb-4">
            <h3 className="px-2 py-1 text-xs font-medium text-text-soft uppercase tracking-wide">
              {t('lists.yourLists')}
            </h3>
            {ownLists.map((list) => (
              <div
                key={list.id}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedListId === list.id
                    ? 'bg-accent/15'
                    : 'hover:bg-background/50'
                }`}
              >
                <button
                  type="button"
                  className={`flex-1 min-w-0 text-left ${
                    selectedListId === list.id
                      ? 'text-accent'
                      : 'text-text'
                  }`}
                  onClick={() => onSelectList(list.id)}
                >
                  <div className="font-medium truncate">{list.name}</div>
                  <div className="text-xs text-text-soft mt-0.5">
                    {list.languageFrom} → {list.languageTo}
                  </div>
                </button>

                <button
                  type="button"
                  className="shrink-0 p-1.5 rounded-md text-text-soft opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 group-focus-within:opacity-100 hover:text-danger hover:bg-danger/10 focus-visible:opacity-100 disabled:opacity-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(list);
                  }}
                  disabled={deletingId === list.id}
                  title={t('lists.delete')}
                  aria-label={`${t('lists.delete')} ${list.name}`}
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="text-current">
                    <path d="M4 6h12M8 3h4M7 6v10m6-10v10M6 6l.6 10.2A1 1 0 007.6 17h4.8a1 1 0 001-.8L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {publicLists.length > 0 && (
          <div className="mb-4">
            <h3 className="px-2 py-1 text-xs font-medium text-text-soft uppercase tracking-wide">
              {t('lists.curatedLists')}
            </h3>
            {publicLists.map((list) => {
              const isSubscribed = subscribedListIds.has(list.id);
              const isToggling = togglingId === list.id;
              const isForking = togglingId === `fork:${list.id}`;

              return (
                <div
                  key={list.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedListId === list.id
                      ? 'bg-accent/15'
                      : 'hover:bg-background/50'
                  }`}
                >
                  <button
                    type="button"
                    className={`flex-1 text-left min-w-0 ${
                      selectedListId === list.id ? 'text-accent' : 'text-text'
                    }`}
                    onClick={() => onSelectList(list.id)}
                  >
                    <div className="font-medium truncate">{list.name}</div>
                    <div className="text-xs text-text-soft mt-0.5">
                      {list.languageFrom} → {list.languageTo}
                    </div>
                  </button>

                  {/* Subscription toggle */}
                  <button
                    type="button"
                    disabled={isToggling}
                    className={`shrink-0 w-10 h-5 rounded-full transition-colors relative ${
                      isSubscribed ? 'bg-accent' : 'bg-border-subtle'
                    } ${isToggling ? 'opacity-50' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleSubscription(list.id);
                    }}
                    title={isSubscribed ? t('lists.unsubscribe') : t('lists.subscribe')}
                    aria-label={`${isSubscribed ? t('lists.unsubscribe') : t('lists.subscribe')} ${list.name}`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        isSubscribed ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>

                  {onFork ? (
                    <button
                      type="button"
                      disabled={isForking}
                      className="shrink-0 rounded-md border border-border-subtle px-2 py-1 text-[11px] text-text-soft transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFork(list.id);
                      }}
                      title="Fork this list"
                    >
                      {isForking ? 'Forking...' : 'Fork'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor-only: global Google API usage — the 'global' field is only included in the response for editor accounts */}
      {googleUsage?.global && googleUsage.global.length > 0 && (
        <div className="border-t border-border-subtle px-3 py-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-text-soft">
            {t('lists.googleApi')}
          </p>
          {googleUsage.global.map((scope) => {
            const percent =
              scope.free_monthly_units > 0
                ? Math.round((scope.used_units / scope.free_monthly_units) * 100)
                : 0;
            return (
              <button
                key={scope.scope}
                type="button"
                className="flex w-full items-center justify-between py-0.5 text-[11px] text-text-soft hover:text-text transition-colors"
                onClick={() => setUsageModalOpen(true)}
              >
                <span>{scope.scope === 'translate' ? t('lists.googleTranslate') : t('lists.googleTts')}</span>
                <span>{percent}% used</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="p-3 border-t border-border-subtle">
        {showCreate ? (
          <div className="space-y-2">
            <input
              type="text"
              placeholder={t('lists.listName')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border-subtle text-text text-sm focus:outline-none focus:border-accent"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex gap-2">
              <select
                value={newLangFrom}
                onChange={(e) => setNewLangFrom(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg bg-background border border-border-subtle text-text text-xs"
              >
                {(languages.length > 0 ? languages : [
                  { code: 'cs', name: 'Czech' },
                  { code: 'vi', name: 'Vietnamese' },
                  { code: 'en', name: 'English' },
                ]).map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
              <span className="text-text-soft self-center text-xs">→</span>
              <select
                value={newLangTo}
                onChange={(e) => setNewLangTo(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg bg-background border border-border-subtle text-text text-xs"
              >
                {(languages.length > 0 ? languages : [
                  { code: 'vi', name: 'Vietnamese' },
                  { code: 'cs', name: 'Czech' },
                  { code: 'en', name: 'English' },
                ]).map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-1.5 rounded-lg border border-border-subtle text-text text-xs hover:bg-background/50"
                onClick={() => setShowCreate(false)}
              >
                {t('lists.cancelCreate')}
              </button>
              <button
                type="button"
                disabled={creating || !newName.trim()}
                className="flex-1 py-1.5 rounded-lg bg-accent text-background text-xs font-medium disabled:opacity-50"
                onClick={handleCreate}
              >
                {creating ? t('lists.creating') : t('lists.create')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="w-full py-2 rounded-lg border border-dashed border-border-subtle text-text-soft text-sm hover:border-accent hover:text-accent transition-colors"
            onClick={() => setShowCreate(true)}
          >
            + {t('lists.newList')}
          </button>
        )}
      </div>
      {usageModalOpen && googleUsage
        ? createPortal(
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 sm:p-6"
              onClick={() => setUsageModalOpen(false)}
            >
              <div
                className="relative max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border-subtle bg-background shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4 sm:px-6">
                  <h2 className="text-sm font-semibold text-text">Google API Usage</h2>
                  <button
                    type="button"
                    className="text-lg leading-none text-text-soft transition-colors hover:text-text"
                    onClick={() => setUsageModalOpen(false)}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                <div className="px-5 py-5 sm:px-6">
                  <GoogleUsagePanel usage={googleUsage} compact />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {returningToApp
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background text-text">
              <div className="text-text-soft">Loading app...</div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
