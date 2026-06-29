'use client';

import { Fragment, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { listsApiFetch } from '@/features/lists/api';
import {
  readStoredOpenRouterModel,
  readStoredTranslationProvider,
  writeStoredOpenRouterModel,
  writeStoredTranslationProvider,
} from '@/features/lists/client/storage';
import type {
  CompletedTranslationRow,
  ConfirmResult,
  GoogleUsageResponse,
  WordCategory,
  WordList,
} from '@/features/lists/types';
import { GoogleUsageHint } from './GoogleUsageHint';
import {
  DEFAULT_OPENROUTER_TRANSLATION_MODEL,
  OPENROUTER_MODELS_URL,
  OPENROUTER_TRANSLATION_MODELS,
  normalizeOpenRouterModel,
} from '@/lib/openrouter-models';
import { copyTextToClipboard } from '@/lib/clipboard';
import { MAX_COMMENT_TEXT_LENGTH } from '@/lib/word-item-comment';
import {
  polishPair,
  type PolishFixCode,
  type PolishWarningCode,
} from '@/lib/formatting-polish';

type PendingItem = NonNullable<ConfirmResult['pending_items']>[number];

type PolishField = 'known' | 'target';

type PolishChange = {
  key: string;
  rowId: string;
  field: PolishField;
  before: string;
  after: string;
  fixCodes: PolishFixCode[];
};

type PolishWarningRow = {
  key: string;
  rowId: string;
  field: PolishField;
  text: string;
  code: PolishWarningCode;
};

type PolishScan = { changes: PolishChange[]; warnings: PolishWarningRow[] };

interface TranslationStepProps {
  list: WordList;
  pendingItems: PendingItem[];
  // Ids of the rows that were freshly added in this edit pass. They render
  // first; a spacer separates them from the category's existing words below.
  newItemIds?: Set<string>;
  inputLanguage: 'known' | 'target';
  heading?: string;
  googleUsage?: GoogleUsageResponse | null;
  onInputLanguageChange?: (language: 'known' | 'target') => void;
  onComplete: (rows: CompletedTranslationRow[]) => Promise<void>;
  onSkip: () => Promise<void>;
  onUsageRefresh?: () => Promise<void>;
  onBack?: () => void;
  // Marks duplicate items for removal (used by the dedupe modal and the per-row
  // ⋮ menu). The delete is committed by the wizard when this step completes;
  // here we only drop them from the visible rows.
  onRemoveItem?: (itemId: string) => void;
  // Categories of the list, offered in the per-row ⋮ menu so a word can be moved
  // into (or out of "no category" into) a category.
  categories?: WordCategory[];
  // Persists a category change for a single item immediately. Resolves on
  // success; rejects to let the step revert its optimistic update.
  onAssignCategory?: (itemId: string, categoryId: string) => Promise<void>;
}

type TranslationRow = CompletedTranslationRow;

type OpenRouterUiState =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'failed_retryable';

type TranslationProvider = 'google' | 'openrouter';

interface TranslationTextareaProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  maxLength?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}

function TranslationTextarea({
  value,
  onChange,
  ariaLabel,
  placeholder,
  maxLength,
  onFocus,
  onBlur,
}: TranslationTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeToContent = useCallback((element: HTMLTextAreaElement) => {
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (!textareaRef.current) return;
    resizeToContent(textareaRef.current);
  }, [resizeToContent, value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        resizeToContent(e.currentTarget);
      }}
      aria-label={ariaLabel}
      placeholder={placeholder}
      maxLength={maxLength}
      onFocus={onFocus}
      onBlur={onBlur}
      rows={1}
      className="block min-h-7 w-full cursor-text select-text resize-none overflow-hidden bg-transparent text-sm leading-relaxed text-text focus:outline-none placeholder:text-text-soft/50"
      spellCheck={false}
    />
  );
}

interface RowMenuProps {
  categories: WordCategory[];
  currentCategoryId: string | null;
  canDelete: boolean;
  canAssign: boolean;
  busy: boolean;
  onDelete: () => void;
  onAssign: (categoryId: string) => void;
}

