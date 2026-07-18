'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { GoogleUsageResponse, WordList } from '@/features/lists/types';
import { GoogleUsagePanel } from '../GoogleUsagePanel';
import { useI18n } from '@/components/I18nProvider';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CreateListModal, type CreateListOptions } from '../CreateListModal';
import { ListFilterModal } from '../ListFilterModal';
import { ShareVisibilityDialog } from '../ShareVisibilityDialog';
import type { LearningLanguage } from '@/features/shared/languages/types';
import { ForkIcon, ListSidebarItemButton } from './ListSidebarItem';
import { useCreateListWorkflow } from './useCreateListWorkflow';

interface ListSidebarProps {
  lists: WordList[];
  selectedListId: string | null;
  subscribedListIds: Set<string>;
  googleUsage?: GoogleUsageResponse | null;
  languages?: { code: string; name: string; ttsAvailable?: boolean }[];
  canManageCommonLists?: boolean;
  initialCreateLanguageFrom?: string | null;
  initialCreateLanguageTo?: string | null;
  onSelectList: (id: string, intent?: 'select' | 'edit') => boolean | void;
  onCreateList: (
    name: string,
    langFrom: string,
    langTo: string,
    options: CreateListOptions,
  ) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
  onEditList?: (listId: string) => void;
  onSubscribe: (listId: string) => Promise<void>;
  onUnsubscribe: (listId: string) => Promise<void>;
  onFork?: (listId: string) => Promise<void>;
  onListUpdated?: (list: WordList) => void;
  openCreateSignal?: number;
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
  onListUpdated,
  openCreateSignal = 0,
}: ListSidebarProps) {
  const { t } = useI18n();
  const createWorkflow = useCreateListWorkflow({
    openSignal: openCreateSignal,
    initialLanguageFrom: initialCreateLanguageFrom,
    initialLanguageTo: initialCreateLanguageTo,
  });
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [returningToApp, setReturningToApp] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<WordList | null>(null);
  const [shareList, setShareList] = useState<WordList | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isOwnedList = (list: WordList) => list.isOwner ?? list.ownerId !== null;
  const canManageSharedList = (list: WordList) => canManageCommonLists && Boolean(list.isCommon);
  const canManageList = (list: WordList) => isOwnedList(list) || canManageSharedList(list);
  // Managers can change visibility/reset; a public list's link is copyable by anyone.
  const canShareList = (list: WordList) => canManageList(list) || Boolean(list.isPublic);

  // Build the onboarding-style combobox options from the language codes that
  // actually appear across the lists, so the filter never offers a dead pair.
  const languageName = (code: string) =>
    languages.find((language) => language.code === code)?.name ?? code.toUpperCase();
  const toComboboxLanguages = (codes: string[]): LearningLanguage[] =>
    Array.from(new Set(codes))
      .sort((a, b) => languageName(a).localeCompare(languageName(b)))
      .map((code) => ({ code, name: languageName(code), ttsAvailable: true, preferredVoice: null }));
  const fromLanguages = toComboboxLanguages(lists.map((list) => list.languageFrom));
  const toLanguages = toComboboxLanguages(lists.map((list) => list.languageTo));

  const filteredLists = lists.filter((list) => {
    if (filterFrom && list.languageFrom !== filterFrom) return false;
    if (filterTo && list.languageTo !== filterTo) return false;
    if (recommendedOnly && !list.isRecommended) return false;
    return true;
  });
  const hasActiveFilter = Boolean(filterFrom) || Boolean(filterTo) || recommendedOnly;
  const hasRecommended = lists.some((list) => list.isRecommended);
  const activeFilterCount = (filterFrom ? 1 : 0) + (filterTo ? 1 : 0) + (recommendedOnly ? 1 : 0);
  const showFilterBar = fromLanguages.length > 1 || toLanguages.length > 1 || hasRecommended;

  function clearFilters() {
    setFilterFrom('');
    setFilterTo('');
    setRecommendedOnly(false);
  }

  const curatedLists = filteredLists.filter((list) => list.isPublic && Boolean(list.isRecommended));
  const ownLists = filteredLists.filter((list) => isOwnedList(list) && !curatedLists.some((curated) => curated.id === list.id));
  const publicLists = filteredLists.filter((list) =>
    list.isPublic &&
    !list.isRecommended &&
    !isOwnedList(list)
  );
  // Private lists the user joined via a share link: not public, not owned, so
  // they fall through the sections above. Surface them in their own group.
  const sharedWithMeLists = filteredLists.filter((list) =>
    !list.isPublic &&
    !isOwnedList(list) &&
    subscribedListIds.has(list.id)
  );

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
    if (onSelectList(listId, 'edit') === false) return;
    onEditList?.(listId);
  }

  function handleShareClick(list: WordList) {
    setOpenDropdownId(null);
    setShareList(list);
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

      {showFilterBar && (
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <button
            type="button"
            className={`flex flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
              hasActiveFilter
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-border-subtle text-text-soft hover:text-text hover:bg-background/60'
            }`}
            onClick={() => setFilterOpen(true)}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 5h14M6 10h8M9 15h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="flex-1 truncate text-left">
              {hasActiveFilter
                ? `${filterFrom || '·'} → ${filterTo || '·'}`
                : t('lists.filterLanguagePair')}
            </span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-background">
                {activeFilterCount}
              </span>
            )}
          </button>
          {hasActiveFilter && (
            <button
              type="button"
              className="shrink-0 rounded-md p-1.5 text-text-soft hover:text-text hover:bg-background/60 transition-colors"
              onClick={clearFilters}
              aria-label={t('lists.filterClear')}
              title={t('lists.filterClear')}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {hasActiveFilter && filteredLists.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-text-soft">
            {t('lists.filterNoMatches')}
          </p>
        )}
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
                  <ListSidebarItemButton
                    list={list}
                    selected={selectedListId === list.id}
                    ownedStyle
                    onSelect={() => onSelectList(list.id)}
                  />

                  {/* Row actions: share icon + three-dots menu */}
                  <div className="flex shrink-0 items-center gap-0.5" ref={isDropdownOpen ? dropdownRef : undefined}>
                    <button
                      type="button"
                      className="p-1.5 rounded-md text-text-soft opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 group-focus-within:opacity-100 hover:text-text hover:bg-background/80 focus-visible:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShareClick(list);
                      }}
                      aria-label={t('share.manageTitle')}
                      title={t('share.manageTitle')}
                    >
                      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <circle cx="15" cy="5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
                        <circle cx="5" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5" />
                        <circle cx="15" cy="15" r="2.25" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M13 6.2L7 8.8M7 11.2l6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>

                    <div className="relative">
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
                        <div className="absolute right-0 top-full mt-1 z-50 min-w-[170px] overflow-hidden rounded-lg border border-border-subtle bg-background shadow-lg py-1">
                        {onFork && (
                          <button
                            type="button"
                            className="flex w-full items-center justify-start gap-2.5 px-3 py-2 text-left text-xs text-text transition-colors hover:bg-background-elevated"
                            onClick={() => handleFork(list.id)}
                          >
                            <span className="shrink-0">
                              <ForkIcon />
                            </span>
                            <span className="min-w-0 flex-1 leading-snug">{t('lists.copyList')}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="flex w-full items-center justify-start gap-2.5 px-3 py-2 text-left text-xs text-text transition-colors hover:bg-background-elevated"
                          onClick={() => handleEditClick(list.id)}
                        >
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0">
                            <path d="M11.5 4.5l4 4L7 17H3v-4L11.5 4.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="min-w-0 flex-1 leading-snug">{t('lists.edit')}</span>
                        </button>
                        {canDelete && (
                          <>
                            <div className="my-1 border-t border-border-subtle" />
                            <button
                              type="button"
                              className="flex w-full items-center justify-start gap-2.5 px-3 py-2 text-left text-xs text-danger transition-colors hover:bg-danger/10"
                              onClick={() => handleDeleteClick(list)}
                            >
                              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0">
                                <path d="M4 6h12M8 3h4M7 6v10m6-10v10M6 6l.6 10.2A1 1 0 007.6 17h4.8a1 1 0 001-.8L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                              <span className="min-w-0 flex-1 leading-snug">{t('lists.delete')}</span>
                            </button>
                          </>
                        )}
                        </div>
                      )}
                    </div>
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
              const canShare = canShareList(list);
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
                  <ListSidebarItemButton
                    list={list}
                    selected={selectedListId === list.id}
                    onSelect={() => onSelectList(list.id)}
                  />

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

                    {canShare && (
                      <button
                        type="button"
                        className="shrink-0 rounded-md p-1.5 text-text-soft opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-background/80 hover:text-text focus-visible:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShareClick(list);
                        }}
                        aria-label={t('share.manageTitle')}
                        title={t('share.manageTitle')}
                      >
                        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <circle cx="15" cy="5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="5" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="15" cy="15" r="2.25" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M13 6.2L7 8.8M7 11.2l6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
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
                          <div className="absolute right-0 top-full mt-1 z-50 min-w-[150px] overflow-hidden rounded-lg border border-border-subtle bg-background shadow-lg py-1">
                            {onFork && (
                              <button
                                type="button"
                                className="flex w-full items-center justify-start gap-2.5 px-3 py-2 text-left text-xs text-text transition-colors hover:bg-background-elevated"
                                onClick={() => handleFork(list.id)}
                                disabled={isForking}
                              >
                                <span className="shrink-0">
                                  <ForkIcon />
                                </span>
                                <span className="min-w-0 flex-1 leading-snug">{isForking ? t('lists.copying') : t('lists.copyList')}</span>
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                className="flex w-full items-center justify-start gap-2.5 px-3 py-2 text-left text-xs text-text transition-colors hover:bg-background-elevated"
                                onClick={() => handleEditClick(list.id)}
                              >
                                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0">
                                  <path d="M11.5 4.5l4 4L7 17H3v-4L11.5 4.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span className="min-w-0 flex-1 leading-snug">{t('lists.edit')}</span>
                              </button>
                            )}
                            {canDelete && (
                              <>
                                {(onFork || canEdit) && <div className="my-1 border-t border-border-subtle" />}
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-start gap-2.5 px-3 py-2 text-left text-xs text-danger transition-colors hover:bg-danger/10"
                                  onClick={() => handleDeleteClick(list)}
                                >
                                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0">
                                    <path d="M4 6h12M8 3h4M7 6v10m6-10v10M6 6l.6 10.2A1 1 0 007.6 17h4.8a1 1 0 001-.8L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                  </svg>
                                  <span className="min-w-0 flex-1 leading-snug">{t('lists.delete')}</span>
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
                  <ListSidebarItemButton
                    list={list}
                    selected={selectedListId === list.id}
                    onSelect={() => onSelectList(list.id)}
                  />

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
                          <div className="absolute right-0 top-full mt-1 z-50 min-w-[150px] overflow-hidden rounded-lg border border-border-subtle bg-background shadow-lg py-1">
                            {onFork && (
                              <button
                                type="button"
                                className="flex w-full items-center justify-start gap-2.5 px-3 py-2 text-left text-xs text-text transition-colors hover:bg-background-elevated"
                                onClick={() => handleFork(list.id)}
                                disabled={isForking}
                              >
                                <span className="shrink-0">
                                  <ForkIcon />
                                </span>
                                <span className="min-w-0 flex-1 leading-snug">{isForking ? t('lists.copying') : t('lists.copyList')}</span>
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                className="flex w-full items-center justify-start gap-2.5 px-3 py-2 text-left text-xs text-text transition-colors hover:bg-background-elevated"
                                onClick={() => handleEditClick(list.id)}
                              >
                                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0">
                                  <path d="M11.5 4.5l4 4L7 17H3v-4L11.5 4.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span className="min-w-0 flex-1 leading-snug">{t('lists.edit')}</span>
                              </button>
                            )}
                            {canDelete && (
                              <>
                                {(onFork || canEdit) && <div className="my-1 border-t border-border-subtle" />}
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-start gap-2.5 px-3 py-2 text-left text-xs text-danger transition-colors hover:bg-danger/10"
                                  onClick={() => handleDeleteClick(list)}
                                >
                                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0">
                                    <path d="M4 6h12M8 3h4M7 6v10m6-10v10M6 6l.6 10.2A1 1 0 007.6 17h4.8a1 1 0 001-.8L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                  </svg>
                                  <span className="min-w-0 flex-1 leading-snug">{t('lists.delete')}</span>
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

        {sharedWithMeLists.length > 0 && (
          <div className="mb-4">
            <h3 className="px-2 py-1 text-xs font-medium text-text-soft uppercase tracking-wide">
              {t('lists.sharedWithYou')}
            </h3>
            {sharedWithMeLists.map((list) => {
              const isToggling = togglingId === list.id;
              return (
                <div
                  key={list.id}
                  className={`group flex items-stretch gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    selectedListId === list.id ? 'bg-accent/15' : 'hover:bg-background/50'
                  }`}
                >
                  <ListSidebarItemButton
                    list={list}
                    selected={selectedListId === list.id}
                    onSelect={() => onSelectList(list.id)}
                  />

                  <div className="flex shrink-0 items-center gap-2 border-l border-border-subtle pl-3">
                    <button
                      type="button"
                      disabled={isToggling}
                      className={`relative h-5 w-10 shrink-0 rounded-full transition-colors bg-accent ${
                        isToggling ? 'opacity-50' : ''
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSubscription(list.id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      title={t('lists.unsubscribe')}
                      aria-label={`${t('lists.unsubscribe')} ${list.name}`}
                    >
                      <div className="absolute top-0.5 h-4 w-4 translate-x-5 rounded-full bg-white transition-transform" />
                    </button>
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
          onClick={createWorkflow.open}
        >
          + {t('lists.newList')}
        </button>
      </div>

      <CreateListModal
        isOpen={createWorkflow.isOpen}
        languages={createLanguageOptions}
        initialLangFrom={createWorkflow.languageFrom}
        initialLangTo={createWorkflow.languageTo}
        onClose={createWorkflow.close}
        onCreate={onCreateList}
      />

      <ListFilterModal
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        fromLanguages={fromLanguages}
        toLanguages={toLanguages}
        loadingLanguages={false}
        filterFrom={filterFrom}
        filterTo={filterTo}
        onFilterFromChange={setFilterFrom}
        onFilterToChange={setFilterTo}
        hasRecommended={hasRecommended}
        recommendedOnly={recommendedOnly}
        onRecommendedOnlyChange={setRecommendedOnly}
        hasActiveFilter={hasActiveFilter}
        onClear={clearFilters}
      />

      <ConfirmModal
        isOpen={Boolean(deleteConfirm)}
        title={t('lists.deleteConfirm', { name: deleteConfirm?.name ?? '' })}
        message={t('lists.deleteListMessage')}
        confirmLabel={t('lists.delete')}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteConfirm(null)}
      />

      {shareList && (
        <ShareVisibilityDialog
          list={shareList}
          canManage={canManageList(shareList)}
          onClose={() => setShareList(null)}
          onListUpdated={onListUpdated}
        />
      )}

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
