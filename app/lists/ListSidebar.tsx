'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { GoogleUsageResponse, WordList } from '@/features/lists/types';
import { GoogleUsagePanel } from './GoogleUsagePanel';
import { useI18n } from '@/components/I18nProvider';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CreateListModal } from './CreateListModal';

interface ListSidebarProps {
  lists: WordList[];
  selectedListId: string | null;
  subscribedListIds: Set<string>;
  googleUsage?: GoogleUsageResponse | null;
  languages?: { code: string; name: string; ttsAvailable?: boolean }[];
  canManageCommonLists?: boolean;
  initialCreateLanguageFrom?: string | null;
  initialCreateLanguageTo?: string | null;
  onSelectList: (id: string) => void;
  onCreateList: (name: string, langFrom: string, langTo: string) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
  onEditList?: (listId: string) => void;
  onSubscribe: (listId: string) => Promise<void>;
  onUnsubscribe: (listId: string) => Promise<void>;
  onFork?: (listId: string) => Promise<void>;
  openCreateSignal?: number;
}

function ForkIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="6" cy="5" r="2.25" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="6" r="2.25" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="19" r="2.25" stroke="currentColor" strokeWidth="2" />
      <path d="M6 7.25v9.5M8.25 5.75h4.5A5.25 5.25 0 0118 11v-2.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ListBadges({ list }: { list: WordList }) {
  const { t } = useI18n();

  return (
    <>
      {list.isCommon && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-fresh/10 text-fresh">
          {t('lists.badgeCommon')}
        </span>
      )}
      {list.isRecommended && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent">
          {t('lists.badgeRecommended')}
        </span>
      )}
      {list.isPublic && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-done/10 text-done">
          {t('lists.badgePublic')}
        </span>
      )}
      {!list.isPublic && !list.isCommon && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-text-soft/10 text-text-soft">
          {t('lists.badgePrivate')}
        </span>
      )}
    </>
  );
}