function RowMenu({
  categories,
  currentCategoryId,
  canDelete,
  canAssign,
  busy,
  onDelete,
  onAssign,
}: RowMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const showCategories = canAssign && categories.length > 0;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={t('lists.rowMenuLabel')}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
        className="flex h-6 w-6 items-center justify-center rounded-md text-text-soft transition-colors hover:bg-background-elevated hover:text-text disabled:opacity-40"
      >
        {busy ? (
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-border-subtle bg-background py-1 shadow-xl"
        >
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-danger transition-colors hover:bg-danger/10"
            >
              {t('lists.deleteRow')}
            </button>
          )}
          {showCategories && (
            <>
              {canDelete && <div className="my-1 border-t border-border-subtle" />}
              <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-text-soft/70">
                {t('lists.moveToCategory')}
              </div>
              <div className="max-h-48 overflow-y-auto">
                {categories.map((category) => {
                  const active = currentCategoryId === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        setOpen(false);
                        if (!active) onAssign(category.id);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-background-elevated ${
                        active ? 'text-text' : 'text-text-soft hover:text-text'
                      }`}
                    >
                      <span className="w-3 shrink-0 text-accent" aria-hidden>
                        {active ? '✓' : ''}
                      </span>
                      <span className="min-w-0 flex-1 break-words">{category.name}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function TranslationStep({
  list,
  pendingItems,
  newItemIds,
  inputLanguage,
  heading,
  googleUsage,
  onInputLanguageChange,
  onComplete,
  onSkip,
  onUsageRefresh,
  onBack,
  onRemoveItem,
  categories = [],
  onAssignCategory,
}: TranslationStepProps) {
  const { t } = useI18n();
  const [rows, setRows] = useState<TranslationRow[]>(() =>
    pendingItems.map((item) => ({
      id: item.id,
      textKnown: item.text_known ?? '',
      textTarget: item.text_target ?? '',
      // Items that already have both fields are considered translated
      status: (item.text_known && item.text_target ? 'ok' : 'pending') as TranslationRow['status'],
      comment: item.comment ?? '',
    }))
  );
  // Per-row category, tracked locally so the ⋮ menu and the "no category"
  // warning stay in sync after an assignment without a full reload. Seeded from
  // the pending items; `null` means the word currently has no category.
  const [categoryByRow, setCategoryByRow] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(pendingItems.map((item) => [item.id, item.category_id ?? null])),
  );
  const [assigningRowId, setAssigningRowId] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<TranslationProvider>(() => readStoredTranslationProvider());
  const [openRouterState, setOpenRouterState] = useState<OpenRouterUiState>('not_connected');
  const [openRouterLoading, setOpenRouterLoading] = useState(false);
  const [openRouterModel, setOpenRouterModel] = useState(
    () => readStoredOpenRouterModel() ?? DEFAULT_OPENROUTER_TRANSLATION_MODEL,
  );
  const [clearColumn, setClearColumn] = useState<'known' | 'target' | null>(null);
  const [generatingComments, setGeneratingComments] = useState(false);
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [copiedMode, setCopiedMode] = useState<'plain' | 'comments' | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const [polishScan, setPolishScan] = useState<PolishScan | null>(null);
  const [showPolishModal, setShowPolishModal] = useState(false);
  const [polishSelected, setPolishSelected] = useState<Set<string>>(new Set());
  const [polishCleanNotice, setPolishCleanNotice] = useState(false);
  const polishNoticeTimeoutRef = useRef<number | null>(null);

  const needsTranslation = inputLanguage === 'known' ? 'textTarget' : 'textKnown';
  const hasSource = inputLanguage === 'known' ? 'textKnown' : 'textTarget';

  // Where to draw the spacer between freshly added words and the category's
  // existing words. Only when both groups are present in the visible rows.
  const firstExistingIndex =
    newItemIds && newItemIds.size > 0
      ? rows.findIndex((r) => !newItemIds.has(r.id))
      : -1;
  const dividerIndex = firstExistingIndex > 0 ? firstExistingIndex : -1;

  const pendingCount = rows.filter((r) => !r[needsTranslation] || r.status === 'pending').length;
  const readyCount = rows.filter((r) => r[needsTranslation] && r.status !== 'pending').length;
  const dedupCount = rows.filter((r) => r.source === 'dedup').length;
  const googleTranslateUsage = googleUsage?.account.find((scope) => scope.scope === 'translate');
  const isGooglePaused = Boolean(googleTranslateUsage?.paused);
  const googlePausedMessage = googleTranslateUsage?.limit_message
    ?? t('lists.googleLimitReached');
  const resolvedHeading = heading ?? t('lists.translateWords');
  const formatLanguageLabel = useCallback((code: string) => {
    const normalized = code.toLowerCase();
    if (normalized === 'cs' || normalized === 'cz') return t('languageName.cs');
    if (normalized === 'vi') return t('languageName.vi');
    if (normalized === 'en') return t('languageName.en');
    return code.toUpperCase();
  }, [t]);
  const sourceLanguageCode = inputLanguage === 'known' ? list.languageFrom : list.languageTo;
  const targetLanguageCode = inputLanguage === 'known' ? list.languageTo : list.languageFrom;
  const knownRowsWithTextCount = rows.filter((row) => row.textKnown.trim()).length;
  const targetRowsWithTextCount = rows.filter((row) => row.textTarget.trim()).length;
  const pairedTextsToCopy = rows
    .map((row) => {
      const source = row[hasSource].trim();
      const target = row[needsTranslation].trim();
      return source || target ? `${source}\t${target}` : '';
    })
    .filter(Boolean)
    .join('\n');
  const pairedTextsWithCommentsToCopy = rows
    .map((row) => {
      const source = row[hasSource].trim();
      const target = row[needsTranslation].trim();
      const comment = (row.comment ?? '').trim();
      return source || target || comment ? `${source}\t${target}\t${comment}` : '';
    })
    .filter(Boolean)
    .join('\n');
  const hasAnyComment = rows.some((row) => (row.comment ?? '').trim());
  const clearColumnLanguageLabel =
    clearColumn === 'known'
      ? formatLanguageLabel(list.languageFrom)
      : formatLanguageLabel(list.languageTo);
  const clearColumnRowCount = clearColumn === 'known' ? knownRowsWithTextCount : targetRowsWithTextCount;

  const loadOpenRouterStatus = useCallback(async () => {
    setOpenRouterLoading(true);
    try {
      const res = await listsApiFetch('/api/providers/openrouter/status');
      if (!res.ok) {
        setOpenRouterState('not_connected');
        return;
      }
      const data = await res.json();
      setOpenRouterState((data.state as OpenRouterUiState) ?? 'not_connected');
      setOpenRouterModel(readStoredOpenRouterModel() ?? normalizeOpenRouterModel(data.connection?.translationModel));
    } catch {
      setOpenRouterState('not_connected');
    } finally {
      setOpenRouterLoading(false);
    }
  }, []);

  const handleConnectOpenRouter = useCallback(async () => {
    setError(null);
    setOpenRouterLoading(true);
    try {
      const returnTo =
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`
          : '/lists';
      const res = await listsApiFetch('/api/providers/openrouter/connect/start', {
        method: 'POST',
        body: JSON.stringify({ returnTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? t('lists.openRouterConnectStartFailed'));
      }
      if (!data.authorizeUrl || typeof data.authorizeUrl !== 'string') {
        throw new Error(t('lists.openRouterMissingAuthorizeUrl'));
      }
      setOpenRouterState('connecting');
      window.location.assign(data.authorizeUrl);
    } catch (err) {
      setOpenRouterState('failed_retryable');
      setError(err instanceof Error ? err.message : t('lists.openRouterConnectStartFailed'));
      setOpenRouterLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOpenRouterStatus();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadOpenRouterStatus]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      if (polishNoticeTimeoutRef.current !== null) {
        window.clearTimeout(polishNoticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    writeStoredTranslationProvider(provider);
  }, [provider]);

  const handleAutoTranslate = useCallback(async () => {
    if (provider === 'google' && isGooglePaused) {
      setError(googlePausedMessage);
      return;
    }
    if (provider === 'openrouter' && openRouterState !== 'connected') {
      setError(t('lists.openRouterConnectFirst'));
      return;
    }
    setTranslating(true);
    setError(null);
    try {
      const itemsToTranslate = rows
        .filter((r) => !r[needsTranslation] || r.status === 'pending')
        .map((r) => ({
          id: r.id,
          // Invariant: translate from the source-side text (r[hasSource]), never
          // from a generated target, so register/meaning is never inherited
          // through a chain (target -> target).
          text: r[hasSource],
          from_lang: inputLanguage === 'known' ? list.languageFrom : list.languageTo,
          to_lang: inputLanguage === 'known' ? list.languageTo : list.languageFrom,
        }));

      if (itemsToTranslate.length === 0) return;

      const res = await listsApiFetch('/api/translate/batch', {
        method: 'POST',
        body: JSON.stringify({
          items: itemsToTranslate,
          provider,
          ...(provider === 'openrouter' ? { translation_model: openRouterModel } : {}),
          list_id: list.id,
          input_language: inputLanguage,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? t('lists.translationFailed'));
      }

      const data = await res.json();
      const resultMap = new Map<
        string,
        {
          translated_text: string | null;
          status: string;
          source?: string;
          error?: string;
          warning?: string;
          validation_warnings?: TranslationRow['validationWarnings'];
        }
      >();
      for (const r of data.results) {
        resultMap.set(r.id, r);
      }

      setRows((prev) =>
        prev.map((row) => {
          const result = resultMap.get(row.id);
          if (!result) return row;
          const updated = { ...row };
          if (result.translated_text) {
            if (needsTranslation === 'textTarget') {
              updated.textTarget = result.translated_text;
            } else {
              updated.textKnown = result.translated_text;
            }
          }
          updated.status = result.status === 'ok' ? 'ok' : 'error';
          if (result.source === 'dedup' || result.source === 'api') {
            updated.source = result.source;
          }
          if (result.error) updated.error = result.error;
          updated.warning = result.warning ?? undefined;
          updated.validationWarnings = result.validation_warnings ?? undefined;
          return updated;
        })
      );

      // Surface a top-level error if every item failed
      if (data.results.length > 0 && data.results.every((r: { status: string }) => r.status === 'error')) {
        const firstError = data.results[0]?.error ?? t('lists.translationFailed');
        setError(t('lists.autoTranslateFailed', { message: firstError }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lists.translationFailed'));
    } finally {
      setTranslating(false);
      if (provider === 'google') {
        void onUsageRefresh?.();
      }
    }
  }, [
    rows,
    needsTranslation,
    hasSource,
    provider,
    openRouterModel,
    list,
    inputLanguage,
    openRouterState,
    isGooglePaused,
    googlePausedMessage,
    onUsageRefresh,
    t,
  ]);

  const handleOpenRouterModelChange = useCallback((model: string) => {
    setOpenRouterModel(model);
    writeStoredOpenRouterModel(model);
  }, []);

  const handleOpenRouterModelSave = useCallback(async () => {
    const model = normalizeOpenRouterModel(openRouterModel);
    setOpenRouterModel(model);
    writeStoredOpenRouterModel(model);
    setError(null);
    setOpenRouterLoading(true);
    try {
      const res = await listsApiFetch('/api/providers/openrouter', {
        method: 'PATCH',
        body: JSON.stringify({ translation_model: model }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? t('lists.openRouterModelSaveFailed'));
      }
      const savedModel = normalizeOpenRouterModel(data.connection?.translationModel);
      setOpenRouterModel(savedModel);
      writeStoredOpenRouterModel(savedModel);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lists.openRouterModelSaveFailed'));
    } finally {
      setOpenRouterLoading(false);
    }
  }, [openRouterModel, t]);

  const handleCellEdit = useCallback((id: string, field: 'textKnown' | 'textTarget', value: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, [field]: value, status: 'manual' as const, warning: undefined }
          : row
      )
    );
  }, []);

  const handleCommentEdit = useCallback((id: string, value: string) => {
    const nextValue = value.slice(0, MAX_COMMENT_TEXT_LENGTH);
    setRows((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, comment: nextValue, commentDirty: true } : row
      )
    );
  }, []);

  // Detect duplicate words across the rows currently in view. In the
  // edit-all-words flow these are every item in the list, so this is an
  // effectively list-wide check. A row is a duplicate only when the WHOLE pair
  // (source word + its translation) is an exact match of another row, ignoring
  // only upper/lower case. The same source word with two different translations
  // (e.g. "Không → ne" vs "Không → nula") is NOT a duplicate. We deliberately do
  // NOT collapse internal whitespace or strip punctuation — anything other than
  // a case difference is not a dup. A group of 2+ rows is a duplicate group.
  const duplicateGroups = useMemo(() => {
    const byKey = new Map<string, { key: string; word: string; rows: TranslationRow[] }>();
    for (const row of rows) {
      const word = (row[hasSource] ?? '').trim();
      const translation = (row[needsTranslation] ?? '').trim();
      if (!word) continue;
      const key = `${word.toLowerCase()} ${translation.toLowerCase()}`;
      const group = byKey.get(key);
      if (group) group.rows.push(row);
      else byKey.set(key, { key, word, rows: [row] });
    }
    return [...byKey.values()].filter((group) => group.rows.length > 1);
  }, [rows, hasSource, needsTranslation]);

  const duplicateRowIds = useMemo(
    () => new Set(duplicateGroups.flatMap((group) => group.rows.map((row) => row.id))),
    [duplicateGroups],
  );
  const duplicatesToRemoveCount = duplicateGroups.reduce(
    (sum, group) => sum + group.rows.length - 1,
    0,
  );

  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  // Per group, which row id to keep. Others in the group get removed.
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});

  const openDuplicatesModal = useCallback(() => {
    const defaults: Record<string, string> = {};
    for (const group of duplicateGroups) defaults[group.key] = group.rows[0].id;
    setKeepByGroup(defaults);
    setShowDuplicatesModal(true);
  }, [duplicateGroups]);

  const handleRemoveAllDuplicates = useCallback(() => {
    const removeIds = new Set<string>();
    for (const group of duplicateGroups) {
      const keepId = keepByGroup[group.key] ?? group.rows[0].id;
      for (const row of group.rows) {
        if (row.id !== keepId) removeIds.add(row.id);
      }
    }
    setRows((prev) => prev.filter((row) => !removeIds.has(row.id)));
    for (const id of removeIds) onRemoveItem?.(id);
    setShowDuplicatesModal(false);
  }, [duplicateGroups, keepByGroup, onRemoveItem]);

  // Drop a single row from view and queue its deletion (committed by the wizard
  // when the step completes), mirroring the dedupe-modal removal path.
  const handleDeleteRow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((row) => row.id !== rowId));
    onRemoveItem?.(rowId);
  }, [onRemoveItem]);

  // Persist a category change immediately, optimistically updating local state
  // and reverting on failure. Independent of the queued removals above.
  const handleAssignCategory = useCallback(
    async (rowId: string, categoryId: string) => {
      if (!onAssignCategory) return;
      const previous = categoryByRow[rowId] ?? null;
      setAssigningRowId(rowId);
      setError(null);
      setCategoryByRow((prev) => ({ ...prev, [rowId]: categoryId }));
      try {
        await onAssignCategory(rowId, categoryId);
      } catch (err) {
        setCategoryByRow((prev) => ({ ...prev, [rowId]: previous }));
        setError(err instanceof Error ? err.message : t('lists.saveFailedShort'));
      } finally {
        setAssigningRowId(null);
      }
    },
    [onAssignCategory, categoryByRow, t],
  );

  // Words with no category — only meaningful when assignment is offered (the
  // all-words review). The per-category flows always have a category.
  const uncategorizedCount = onAssignCategory
    ? rows.filter((row) => !categoryByRow[row.id]).length
    : 0;

  // Persist current translation + study-note edits to the DB. Shared by the
  // confirm action and the note-generation action (which needs saved pairs in
  // the DB before the server pass runs). Throws on failure.
  const persistTranslations = useCallback(async () => {
    type TranslationPayload = {
      id: string;
      text_target?: string;
      text_known?: string;
      status?: 'translated' | 'manual';
      comment?: string | null;
    };
    const translations = rows
      .map((r) => {
        const entry: TranslationPayload = { id: r.id };
        let touched = false;
        if (r[needsTranslation]) {
          entry.text_target = r.textTarget || undefined;
          entry.text_known = r.textKnown || undefined;
          entry.status = r.status === 'ok' ? 'translated' : 'manual';
          touched = true;
        }
        // Persist a note edit even on a row that needs no translation. Empty
        // text clears the note (null); the server wraps it as source:"manual".
        if (r.commentDirty) {
          const text = (r.comment ?? '').trim();
          entry.comment = text ? text : null;
          touched = true;
        }
        return touched ? entry : null;
      })
      .filter((entry): entry is TranslationPayload => entry !== null);

    if (translations.length === 0) return;

    const res = await listsApiFetch(`/api/lists/${list.id}/items/translations`, {
      method: 'POST',
      body: JSON.stringify({ translations }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? t('lists.translationSaveFailed'));
    }
  }, [rows, needsTranslation, list.id, t]);

  const handleConfirmTranslations = useCallback(async () => {
    setConfirming(true);
    setError(null);
    try {
      await persistTranslations();
      await onComplete(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lists.saveFailedShort'));
    } finally {
      setConfirming(false);
    }
  }, [persistTranslations, rows, onComplete, t]);

  // Save current edits, then ask the server to auto-write short study notes for
  // any translated pair without a manual note. Manual notes are never touched.
  const handleGenerateComments = useCallback(async () => {
    setGeneratingComments(true);
    setError(null);
    try {
      // Generation runs on saved pairs, so flush local edits first.
      await persistTranslations();

      const res = await listsApiFetch(`/api/lists/${list.id}/generate-comments`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? t('lists.generateStudyNotesFailed'));
      }

      const comments = (data.comments ?? {}) as Record<string, string>;
      // Returned ids are non-manual rows only — safe to merge into the editor.
      setRows((prev) =>
        prev.map((row) =>
          typeof comments[row.id] === 'string'
            ? { ...row, comment: comments[row.id], commentDirty: false }
            : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lists.generateStudyNotesFailed'));
    } finally {
      setGeneratingComments(false);
    }
  }, [persistTranslations, list.id, t]);

  const handleClearColumn = useCallback(async (column: 'known' | 'target') => {
    const field = column === 'known' ? 'textKnown' : 'textTarget';
    setConfirming(true);
    setError(null);
    try {
      const translations = rows
        .filter((row) => row[field].trim())
        .map((row) =>
          column === 'target'
            ? { id: row.id, text_target: null, status: 'manual' as const }
            : { id: row.id, text_known: null, status: 'manual' as const },
        );

      const res = await listsApiFetch(`/api/lists/${list.id}/items/translations`, {
        method: 'POST',
        body: JSON.stringify({ translations }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? t('lists.translationSaveFailed'));
      }

      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          [field]: '',
          status: 'pending' as const,
          error: undefined,
          warning: undefined,
          source: undefined,
        })),
      );
      setClearColumn(null);
      // Point the generation direction at the column we just cleared.
      onInputLanguageChange?.(column === 'target' ? 'known' : 'target');
      void onUsageRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lists.saveFailedShort'));
    } finally {
      setConfirming(false);
    }
  }, [list.id, onInputLanguageChange, onUsageRefresh, rows, t]);

  const flashCopied = useCallback((mode: 'plain' | 'comments') => {
    setCopiedMode(mode);
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = window.setTimeout(() => {
      setCopiedMode(null);
      copyResetTimeoutRef.current = null;
    }, 1800);
  }, []);

  const handleCopyTranslatedTexts = useCallback(async () => {
    if (!pairedTextsToCopy) return;
    setError(null);
    try {
      await copyTextToClipboard(pairedTextsToCopy);
      flashCopied('plain');
    } catch {
      setError(t('lists.copyTranslatedTextsFailed'));
    }
  }, [pairedTextsToCopy, flashCopied, t]);

  const handleCopyTranslatedTextsWithComments = useCallback(async () => {
    if (!pairedTextsWithCommentsToCopy) return;
    setError(null);
    try {
      await copyTextToClipboard(pairedTextsWithCommentsToCopy);
      flashCopied('comments');
    } catch {
      setError(t('lists.copyTranslatedTextsFailed'));
    }
  }, [pairedTextsWithCommentsToCopy, flashCopied, t]);

  // Scan every row's source + target for mechanical formatting issues. Pure and
  // local — it never touches the rows, only produces a reviewable report. The
  // languageFrom/languageTo pairing lets the checker treat a one-word pro-drop
  // translation as a sentence when its partner clearly is one.
  const runPolishCheck = useCallback(() => {
    const changes: PolishChange[] = [];
    const warnings: PolishWarningRow[] = [];
    for (const row of rows) {
      const result = polishPair(
        { text: row.textKnown, lang: list.languageFrom },
        { text: row.textTarget, lang: list.languageTo },
      );
      const sides: Array<{ field: PolishField; text: string; out: typeof result.source }> = [
        { field: 'known', text: row.textKnown, out: result.source },
        { field: 'target', text: row.textTarget, out: result.target },
      ];
      for (const { field, text, out } of sides) {
        if (out.changed) {
          changes.push({
            key: `${row.id}:${field}`,
            rowId: row.id,
            field,
            before: text,
            after: out.fixed,
            fixCodes: out.fixes.map((fix) => fix.code),
          });
        }
        for (const warning of out.warnings) {
          warnings.push({
            key: `${row.id}:${field}:${warning.code}`,
            rowId: row.id,
            field,
            text: out.fixed,
            code: warning.code,
          });
        }
      }
    }
    return { changes, warnings } satisfies PolishScan;
  }, [rows, list.languageFrom, list.languageTo]);

  const handlePolishCheck = useCallback(() => {
    const scan = runPolishCheck();
    if (scan.changes.length === 0 && scan.warnings.length === 0) {
      setPolishScan(null);
      setPolishCleanNotice(true);
      if (polishNoticeTimeoutRef.current !== null) {
        window.clearTimeout(polishNoticeTimeoutRef.current);
      }
      polishNoticeTimeoutRef.current = window.setTimeout(() => {
        setPolishCleanNotice(false);
        polishNoticeTimeoutRef.current = null;
      }, 2400);
      return;
    }
    setPolishScan(scan);
    setPolishSelected(new Set(scan.changes.map((change) => change.key)));
    setShowPolishModal(true);
  }, [runPolishCheck]);

  const handleApplyPolish = useCallback(() => {
    if (!polishScan) return;
    const apply = new Map<string, PolishChange>();
    for (const change of polishScan.changes) {
      if (polishSelected.has(change.key)) apply.set(change.key, change);
    }
    if (apply.size === 0) {
      setShowPolishModal(false);
      return;
    }
    setRows((prev) =>
      prev.map((row) => {
        const known = apply.get(`${row.id}:known`);
        const target = apply.get(`${row.id}:target`);
        if (!known && !target) return row;
        return {
          ...row,
          textKnown: known ? known.after : row.textKnown,
          textTarget: target ? target.after : row.textTarget,
          // Mark as a manual edit so the fixes persist on confirm.
          status: 'manual' as const,
          warning: undefined,
        };
      }),
    );
    setShowPolishModal(false);
    setPolishScan(null);
  }, [polishScan, polishSelected]);

  const togglePolishChange = useCallback((key: string) => {
    setPolishSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const describePolishFix = useCallback(
    (code: PolishFixCode) => {
      switch (code) {
        case 'trim':
          return t('lists.polishFixTrim');
        case 'collapse_spaces':
          return t('lists.polishFixCollapse');
        case 'space_before_punctuation':
          return t('lists.polishFixSpaceBeforePunct');
        case 'capitalize_sentence':
          return t('lists.polishFixCapitalize');
        case 'add_final_period':
          return t('lists.polishFixPeriod');
      }
    },
    [t],
  );

  const describePolishWarning = useCallback(
    (code: PolishWarningCode) => {
      switch (code) {
        case 'maybe_question':
          return t('lists.polishWarningQuestion');
        case 'maybe_exclamation':
          return t('lists.polishWarningExclamation');
      }
    },
    [t],
  );

  const polishFieldLabel = useCallback(
    (field: PolishField) =>
      formatLanguageLabel(field === 'known' ? list.languageFrom : list.languageTo),
    [formatLanguageLabel, list.languageFrom, list.languageTo],
  );

  const polishSelectedCount = polishScan
    ? polishScan.changes.filter((change) => polishSelected.has(change.key)).length
    : 0;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text">{resolvedHeading}</h2>
          <p className="text-sm text-text-soft mt-0.5">
            {t('lists.translatedProgress', { ready: readyCount, total: rows.length })}
            {dedupCount > 0 && (
              <span className="text-done ml-1">({t('lists.reusedCount', { count: dedupCount })})</span>
            )}
          </p>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-border-subtle text-text-soft text-sm hover:text-text transition-colors"
          onClick={onSkip}
        >
          {t('lists.skip')}
        </button>
      </div>

      {/* Provider selector + auto-translate */}
      <div className="mb-4 p-3 rounded-lg bg-background-elevated border border-border-subtle">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={provider}
            aria-label={t('lists.translationProviderAria')}
            onChange={(e) => {
              const next = e.target.value as TranslationProvider;
              setProvider(next);
              if (next === 'openrouter') {
                void loadOpenRouterStatus();
              }
            }}
            className="px-2 py-1.5 rounded-lg bg-background border border-border-subtle text-text text-xs"
          >
            <option value="google">{t('lists.translationProviderGoogle')}</option>
            <option value="openrouter">{t('lists.translationProviderOpenRouter')}</option>
          </select>
          <button
            type="button"
            disabled={
              translating ||
              pendingCount === 0 ||
              (provider === 'openrouter' && openRouterState !== 'connected') ||
              (provider === 'google' && isGooglePaused)
            }
            className="px-4 py-1.5 rounded-lg bg-accent text-background text-xs font-medium disabled:opacity-50 hover:bg-accent-strong transition-colors"
            onClick={handleAutoTranslate}
          >
            {translating ? t('lists.generating') : t('lists.autoTranslateAction', { count: pendingCount })}
          </button>
        </div>
        {provider === 'google' && googleTranslateUsage && (
          <GoogleUsageHint scope={googleTranslateUsage} />
        )}
        {provider === 'google' && openRouterState !== 'connected' && (
          <p className="mt-2 text-[11px] leading-relaxed text-text-soft">
            {t('lists.openRouterByokQualityNote')}{' '}
            <a
              className="text-accent hover:text-accent-strong"
              href={OPENROUTER_MODELS_URL}
              target="_blank"
              rel="noreferrer"
            >
              OpenRouter
            </a>
          </p>
        )}
      </div>

      {clearColumn && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setClearColumn(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border-subtle bg-background p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-text">
              {t('lists.clearColumnTitle', { language: clearColumnLanguageLabel })}
            </h2>
            <p className="mt-2 text-sm text-text-soft">
              {t('lists.clearColumnMessage', {
                language: clearColumnLanguageLabel,
                count: clearColumnRowCount,
              })}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-soft hover:bg-background-elevated transition-colors"
                onClick={() => setClearColumn(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 transition-colors disabled:opacity-60"
                onClick={() => handleClearColumn(clearColumn)}
                disabled={confirming}
              >
                {confirming ? t('common.saving') : t('lists.clearColumnConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDuplicatesModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowDuplicatesModal(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border-subtle bg-background p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-text">{t('lists.duplicatesModalTitle')}</h2>
            <p className="mt-1 text-sm text-text-soft">{t('lists.duplicatesModalHint')}</p>
            <div className="mt-4 flex-1 divide-y divide-border-subtle overflow-y-auto">
              {duplicateGroups.map((group) => {
                const keepId = keepByGroup[group.key] ?? group.rows[0].id;
                return (
                  <div key={group.key} className="py-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-text-soft">
                      {group.word}
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {group.rows.map((row) => {
                        const keep = row.id === keepId;
                        return (
                          <label
                            key={row.id}
                            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                              keep ? 'bg-background-elevated' : 'opacity-70'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`keep-${group.key}`}
                              checked={keep}
                              onChange={() =>
                                setKeepByGroup((prev) => ({ ...prev, [group.key]: row.id }))
                              }
                              className="accent-accent"
                            />
                            <span className="min-w-0 flex-1 break-words text-sm">
                              <span className="text-text">{row.textKnown || '—'}</span>
                              <span className="text-text-soft"> → {row.textTarget || '—'}</span>
                            </span>
                            <span className={`shrink-0 text-[11px] ${keep ? 'text-done' : 'text-danger'}`}>
                              {keep ? t('lists.duplicatesKeep') : t('lists.duplicatesRemove')}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-soft transition-colors hover:bg-background-elevated"
                onClick={() => setShowDuplicatesModal(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={duplicatesToRemoveCount === 0}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-60"
                onClick={handleRemoveAllDuplicates}
              >
                {t('lists.duplicatesRemoveCta', { count: duplicatesToRemoveCount })}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPolishModal && polishScan && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowPolishModal(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border-subtle bg-background p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-text">{t('lists.polishTitle')}</h2>
            <p className="mt-1 text-sm text-text-soft">{t('lists.polishHint')}</p>

            <div className="mt-4 flex-1 overflow-y-auto">
              {polishScan.changes.length > 0 && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-text-soft">
                    {t('lists.polishSuggestedFixes', { count: polishScan.changes.length })}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {polishScan.changes.map((change) => (
                      <label
                        key={change.key}
                        className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-background-elevated"
                      >
                        <input
                          type="checkbox"
                          checked={polishSelected.has(change.key)}
                          onChange={() => togglePolishChange(change.key)}
                          className="mt-1 accent-accent"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-[11px] uppercase tracking-wide text-text-soft/70">
                            {polishFieldLabel(change.field)}
                          </span>
                          <span className="mt-0.5 block break-words text-sm">
                            <span className="text-text-soft line-through">{change.before}</span>
                            <span className="text-text-soft"> → </span>
                            <span className="text-text">{change.after}</span>
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            {change.fixCodes.map((code) => (
                              <span
                                key={code}
                                className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"
                              >
                                {describePolishFix(code)}
                              </span>
                            ))}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {polishScan.warnings.length > 0 && (
                <div className={polishScan.changes.length > 0 ? 'mt-4' : ''}>
                  <div className="text-xs font-medium uppercase tracking-wide text-text-soft">
                    {t('lists.polishWarnings', { count: polishScan.warnings.length })}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {polishScan.warnings.map((warning) => (
                      <div
                        key={warning.key}
                        className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600"
                      >
                        <span className="text-[11px] uppercase tracking-wide opacity-80">
                          {polishFieldLabel(warning.field)}
                        </span>
                        <span className="ml-1.5 break-words text-text-soft">“{warning.text}”</span>
                        <div className="mt-0.5">{describePolishWarning(warning.code)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-soft transition-colors hover:bg-background-elevated"
                onClick={() => setShowPolishModal(false)}
              >
                {polishScan.changes.length > 0 ? t('common.cancel') : t('common.close')}
              </button>
              {polishScan.changes.length > 0 && (
                <button
                  type="button"
                  disabled={polishSelectedCount === 0}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-strong disabled:opacity-50"
                  onClick={handleApplyPolish}
                >
                  {t('lists.polishApply', { count: polishSelectedCount })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {provider === 'google' && isGooglePaused && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
          {googlePausedMessage}
        </div>
      )}

      {provider === 'openrouter' && openRouterState !== 'connected' && (
        <div className="mb-4 p-3 rounded-lg border border-border-subtle bg-background-elevated flex items-center justify-between gap-3">
          <div className="text-xs text-text-soft">
            {openRouterState === 'connecting'
              ? t('lists.openRouterConnecting')
              : openRouterState === 'failed_retryable'
              ? t('lists.openRouterFailedRetryable')
              : t('lists.openRouterNotConnected')}
          </div>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg bg-accent text-background text-xs font-medium disabled:opacity-60"
            onClick={handleConnectOpenRouter}
            disabled={openRouterLoading || openRouterState === 'connecting'}
          >
            {openRouterState === 'failed_retryable'
              ? t('lists.retry')
              : openRouterState === 'connecting'
              ? t('lists.connecting')
              : t('lists.connectOpenRouter')}
          </button>
        </div>
      )}

      {provider === 'openrouter' && openRouterState === 'connected' && (
        <div className="mb-4 p-3 rounded-lg border border-border-subtle bg-background-elevated">
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="text-xs font-medium text-text" htmlFor="translation-openrouter-model">
              {t('lists.openRouterModel')}
            </label>
            <a
              className="text-[11px] text-accent hover:text-accent-strong"
              href={OPENROUTER_MODELS_URL}
              target="_blank"
              rel="noreferrer"
            >
              {t('lists.browseModels')}
            </a>
          </div>
          <div className="flex flex-col md:flex-row gap-2">
            <select
              id="translation-openrouter-model"
              value={
                OPENROUTER_TRANSLATION_MODELS.some((model) => model.id === openRouterModel)
                  ? openRouterModel
                  : 'custom'
              }
              onChange={(e) => {
                const next = e.target.value;
                if (next !== 'custom') handleOpenRouterModelChange(next);
              }}
              className="min-w-0 flex-1 px-2 py-1.5 rounded-lg bg-background border border-border-subtle text-text text-xs"
            >
              {OPENROUTER_TRANSLATION_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} - {model.price}
                </option>
              ))}
              <option value="custom">{t('lists.customModelName')}</option>
            </select>
            <input
              type="text"
              value={openRouterModel}
              onChange={(e) => handleOpenRouterModelChange(e.target.value)}
              placeholder="provider/model-name"
              className="min-w-0 flex-1 px-2 py-1.5 rounded-lg bg-background border border-border-subtle text-text text-xs focus:outline-none focus:border-accent"
              spellCheck={false}
            />
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg border border-border-subtle text-text text-xs hover:bg-background disabled:opacity-60"
              onClick={handleOpenRouterModelSave}
              disabled={openRouterLoading}
            >
              {openRouterLoading ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 text-danger text-sm">{error}</div>
      )}

      {duplicateGroups.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600">
          <span>{t('lists.duplicateWordsWarning', { count: duplicateGroups.length })}</span>
          {onRemoveItem && (
            <button
              type="button"
              className="shrink-0 rounded-md border border-amber-500/40 px-2.5 py-1 font-medium text-amber-600 transition-colors hover:bg-amber-500/15"
              onClick={openDuplicatesModal}
            >
              {t('lists.duplicatesReview')}
            </button>
          )}
        </div>
      )}

      {uncategorizedCount > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600">
          {t('lists.noCategoryWarning', { count: uncategorizedCount })}
        </div>
      )}

      {/* Which column to generate (step-1 style segmented control) */}
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-background-elevated border border-border-subtle p-3">
        <span className="text-sm text-text-soft">{t('lists.generateTranslationFor')}</span>
        <div className="flex rounded-lg border border-border-subtle overflow-hidden">
          <button
            type="button"
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              inputLanguage === 'target'
                ? 'bg-accent text-background'
                : 'text-text-soft hover:text-text'
            }`}
            onClick={() => onInputLanguageChange?.('target')}
            disabled={!onInputLanguageChange}
          >
            {formatLanguageLabel(list.languageFrom)}
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              inputLanguage === 'known'
                ? 'bg-accent text-background'
                : 'text-text-soft hover:text-text'
            }`}
            onClick={() => onInputLanguageChange?.('known')}
            disabled={!onInputLanguageChange}
          >
            {formatLanguageLabel(list.languageTo)}
          </button>
        </div>
      </div>
      <p className="mb-2 text-xs text-text-soft">
        {t('lists.generateTranslationNote', {
          to: formatLanguageLabel(targetLanguageCode),
          from: formatLanguageLabel(sourceLanguageCode),
        })}
      </p>

      {/* Study notes: auto-generate short notes for translated pairs */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background-elevated border border-border-subtle p-3">
        <span className="flex items-center gap-1.5 text-sm text-text-soft">
          <span aria-hidden>💬</span>
          {t('lists.studyNotesGenerateHint')}
        </span>
        <button
          type="button"
          disabled={generatingComments || confirming || translating || readyCount === 0}
          className="px-4 py-1.5 rounded-lg bg-accent text-background text-xs font-medium disabled:opacity-50 hover:bg-accent-strong transition-colors"
          onClick={handleGenerateComments}
        >
          {generatingComments ? t('lists.generatingStudyNotes') : t('lists.generateStudyNotes')}
        </button>
      </div>

      {/* Formatting polish: deterministic capitalization / spacing / sentence
          punctuation cleanup. Never rewords a translation. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background-elevated border border-border-subtle p-3">
        <span className="flex items-center gap-1.5 text-sm text-text-soft">
          <span aria-hidden>✨</span>
          {t('lists.polishBarHint')}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs text-done transition-opacity ${
              polishCleanNotice ? 'opacity-100' : 'opacity-0'
            }`}
            role="status"
            aria-live="polite"
            aria-hidden={!polishCleanNotice}
          >
            {polishCleanNotice ? t('lists.polishNoIssues') : ' '}
          </span>
          <button
            type="button"
            disabled={confirming || translating || rows.length === 0}
            className="px-4 py-1.5 rounded-lg border border-border-subtle text-text text-xs font-medium hover:bg-background disabled:opacity-50 transition-colors"
            onClick={handlePolishCheck}
          >
            {t('lists.polishCheck')}
          </button>
        </div>
      </div>

      {/* Two-column table: known language always left, target language always right */}
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <div className="flex min-h-12 flex-wrap items-center justify-end gap-2 border-b border-border-subtle bg-background-elevated/70 px-3 py-2">
          <div className="flex items-center gap-2">
            <span
              className={`min-w-16 text-right text-xs text-done transition-opacity ${
                copiedMode !== null ? 'opacity-100' : 'opacity-0'
              }`}
              role="status"
              aria-live="polite"
              aria-hidden={copiedMode === null}
            >
              {copiedMode !== null ? t('common.copied') : '\u00A0'}
            </span>
            <button
              type="button"
              disabled={!pairedTextsToCopy}
              className="px-3 py-1.5 rounded-lg border border-border-subtle text-text text-xs font-medium hover:bg-background disabled:opacity-50 transition-colors"
              onClick={handleCopyTranslatedTexts}
            >
              {t('lists.copyTranslatedTexts')}
            </button>
            <button
              type="button"
              disabled={!hasAnyComment}
              className="px-3 py-1.5 rounded-lg border border-border-subtle text-text text-xs font-medium hover:bg-background disabled:opacity-50 transition-colors"
              onClick={handleCopyTranslatedTextsWithComments}
            >
              {t('lists.copyTranslatedTextsWithComments')}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-0 bg-background-elevated text-xs font-medium text-text-soft uppercase tracking-wide">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-r border-border-subtle">
            <span>{formatLanguageLabel(list.languageFrom)}</span>
            <button
              type="button"
              disabled={confirming || knownRowsWithTextCount === 0}
              className="rounded p-1 text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
              onClick={() => setClearColumn('known')}
              title={t('lists.clearColumn', { language: formatLanguageLabel(list.languageFrom) })}
              aria-label={t('lists.clearColumn', { language: formatLanguageLabel(list.languageFrom) })}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span>{formatLanguageLabel(list.languageTo)}</span>
            <button
              type="button"
              disabled={confirming || targetRowsWithTextCount === 0}
              className="rounded p-1 text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
              onClick={() => setClearColumn('target')}
              title={t('lists.clearColumn', { language: formatLanguageLabel(list.languageTo) })}
              aria-label={t('lists.clearColumn', { language: formatLanguageLabel(list.languageTo) })}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          </div>
        </div>
        <div className="divide-y divide-border-subtle max-h-[60vh] overflow-y-auto">
          {rows.map((row, index) => (
            <Fragment key={row.id}>
            {index === dividerIndex && (
              <div className="bg-background-elevated/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-soft/70">
                {t('lists.existingCategoryWords')}
              </div>
            )}
            <div
              className={`grid grid-cols-2 items-start gap-0 ${
                row.status === 'error' ? 'bg-danger/5' : ''
              }`}
            >
              <div className="px-3 py-2 flex items-start gap-2 border-r border-border-subtle">
                <TranslationTextarea
                  value={row.textKnown}
                  onChange={(value) => handleCellEdit(row.id, 'textKnown', value)}
                  placeholder={needsTranslation === 'textKnown' ? t('lists.enterTranslation') : undefined}
                  ariaLabel={t('lists.sourceTextAria', { language: formatLanguageLabel(list.languageFrom) })}
                />
                {needsTranslation === 'textKnown' && row.status === 'error' && (
                  <span className="mt-1 text-danger text-xs shrink-0" title={row.error}>!</span>
                )}
                {needsTranslation === 'textKnown' && row.status !== 'error' && row.warning && (
                  <span className="mt-1 text-amber-500 text-xs shrink-0" title={row.warning}>?</span>
                )}
                {needsTranslation === 'textKnown' && row.source === 'dedup' && (
                  <span className="mt-1 text-done text-xs shrink-0" title={t('lists.reusedFromExisting')}>
                    {t('lists.audioStatusReused')}
                  </span>
                )}
              </div>
              <div className="px-3 py-2 flex items-start gap-2">
                <TranslationTextarea
                  value={row.textTarget}
                  onChange={(value) => handleCellEdit(row.id, 'textTarget', value)}
                  placeholder={needsTranslation === 'textTarget' ? t('lists.enterTranslation') : undefined}
                  ariaLabel={t('lists.translationTextAria', { language: formatLanguageLabel(list.languageTo) })}
                />
                {needsTranslation === 'textTarget' && row.status === 'error' && (
                  <span className="mt-1 text-danger text-xs shrink-0" title={row.error}>!</span>
                )}
                {needsTranslation === 'textTarget' && row.status !== 'error' && row.warning && (
                  <span className="mt-1 text-amber-500 text-xs shrink-0" title={row.warning}>?</span>
                )}
                {needsTranslation === 'textTarget' && row.source === 'dedup' && (
                  <span className="mt-1 text-done text-xs shrink-0" title={t('lists.reusedFromExisting')}>
                    {t('lists.audioStatusReused')}
                  </span>
                )}
              </div>
              <div className="col-span-2 flex items-start gap-1.5 border-t border-border-subtle/40 px-3 py-1.5">
                <span
                  aria-hidden
                  className="mt-1 shrink-0 text-xs text-text-soft/60"
                  title={t('lists.studyNoteLabel')}
                >
                  💬
                </span>
                <div className="min-w-0 flex-1">
                  <TranslationTextarea
                    value={row.comment ?? ''}
                    onChange={(value) => handleCommentEdit(row.id, value)}
                    placeholder={t('lists.studyNotePlaceholder')}
                    ariaLabel={t('lists.studyNoteAria')}
                    maxLength={MAX_COMMENT_TEXT_LENGTH}
                    onFocus={() => setFocusedCommentId(row.id)}
                    onBlur={() => setFocusedCommentId((current) => (current === row.id ? null : current))}
                  />
                  {focusedCommentId === row.id && (
                    <div className="mt-0.5 text-right text-[11px] leading-none text-text-soft/60">
                      {t('lists.studyNoteCharacterLimit', {
                        count: (row.comment ?? '').length,
                        limit: MAX_COMMENT_TEXT_LENGTH,
                      })}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                  {duplicateRowIds.has(row.id) && (
                    <span
                      className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-600"
                      title={t('lists.duplicateWordBadgeTitle')}
                    >
                      {t('lists.duplicateWordBadge')}
                    </span>
                  )}
                  {onAssignCategory && !categoryByRow[row.id] && (
                    <span
                      className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-600"
                      title={t('lists.noCategoryWarning', { count: 1 })}
                    >
                      {t('lists.noCategoryBadge')}
                    </span>
                  )}
                  {(onRemoveItem || (onAssignCategory && categories.length > 0)) && (
                    <RowMenu
                      categories={categories}
                      currentCategoryId={categoryByRow[row.id] ?? null}
                      canDelete={Boolean(onRemoveItem)}
                      canAssign={Boolean(onAssignCategory)}
                      busy={assigningRowId === row.id}
                      onDelete={() => handleDeleteRow(row.id)}
                      onAssign={(categoryId) => void handleAssignCategory(row.id, categoryId)}
                    />
                  )}
                </div>
              </div>
              {row.validationWarnings && row.validationWarnings.length > 0 && (
                <div className="col-span-2 flex flex-wrap items-center gap-2 border-t border-border-subtle/40 px-3 py-1.5">
                  {row.validationWarnings.map((w, i) => (
                    <span
                      key={`${w.code}-${i}`}
                      className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-600"
                      title={w.message}
                    >
                      {w.message}
                    </span>
                  ))}
                </div>
              )}
            </div>
            </Fragment>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between gap-2 mt-6 pt-4 border-t border-border-subtle">
        {onBack ? (
          <button
            type="button"
          className="px-4 py-2 rounded-lg border border-border-subtle text-text text-sm hover:bg-background-elevated transition-colors"
          onClick={onBack}
        >
            {`\u2190 ${t('lists.back')}`}
          </button>
        ) : <div />}
        <div className="flex gap-2">
        <button
          type="button"
          className="px-4 py-2 rounded-lg border border-border-subtle text-text text-sm hover:bg-background-elevated transition-colors"
          onClick={onSkip}
        >
          {t('lists.skipTranslations')}
        </button>
        <button
          type="button"
          disabled={confirming}
          className="px-4 py-2 rounded-lg bg-accent text-background text-sm font-medium disabled:opacity-50 hover:bg-accent-strong transition-colors"
          onClick={handleConfirmTranslations}
        >
          {confirming ? t('common.saving') : t('lists.confirmTranslations')}
        </button>
        </div>
      </div>
    </div>
  );
}