export function ListSidebar({
  lists,
  selectedListId,
  subscribedListIds,
  googleUsage,
  languages = [],
  canManageCommonLists = false,
  initialCreateLanguageFrom,
  initialCreateLanguageTo,
  onSelectList,
  onCreateList,
  onDeleteList,
  onEditList,
  onSubscribe,
  onUnsubscribe,
  onFork,
  openCreateSignal = 0,
}: ListSidebarProps) {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [newLangFrom, setNewLangFrom] = useState('cs');
  const [newLangTo, setNewLangTo] = useState('vi');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [returningToApp, setReturningToApp] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<WordList | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isOwnedList = (list: WordList) => list.isOwner ?? list.ownerId !== null;
  const canManageSharedList = (list: WordList) => canManageCommonLists && Boolean(list.isCommon);
  const canManageList = (list: WordList) => isOwnedList(list) || canManageSharedList(list);
  const curatedLists = lists.filter((list) => list.isPublic && Boolean(list.isRecommended));
  const ownLists = lists.filter((list) => isOwnedList(list) && !curatedLists.some((curated) => curated.id === list.id));
  const publicLists = lists.filter((list) =>
    list.isPublic &&
    !list.isRecommended &&
    !isOwnedList(list)
  );

  useEffect(() => {
    if (openCreateSignal > 0) {
      setShowCreate(true);
    }
  }, [openCreateSignal]);

  useEffect(() => {
    if (initialCreateLanguageFrom) setNewLangFrom(initialCreateLanguageFrom);
    if (initialCreateLanguageTo) setNewLangTo(initialCreateLanguageTo);
  }, [initialCreateLanguageFrom, initialCreateLanguageTo]);

  useEffect(() => {
    if (!openDropdownId) return;
    function handlePointerDown(e: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenDropdownId(null);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDropdownId]);

  const createLanguageOptions = languages.length > 0 ? languages : [
    { code: 'cs', name: t('languageName.cs') },
    { code: 'vi', name: t('languageName.vi') },
    { code: 'en', name: t('languageName.en') },
  ];

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

  function handleDeleteClick(list: WordList) {
    setOpenDropdownId(null);
    setDeleteConfirm(list);
  }

  async function handleDeleteConfirmed() {
    if (!deleteConfirm) return;
    const list = deleteConfirm;
    setDeleteConfirm(null);
    setDeletingId(list.id);
    try {
      await onDeleteList(list.id);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleFork(listId: string) {
    if (!onFork) return;
    setOpenDropdownId(null);
    setTogglingId(`fork:${listId}`);
    try {
      await onFork(listId);
    } finally {
      setTogglingId(null);
    }
  }

  function handleEditClick(listId: string) {
    setOpenDropdownId(null);
    onSelectList(listId);
    onEditList?.(listId);
  }

  function toggleDropdown(e: React.MouseEvent, listId: string) {
    e.stopPropagation();
    setOpenDropdownId((prev) => (prev === listId ? null : listId));
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border-subtle">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 mb-3 px-3.5 py-2 rounded-lg bg-fresh/15 border border-fresh/40 text-sm font-semibold text-fresh hover:bg-fresh/25 transition-colors"
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
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
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
            {ownLists.map((list) => {
              const isForking = togglingId === `fork:${list.id}`;
              const isDropdownOpen = openDropdownId === list.id;
              const canDelete = canManageList(list);

              return (
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
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-text-soft">
                      <span>{list.languageFrom} → {list.languageTo}</span>
                      <ListBadges list={list} />
                    </div>
                  </button>

                  {/* Three-dots menu */}
                  <div className="relative shrink-0" ref={isDropdownOpen ? dropdownRef : undefined}>
                    <button
                      type="button"
                      className="p-1.5 rounded-md text-text-soft opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 group-focus-within:opacity-100 hover:text-text hover:bg-background/80 focus-visible:opacity-100 disabled:opacity-40 data-[open=true]:opacity-100"
                      data-open={isDropdownOpen}
                      onClick={(e) => toggleDropdown(e, list.id)}
                      disabled={deletingId === list.id || isForking}
                      aria-label={t('lists.optionsFor', { name: list.name })}
                    >
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <circle cx="10" cy="4" r="1.5" />
                        <circle cx="10" cy="10" r="1.5" />
                        <circle cx="10" cy="16" r="1.5" />
                      </svg>
                    </button>

                    {isDropdownOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 min-w-[130px] rounded-lg border border-border-subtle bg-background shadow-lg py-1">
                        {onFork && (
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-background-elevated transition-colors"
                            onClick={() => handleFork(list.id)}
                          >
                            <ForkIcon />
                            {t('lists.copyList')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-background-elevated transition-colors"
                          onClick={() => handleEditClick(list.id)}
                        >
                          <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                            <path d="M11.5 4.5l4 4L7 17H3v-4L11.5 4.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          {t('lists.edit')}
                        </button>
                        {canDelete && (
                          <>
                            <div className="my-1 border-t border-border-subtle" />
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 transition-colors"
                              onClick={() => handleDeleteClick(list)}
                            >
                              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                                <path d="M4 6h12M8 3h4M7 6v10m6-10v10M6 6l.6 10.2A1 1 0 007.6 17h4.8a1 1 0 001-.8L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                              {t('lists.delete')}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {curatedLists.length > 0 && (
          <div className="mb-4">
            <h3 className="px-2 py-1 text-xs font-medium text-text-soft uppercase tracking-wide">
              {t('lists.curatedLists')}
            </h3>
            {curatedLists.map((list) => {
              const isSubscribed = subscribedListIds.has(list.id);
              const canSubscribe = !isOwnedList(list);
              const canEdit = canManageList(list);
              const canDelete = canManageList(list);
              const isToggling = togglingId === list.id;
              const isForking = togglingId === `fork:${list.id}`;
              const isDropdownOpen = openDropdownId === `cur:${list.id}`;

              return (
                <div
                  key={list.id}
                  className={`group flex items-stretch gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    selectedListId === list.id
                      ? 'bg-accent/15'
                      : 'hover:bg-background/50'
                  }`}
                >
                  <button
                    type="button"
                    className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition-colors ${
                      selectedListId === list.id
                        ? 'bg-background/60 text-accent'
                        : 'text-text hover:bg-background/60'
                    }`}
                    onClick={() => onSelectList(list.id)}
                  >
                    <div className="font-medium truncate">{list.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-text-soft">
                      <span>{list.languageFrom} → {list.languageTo}</span>
                      <ListBadges list={list} />
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2 border-l border-border-subtle pl-3">
                    {canSubscribe && (
                      <button
                        type="button"
                        disabled={isToggling}
                        className={`relative h-5 w-10 shrink-0 rounded-full transition-colors ${
                          isSubscribed ? 'bg-accent' : 'bg-border-subtle'
                        } ${isToggling ? 'opacity-50' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSubscription(list.id);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={isSubscribed ? t('lists.unsubscribe') : t('lists.subscribe')}
                        aria-label={`${isSubscribed ? t('lists.unsubscribe') : t('lists.subscribe')} ${list.name}`}
                      >
                        <div
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                            isSubscribed ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    )}

                    {(onFork || canEdit || canDelete) && (
                      <div className="relative shrink-0" ref={isDropdownOpen ? dropdownRef : undefined}>
                        <button
                          type="button"
                          className="p-1.5 rounded-md text-text-soft opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 group-focus-within:opacity-100 hover:text-text hover:bg-background/80 focus-visible:opacity-100 data-[open=true]:opacity-100"
                          data-open={isDropdownOpen}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDropdownId((prev) => (prev === `cur:${list.id}` ? null : `cur:${list.id}`));
                          }}
                          disabled={isForking}
                          aria-label={t('lists.optionsFor', { name: list.name })}
                        >
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                            <circle cx="10" cy="4" r="1.5" />
                            <circle cx="10" cy="10" r="1.5" />
                            <circle cx="10" cy="16" r="1.5" />
                          </svg>
                        </button>

                        {isDropdownOpen && (
                          <div className="absolute right-0 top-full mt-1 z-50 min-w-[130px] rounded-lg border border-border-subtle bg-background shadow-lg py-1">
                            {onFork && (
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-background-elevated transition-colors"
                                onClick={() => handleFork(list.id)}
                                disabled={isForking}
                              >
                                <ForkIcon />
                                {isForking ? t('lists.copying') : t('lists.copyList')}
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-background-elevated transition-colors"
                                onClick={() => handleEditClick(list.id)}
                              >
                                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                                  <path d="M11.5 4.5l4 4L7 17H3v-4L11.5 4.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                {t('lists.edit')}
                              </button>
                            )}
                            {canDelete && (
                              <>
                                {(onFork || canEdit) && <div className="my-1 border-t border-border-subtle" />}
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 transition-colors"
                                  onClick={() => handleDeleteClick(list)}
                                >
                                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                                    <path d="M4 6h12M8 3h4M7 6v10m6-10v10M6 6l.6 10.2A1 1 0 007.6 17h4.8a1 1 0 001-.8L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                  </svg>
                                  {t('lists.delete')}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {publicLists.length > 0 && (
          <div className="mb-4">
            <h3 className="px-2 py-1 text-xs font-medium text-text-soft uppercase tracking-wide">
              {t('lists.publicLists')}
            </h3>
            {publicLists.map((list) => {
              const isSubscribed = subscribedListIds.has(list.id);
              const canSubscribe = !isOwnedList(list);
              const canEdit = canManageList(list);
              const canDelete = canManageList(list);
              const isToggling = togglingId === list.id;
              const isForking = togglingId === `fork:${list.id}`;
              const isDropdownOpen = openDropdownId === `pub:${list.id}`;

              return (
                <div
                  key={list.id}
                  className={`group flex items-stretch gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    selectedListId === list.id
                      ? 'bg-accent/15'
                      : 'hover:bg-background/50'
                  }`}
                >
                  <button
                    type="button"
                    className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition-colors ${
                      selectedListId === list.id
                        ? 'bg-background/60 text-accent'
                        : 'text-text hover:bg-background/60'
                    }`}
                    onClick={() => onSelectList(list.id)}
                  >
                    <div className="font-medium truncate">{list.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-text-soft">
                      <span>{list.languageFrom} → {list.languageTo}</span>
                      <ListBadges list={list} />
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2 border-l border-border-subtle pl-3">
                    {canSubscribe && (
                      <button
                        type="button"
                        disabled={isToggling}
                        className={`relative h-5 w-10 shrink-0 rounded-full transition-colors ${
                          isSubscribed ? 'bg-accent' : 'bg-border-subtle'
                        } ${isToggling ? 'opacity-50' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSubscription(list.id);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={isSubscribed ? t('lists.unsubscribe') : t('lists.subscribe')}
                        aria-label={`${isSubscribed ? t('lists.unsubscribe') : t('lists.subscribe')} ${list.name}`}
                      >
                        <div
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                            isSubscribed ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    )}

                    {/* Three-dots for public lists */}
                    {(onFork || canEdit || canDelete) && (
                      <div className="relative shrink-0" ref={isDropdownOpen ? dropdownRef : undefined}>
                        <button
                          type="button"
                          className="p-1.5 rounded-md text-text-soft opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 group-focus-within:opacity-100 hover:text-text hover:bg-background/80 focus-visible:opacity-100 data-[open=true]:opacity-100"
                          data-open={isDropdownOpen}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDropdownId((prev) => (prev === `pub:${list.id}` ? null : `pub:${list.id}`));
                          }}
                          disabled={isForking}
                          aria-label={t('lists.optionsFor', { name: list.name })}
                        >
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                            <circle cx="10" cy="4" r="1.5" />
                            <circle cx="10" cy="10" r="1.5" />
                            <circle cx="10" cy="16" r="1.5" />
                          </svg>
                        </button>

                        {isDropdownOpen && (
                          <div className="absolute right-0 top-full mt-1 z-50 min-w-[130px] rounded-lg border border-border-subtle bg-background shadow-lg py-1">
                            {onFork && (
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-background-elevated transition-colors"
                                onClick={() => handleFork(list.id)}
                                disabled={isForking}
                              >
                                <ForkIcon />
                                {isForking ? t('lists.copying') : t('lists.copyList')}
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-background-elevated transition-colors"
                                onClick={() => handleEditClick(list.id)}
                              >
                                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                                  <path d="M11.5 4.5l4 4L7 17H3v-4L11.5 4.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                {t('lists.edit')}
                              </button>
                            )}
                            {canDelete && (
                              <>
                                {(onFork || canEdit) && <div className="my-1 border-t border-border-subtle" />}
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 transition-colors"
                                  onClick={() => handleDeleteClick(list)}
                                >
                                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                                    <path d="M4 6h12M8 3h4M7 6v10m6-10v10M6 6l.6 10.2A1 1 0 007.6 17h4.8a1 1 0 001-.8L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                  </svg>
                                  {t('lists.delete')}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor-only: global Google API usage */}
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
                <span>{t('lists.percentUsed', { percent })}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="p-3 border-t border-border-subtle">
        <button
          type="button"
          className="w-full py-2.5 rounded-lg bg-accent text-background text-sm font-semibold shadow-sm hover:bg-accent/90 transition-colors"
          onClick={() => setShowCreate(true)}
        >
          + {t('lists.newList')}
        </button>
      </div>

      <CreateListModal
        isOpen={showCreate}
        languages={createLanguageOptions}
        initialLangFrom={newLangFrom}
        initialLangTo={newLangTo}
        onClose={() => setShowCreate(false)}
        onCreate={onCreateList}
      />

      <ConfirmModal
        isOpen={Boolean(deleteConfirm)}
        title={t('lists.deleteConfirm', { name: deleteConfirm?.name ?? '' })}
        message={t('lists.deleteListMessage')}
        confirmLabel={t('lists.delete')}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteConfirm(null)}
      />

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
                  <h2 className="text-sm font-semibold text-text">{t('lists.googleApiUsage')}</h2>
                  <button
                    type="button"
                    className="text-lg leading-none text-text-soft transition-colors hover:text-text"
                    onClick={() => setUsageModalOpen(false)}
                    aria-label={t('common.close')}
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
              <div className="text-text-soft">{t('common.loadingApp')}</div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
