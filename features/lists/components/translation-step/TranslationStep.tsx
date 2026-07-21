'use client';

import { Fragment, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { listsApiFetch } from '@/features/lists/api';
import { GoogleUsageHint } from '../GoogleUsageHint';
import {
  DEFAULT_OPENROUTER_TRANSLATION_MODEL,
  OPENROUTER_MODELS_URL,
  OPENROUTER_TRANSLATION_MODELS,
} from '@/lib/openrouter-models';
import { copyTextToClipboard } from '@/lib/clipboard';
import { MAX_COMMENT_TEXT_LENGTH } from '@/lib/word-item-comment';
import { areAnswersEquivalent } from '@/lib/answer-normalization';
import {
  BULK_ACCEPTED_ANSWERS_CONCURRENCY,
  BULK_ACCEPTED_ANSWERS_CHUNK_SIZE,
} from '@/lib/word-item-accepted-answers';
import type { PolishFixCode, PolishWarningCode } from '@/lib/formatting-polish';
import { AcceptedAnswersDialog } from './AcceptedAnswersDialog';
import { ClearTranslationColumnDialog, DuplicateRowsDialog } from './TranslationDialogs';
import { TranslationRow as TranslationRowView } from './TranslationRow';
import { useTranslationWorkflow } from './useTranslationWorkflow';
import {
  createCategoryByRow,
  createTranslationRows,
  findDuplicateGroups,
  scanTranslationPolish,
} from './transformations';
import type {
  AcceptedSide,
  BulkAcceptedEntry,
  BulkAcceptedScan,
  PolishChange,
  PolishField,
  PolishScan,
  TranslationProvider,
  TranslationRow,
  TranslationStepProps,
} from './types';

/**
 * School translations are metered per item against a shared monthly budget, so
 * a retry of the *same* batch must reuse its idempotency key — otherwise the
 * server reserves quota a second time for work the student already paid for.
 * The key is therefore tied to the batch content: identical items keep the key,
 * an edited batch earns a new one.
 *
 * The fields here must mirror what the server hashes into `request_hash`
 * (features/schools/server/translation-requests.ts). Leaving the languages out
 * would let a flipped study direction reuse a key the server considers to be
 * different content, which it rejects as IDEMPOTENCY_KEY_REUSED.
 */
function buildTranslationRequestSignature(
  items: { id: string; text: string; from_lang: string; to_lang: string }[],
) {
  return JSON.stringify(
    items.map((item) => [item.id, item.text, item.from_lang, item.to_lang]),
  );
}

function createTranslationRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
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
  onGenerationActiveChange,
}: TranslationStepProps) {
  const { t } = useI18n();
  const [rows, setRows] = useState<TranslationRow[]>(() => createTranslationRows(pendingItems));
  // Per-row category, tracked locally so the ⋮ menu and the "no category"
  // warning stay in sync after an assignment without a full reload. Seeded from
  // the pending items; `null` means the word currently has no category.
  const [categoryByRow, setCategoryByRow] = useState<Record<string, string | null>>(
    () => createCategoryByRow(pendingItems),
  );
  const [assigningRowId, setAssigningRowId] = useState<string | null>(null);
  const [acceptedAnswersRowId, setAcceptedAnswersRowId] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    provider,
    setProvider,
    openRouterState,
    openRouterLoading,
    openRouterModel,
    openRouterModelLabel,
    schoolEntitlement,
    refreshSchoolEntitlement,
    refreshOpenRouterStatus: loadOpenRouterStatus,
    connectOpenRouter: handleConnectOpenRouter,
    changeOpenRouterModel: handleOpenRouterModelChange,
    saveOpenRouterModel: handleOpenRouterModelSave,
  } = useTranslationWorkflow({ t, onError: setError });
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<string>>(new Set());
  const [clearColumn, setClearColumn] = useState<'known' | 'target' | null>(null);
  const [generatingComments, setGeneratingComments] = useState(false);
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [copiedMode, setCopiedMode] = useState<'plain' | 'comments' | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const schoolRequestRef = useRef<{ signature: string; id: string } | null>(null);
  const [polishScan, setPolishScan] = useState<PolishScan | null>(null);
  const [showPolishModal, setShowPolishModal] = useState(false);
  const [polishSelected, setPolishSelected] = useState<Set<string>>(new Set());
  const [polishCleanNotice, setPolishCleanNotice] = useState(false);
  const polishNoticeTimeoutRef = useRef<number | null>(null);
  const [bulkAcceptedScan, setBulkAcceptedScan] = useState<BulkAcceptedScan | null>(null);
  const [showBulkAcceptedModal, setShowBulkAcceptedModal] = useState(false);
  const [bulkAcceptedSelected, setBulkAcceptedSelected] = useState<Set<string>>(new Set());
  const [bulkAcceptedProgress, setBulkAcceptedProgress] = useState<
    { done: number; total: number } | null
  >(null);
  const [bulkAcceptedApplying, setBulkAcceptedApplying] = useState(false);
  const [bulkAcceptedCopied, setBulkAcceptedCopied] = useState(false);
  const [bulkAcceptedNoneNotice, setBulkAcceptedNoneNotice] = useState(false);
  const bulkAcceptedNoticeTimeoutRef = useRef<number | null>(null);

  const generationActive =
    translating
    || generatingComments
    || bulkAcceptedProgress !== null
    || bulkAcceptedApplying
    || bulkAcceptedScan !== null;

  useEffect(() => {
    onGenerationActiveChange?.(generationActive);
    return () => onGenerationActiveChange?.(false);
  }, [generationActive, onGenerationActiveChange]);

  useEffect(() => {
    if (!generationActive) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [generationActive]);

  const confirmGenerationLeave = useCallback(() => (
    !generationActive || window.confirm(t('lists.generationLeaveWarning'))
  ), [generationActive, t]);

  const handleSkipWithGenerationGuard = useCallback(() => {
    if (confirmGenerationLeave()) void onSkip();
  }, [confirmGenerationLeave, onSkip]);

  const handleBackWithGenerationGuard = useCallback(() => {
    if (confirmGenerationLeave()) onBack?.();
  }, [confirmGenerationLeave, onBack]);

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

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      if (polishNoticeTimeoutRef.current !== null) {
        window.clearTimeout(polishNoticeTimeoutRef.current);
      }
      if (bulkAcceptedNoticeTimeoutRef.current !== null) {
        window.clearTimeout(bulkAcceptedNoticeTimeoutRef.current);
      }
    };
  }, []);

  const handleAutoTranslate = useCallback(async () => {
    if (provider === 'google' && isGooglePaused) {
      setError(googlePausedMessage);
      return;
    }
    if (provider === 'openrouter' && openRouterState !== 'connected') {
      setError(t('lists.openRouterConnectFirst'));
      return;
    }
    if (provider === 'school_openrouter' && !schoolEntitlement) {
      setError(t('lists.schoolAiUnavailable'));
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

      let schoolRequestId: string | null = null;
      if (provider === 'school_openrouter') {
        const signature = buildTranslationRequestSignature(itemsToTranslate);
        if (schoolRequestRef.current?.signature !== signature) {
          schoolRequestRef.current = { signature, id: createTranslationRequestId() };
        }
        schoolRequestId = schoolRequestRef.current.id;
      }

      const res = await listsApiFetch('/api/translate/batch', {
        method: 'POST',
        body: JSON.stringify({
          items: itemsToTranslate,
          provider,
          ...(provider === 'openrouter' ? { translation_model: openRouterModel } : {}),
          ...(schoolRequestId ? { request_id: schoolRequestId } : {}),
          list_id: list.id,
          input_language: inputLanguage,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? t('lists.translationFailed'));
      }

      // The batch was accepted and settled server-side; a later identical batch
      // is new work and must not replay this key.
      schoolRequestRef.current = null;

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
      setDirtyRowIds((prev) => {
        const next = new Set(prev);
        for (const id of resultMap.keys()) next.add(id);
        return next;
      });

      setRows((prev) =>
        prev.map((row) => {
          const result = resultMap.get(row.id);
          if (!result) return row;
          const updated = { ...row };
          if (result.translated_text) {
            if (needsTranslation === 'textTarget') {
              if (!areAnswersEquivalent(updated.textTarget, result.translated_text)) {
                updated.acceptedTarget = [];
              }
              updated.textTarget = result.translated_text;
            } else {
              if (!areAnswersEquivalent(updated.textKnown, result.translated_text)) {
                updated.acceptedKnown = [];
              }
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
      if (provider === 'school_openrouter') {
        void refreshSchoolEntitlement();
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
    schoolEntitlement,
    refreshSchoolEntitlement,
    isGooglePaused,
    googlePausedMessage,
    onUsageRefresh,
    t,
  ]);

  const handleCellEdit = useCallback((id: string, field: 'textKnown' | 'textTarget', value: string) => {
    setDirtyRowIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next: TranslationRow = {
          ...row,
          [field]: value,
          status: 'manual' as const,
          warning: undefined,
        };
        if (field === 'textKnown' && !areAnswersEquivalent(row.textKnown, value)) {
          next.acceptedKnown = [];
        }
        if (field === 'textTarget' && !areAnswersEquivalent(row.textTarget, value)) {
          next.acceptedTarget = [];
        }
        return next;
      })
    );
  }, []);

  const handleAcceptedAnswersChange = useCallback((
    id: string,
    side: AcceptedSide,
    values: string[],
  ) => {
    setDirtyRowIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              [side === 'known' ? 'acceptedKnown' : 'acceptedTarget']: values,
              status: 'manual' as const,
            }
          : row,
      ),
    );
  }, []);

  const handleCommentEdit = useCallback((id: string, value: string) => {
    const nextValue = value.slice(0, MAX_COMMENT_TEXT_LENGTH);
    setDirtyRowIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
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
  const duplicateGroups = useMemo(
    () => findDuplicateGroups(rows, hasSource, needsTranslation),
    [rows, hasSource, needsTranslation],
  );

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
      accepted_known?: string[];
      accepted_target?: string[];
      comment?: string | null;
    };
    const translations = rows
      .map((r) => {
        const entry: TranslationPayload = { id: r.id };
        let touched = false;
        if (r[needsTranslation] || dirtyRowIds.has(r.id)) {
          entry.text_target = r.textTarget || undefined;
          entry.text_known = r.textKnown || undefined;
          entry.status = r.status === 'ok' ? 'translated' : 'manual';
          entry.accepted_known = r.acceptedKnown ?? [];
          entry.accepted_target = r.acceptedTarget ?? [];
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
    setDirtyRowIds((prev) => {
      if (prev.size === 0) return prev;
      const saved = new Set(translations.map((entry) => entry.id));
      const next = new Set(prev);
      for (const id of saved) next.delete(id);
      return next;
    });
    setRows((prev) =>
      prev.map((row) =>
        translations.some((entry) => entry.id === row.id)
          ? { ...row, commentDirty: false }
          : row,
      ),
    );
  }, [rows, needsTranslation, dirtyRowIds, list.id, t]);

  const handleConfirmTranslations = useCallback(async () => {
    if (!confirmGenerationLeave()) return;
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
  }, [confirmGenerationLeave, persistTranslations, rows, onComplete, t]);

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

  // Whole-list AI pass over both sides: save edits, chunk the saved items
  // through the bulk-suggest route, then review everything in a modal before
  // anything is written. A failed chunk never discards earlier results.
  const handleBulkSuggestAcceptedAnswers = useCallback(async () => {
    if (openRouterState !== 'connected') return;
    setBulkAcceptedProgress({ done: 0, total: 0 });
    setError(null);
    try {
      // Generation runs on saved pairs, so flush local edits first.
      await persistTranslations();

      const eligibleIds = rows
        .filter((row) => row.textKnown.trim() && row.textTarget.trim())
        .map((row) => row.id);
      const chunks: string[][] = [];
      for (let i = 0; i < eligibleIds.length; i += BULK_ACCEPTED_ANSWERS_CHUNK_SIZE) {
        chunks.push(eligibleIds.slice(i, i + BULK_ACCEPTED_ANSWERS_CHUNK_SIZE));
      }
      setBulkAcceptedProgress({ done: 0, total: chunks.length });
      setBulkAcceptedCopied(false);

      const entries: BulkAcceptedEntry[] = [];
      let skippedCount = 0;
      let failedCount = 0;
      let failureMessage: string | null = null;
      let completedChunks = 0;
      for (
        let waveStart = 0;
        waveStart < chunks.length;
        waveStart += BULK_ACCEPTED_ANSWERS_CONCURRENCY
      ) {
        const wave = chunks.slice(
          waveStart,
          waveStart + BULK_ACCEPTED_ANSWERS_CONCURRENCY,
        );
        const results = await Promise.all(
          wave.map(async (chunk) => {
            const chunkEntries: BulkAcceptedEntry[] = [];
            try {
              const res = await listsApiFetch(
                `/api/lists/${list.id}/accepted-answers/bulk-suggest`,
                {
                  method: 'POST',
                  body: JSON.stringify({
                    item_ids: chunk,
                    translation_model: openRouterModel,
                  }),
                },
              );
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                throw new Error(data.error ?? t('lists.acceptedAnswersSuggestFailed'));
              }
              const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
              for (const suggestion of suggestions) {
                const rowId = typeof suggestion?.item_id === 'string' ? suggestion.item_id : null;
                if (!rowId) continue;
                for (const side of ['known', 'target'] as const) {
                  const values = Array.isArray(suggestion[side]) ? suggestion[side] : [];
                  for (const value of values) {
                    if (typeof value !== 'string' || !value) continue;
                    chunkEntries.push({ key: `${rowId}:${side}:${value}`, rowId, side, value });
                  }
                }
              }
              return {
                entries: chunkEntries,
                skippedCount: Array.isArray(data.skipped_item_ids)
                  ? data.skipped_item_ids.length
                  : 0,
                failedCount: 0,
                failureMessage: null,
              };
            } catch (err) {
              return {
                entries: chunkEntries,
                skippedCount: 0,
                failedCount: chunk.length,
                failureMessage:
                  err instanceof Error ? err.message : t('lists.acceptedAnswersSuggestFailed'),
              };
            }
          }),
        );
        for (const result of results) {
          entries.push(...result.entries);
          skippedCount += result.skippedCount;
          failedCount += result.failedCount;
          failureMessage ??= result.failureMessage;
        }
        completedChunks += wave.length;
        setBulkAcceptedProgress({ done: completedChunks, total: chunks.length });
      }

      if (entries.length === 0 && skippedCount === 0 && failedCount === 0) {
        setBulkAcceptedNoneNotice(true);
        if (bulkAcceptedNoticeTimeoutRef.current !== null) {
          window.clearTimeout(bulkAcceptedNoticeTimeoutRef.current);
        }
        bulkAcceptedNoticeTimeoutRef.current = window.setTimeout(() => {
          setBulkAcceptedNoneNotice(false);
          bulkAcceptedNoticeTimeoutRef.current = null;
        }, 2400);
        return;
      }
      setBulkAcceptedScan({ entries, skippedCount, failedCount, failureMessage });
      setBulkAcceptedSelected(new Set(entries.map((entry) => entry.key)));
      setShowBulkAcceptedModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lists.acceptedAnswersSuggestFailed'));
    } finally {
      setBulkAcceptedProgress(null);
    }
  }, [openRouterState, persistTranslations, rows, list.id, openRouterModel, t]);

  const toggleBulkAcceptedEntry = useCallback((key: string) => {
    setBulkAcceptedSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const cancelBulkAcceptedReview = useCallback(() => {
    setShowBulkAcceptedModal(false);
    setBulkAcceptedScan(null);
    setBulkAcceptedSelected(new Set());
  }, []);

  // Sends only the picked suggestions; the server merges them into the current
  // stored answers, so edits made elsewhere between preview and apply survive.
  const handleApplyBulkAccepted = useCallback(async () => {
    if (!bulkAcceptedScan) return;
    const byRow = new Map<string, { known: string[]; target: string[] }>();
    for (const entry of bulkAcceptedScan.entries) {
      if (!bulkAcceptedSelected.has(entry.key)) continue;
      const bucket = byRow.get(entry.rowId) ?? { known: [], target: [] };
      bucket[entry.side].push(entry.value);
      byRow.set(entry.rowId, bucket);
    }
    if (byRow.size === 0) {
      setShowBulkAcceptedModal(false);
      setBulkAcceptedScan(null);
      return;
    }
    setBulkAcceptedApplying(true);
    setError(null);
    try {
      const res = await listsApiFetch(`/api/lists/${list.id}/accepted-answers/bulk-apply`, {
        method: 'POST',
        body: JSON.stringify({
          items: Array.from(byRow.entries()).map(([itemId, sides]) => ({
            item_id: itemId,
            known: sides.known,
            target: sides.target,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? t('lists.acceptedAnswersSuggestFailed'));
      }
      // Mirror the merged server state; the values are persisted already, so
      // the rows stay clean (no dirty flag).
      const merged = new Map<string, { known?: string[]; target?: string[] }>();
      for (const item of Array.isArray(data.items) ? data.items : []) {
        if (typeof item?.item_id === 'string') merged.set(item.item_id, item);
      }
      setRows((prev) =>
        prev.map((row) => {
          const update = merged.get(row.id);
          if (!update) return row;
          return {
            ...row,
            acceptedKnown: Array.isArray(update.known) ? update.known : row.acceptedKnown,
            acceptedTarget: Array.isArray(update.target) ? update.target : row.acceptedTarget,
          };
        }),
      );
      setShowBulkAcceptedModal(false);
      setBulkAcceptedScan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lists.acceptedAnswersSuggestFailed'));
    } finally {
      setBulkAcceptedApplying(false);
    }
  }, [bulkAcceptedScan, bulkAcceptedSelected, list.id, t]);

  const handleClearColumn = useCallback(async (column: 'known' | 'target') => {
    const field = column === 'known' ? 'textKnown' : 'textTarget';
    setConfirming(true);
    setError(null);
    try {
      const translations = rows
        .filter((row) => row[field].trim())
        .map((row) =>
          column === 'target'
            ? { id: row.id, text_target: null, accepted_target: [], status: 'manual' as const }
            : { id: row.id, text_known: null, accepted_known: [], status: 'manual' as const },
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
          ...(column === 'target' ? { acceptedTarget: [] } : { acceptedKnown: [] }),
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
  const runPolishCheck = useCallback(
    () => scanTranslationPolish(rows, list.languageFrom, list.languageTo),
    [rows, list.languageFrom, list.languageTo],
  );

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

  const bulkAcceptedSelectedCount = bulkAcceptedScan
    ? bulkAcceptedScan.entries.filter((entry) => bulkAcceptedSelected.has(entry.key)).length
    : 0;
  // Modal groups follow the row order of the table; each group carries the
  // row's texts so a suggestion is reviewable without scrolling back.
  const bulkAcceptedGroups = bulkAcceptedScan
    ? rows
        .map((row) => ({
          row,
          entries: bulkAcceptedScan.entries.filter((entry) => entry.rowId === row.id),
        }))
        .filter((group) => group.entries.length > 0)
    : [];
  const bulkAcceptedSummaryToCopy = bulkAcceptedGroups
    .map((group) => [
      `${group.row.textKnown} → ${group.row.textTarget}`,
      ...group.entries.map(
        (entry) => `${polishFieldLabel(entry.side)}: ${entry.value}`,
      ),
    ].join('\n'))
    .join('\n\n');
  const acceptedAnswersEditRow = acceptedAnswersRowId
    ? rows.find((row) => row.id === acceptedAnswersRowId) ?? null
    : null;

  const handleCopyBulkAcceptedSummary = async () => {
    if (!bulkAcceptedSummaryToCopy) return;
    setError(null);
    try {
      await copyTextToClipboard(bulkAcceptedSummaryToCopy);
      setBulkAcceptedCopied(true);
    } catch {
      setError(t('lists.acceptedAnswersBulkCopyFailed'));
    }
  };

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
          onClick={handleSkipWithGenerationGuard}
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
            {schoolEntitlement && (
              <option value="school_openrouter">{t('lists.translationProviderSchool')}</option>
            )}
          </select>
          <button
            type="button"
            disabled={
              translating ||
              pendingCount === 0 ||
              (provider === 'openrouter' && openRouterState !== 'connected') ||
              (provider === 'school_openrouter' && !schoolEntitlement) ||
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
        {provider === 'school_openrouter' && schoolEntitlement && (
          <p className="mt-2 text-[11px] leading-relaxed text-text-soft">
            {t('lists.schoolAiRemaining', {
              school: schoolEntitlement.schoolName,
              remaining: schoolEntitlement.translationItemsRemaining,
            })}
          </p>
        )}
      </div>

      {acceptedAnswersEditRow && (
        <AcceptedAnswersDialog
          row={acceptedAnswersEditRow}
          languageFromLabel={formatLanguageLabel(list.languageFrom)}
          languageToLabel={formatLanguageLabel(list.languageTo)}
          onChange={(side, values) => handleAcceptedAnswersChange(
            acceptedAnswersEditRow.id,
            side,
            values,
          )}
          onClose={() => setAcceptedAnswersRowId(null)}
        />
      )}

      {clearColumn && (
        <ClearTranslationColumnDialog
          language={clearColumnLanguageLabel}
          count={clearColumnRowCount}
          confirming={confirming}
          onConfirm={() => handleClearColumn(clearColumn)}
          onClose={() => setClearColumn(null)}
        />
      )}

      {showDuplicatesModal && (
        <DuplicateRowsDialog
          groups={duplicateGroups}
          keepByGroup={keepByGroup}
          removeCount={duplicatesToRemoveCount}
          onKeep={(groupKey, rowId) => setKeepByGroup((previous) => ({
            ...previous,
            [groupKey]: rowId,
          }))}
          onConfirm={handleRemoveAllDuplicates}
          onClose={() => setShowDuplicatesModal(false)}
        />
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

      {showBulkAcceptedModal && bulkAcceptedScan && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={cancelBulkAcceptedReview}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border-subtle bg-background p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-text">
              {t('lists.acceptedAnswersBulkTitle')}
            </h2>
            <p className="mt-1 text-sm text-text-soft">{t('lists.acceptedAnswersBulkMessage')}</p>

            {bulkAcceptedScan.failedCount > 0 && (
              <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
                <p>
                  {t('lists.acceptedAnswersBulkFailed', {
                    count: bulkAcceptedScan.failedCount,
                  })}
                </p>
                {bulkAcceptedScan.failureMessage && (
                  <p className="mt-1 break-words opacity-90">{bulkAcceptedScan.failureMessage}</p>
                )}
              </div>
            )}
            {bulkAcceptedScan.skippedCount > 0 && (
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600">
                {t('lists.acceptedAnswersBulkSkipped', {
                  count: bulkAcceptedScan.skippedCount,
                })}
              </div>
            )}

            {bulkAcceptedScan.entries.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  className="rounded border border-border-subtle px-2 py-1 text-text-soft transition-colors hover:bg-background-elevated"
                  onClick={() => void handleCopyBulkAcceptedSummary()}
                >
                  {bulkAcceptedCopied ? t('common.copied') : t('lists.acceptedAnswersBulkCopy')}
                </button>
                <button
                  type="button"
                  className="rounded border border-border-subtle px-2 py-1 text-text-soft transition-colors hover:bg-background-elevated"
                  onClick={() =>
                    setBulkAcceptedSelected(
                      new Set(bulkAcceptedScan.entries.map((entry) => entry.key)),
                    )
                  }
                >
                  {t('lists.acceptedAnswersBulkSelectAll')}
                </button>
                <button
                  type="button"
                  className="rounded border border-border-subtle px-2 py-1 text-text-soft transition-colors hover:bg-background-elevated"
                  onClick={() => setBulkAcceptedSelected(new Set())}
                >
                  {t('lists.acceptedAnswersBulkSelectNone')}
                </button>
                <span className="text-text-soft">
                  {t('lists.acceptedAnswersBulkSelectedCount', {
                    selected: bulkAcceptedSelectedCount,
                    total: bulkAcceptedScan.entries.length,
                  })}
                </span>
              </div>
            )}

            <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
              {bulkAcceptedGroups.map((group) => (
                <div key={group.row.id} className="rounded-md border border-border-subtle p-2.5">
                  <div className="break-words text-sm font-medium text-text">
                    {group.row.textKnown}
                    <span className="text-text-soft"> → </span>
                    {group.row.textTarget}
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {group.entries.map((entry) => (
                      <label
                        key={entry.key}
                        className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 hover:bg-background-elevated"
                      >
                        <input
                          type="checkbox"
                          checked={bulkAcceptedSelected.has(entry.key)}
                          onChange={() => toggleBulkAcceptedEntry(entry.key)}
                          className="mt-0.5 accent-accent"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-[11px] uppercase tracking-wide text-text-soft/70">
                            {polishFieldLabel(entry.side)}
                          </span>
                          <span className="ml-1.5 break-words text-sm text-text">{entry.value}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-soft transition-colors hover:bg-background-elevated"
                onClick={cancelBulkAcceptedReview}
              >
                {bulkAcceptedScan.entries.length > 0 ? t('common.cancel') : t('common.close')}
              </button>
              {bulkAcceptedScan.entries.length > 0 && (
                <button
                  type="button"
                  disabled={bulkAcceptedSelectedCount === 0 || bulkAcceptedApplying}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-strong disabled:opacity-50"
                  onClick={handleApplyBulkAccepted}
                >
                  {t('lists.acceptedAnswersBulkApply', { count: bulkAcceptedSelectedCount })}
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
                  {model.name}
                  {model.id === DEFAULT_OPENROUTER_TRANSLATION_MODEL
                    ? ` (${t('lists.modelRecommended')})`
                    : ''}
                  {' - '}{model.price}
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

      <details className="group mb-2 overflow-hidden rounded-lg border border-border-subtle bg-background-elevated">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-text marker:content-none">
          <span>{t('lists.moreOptions')}</span>
          <span
            aria-hidden
            className="text-text-soft transition-transform group-open:rotate-180"
          >
           ⌄
          </span>
        </summary>
        <div className="max-h-72 space-y-2 overflow-y-auto border-t border-border-subtle p-2">
          {/* Study notes: auto-generate short notes for translated pairs */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-background p-3">
            <span className="flex items-center gap-1.5 text-sm text-text-soft">
              <span aria-hidden>💬</span>
              {t('lists.studyNotesGenerateHint')}
            </span>
            <button
              type="button"
              disabled={generatingComments || confirming || translating || readyCount === 0}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-background transition-colors hover:bg-accent-strong disabled:opacity-50"
              onClick={handleGenerateComments}
            >
              {generatingComments ? t('lists.generatingStudyNotes') : t('lists.generateStudyNotes')}
            </button>
          </div>

          {/* Formatting polish: deterministic capitalization / spacing / sentence
              punctuation cleanup. Never rewords a translation. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-background p-3">
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
                className="rounded-lg border border-border-subtle px-4 py-1.5 text-xs font-medium text-text transition-colors hover:bg-background-elevated disabled:opacity-50"
                onClick={handlePolishCheck}
              >
                {t('lists.polishCheck')}
              </button>
            </div>
          </div>

          {/* AI suggestions for the whole list, reviewed before anything is saved. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-background p-3">
            <span className="flex min-w-0 items-start gap-1.5 text-sm text-text-soft">
              <span aria-hidden>✅</span>
              <span>
                <span className="block">{t('lists.acceptedAnswersBulkHint')}</span>
                <span className="mt-0.5 block text-[11px] text-text-soft/65">
                  {t('lists.acceptedAnswersBulkModel', { model: openRouterModelLabel })}
                </span>
              </span>
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs text-done transition-opacity ${
                  bulkAcceptedNoneNotice ? 'opacity-100' : 'opacity-0'
                }`}
                role="status"
                aria-live="polite"
                aria-hidden={!bulkAcceptedNoneNotice}
              >
                {bulkAcceptedNoneNotice ? t('lists.acceptedAnswersBulkNone') : ' '}
              </span>
              <button
                type="button"
                disabled={
                  bulkAcceptedProgress !== null ||
                  generatingComments ||
                  confirming ||
                  translating ||
                  openRouterState !== 'connected' ||
                  readyCount === 0
                }
                title={
                  openRouterState !== 'connected' ? t('lists.openRouterNotConnected') : undefined
                }
                className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-background transition-colors hover:bg-accent-strong disabled:opacity-50"
                onClick={handleBulkSuggestAcceptedAnswers}
              >
                {bulkAcceptedProgress !== null
                  ? t('lists.acceptedAnswersBulkProgress', {
                      done: bulkAcceptedProgress.done,
                      total: Math.max(bulkAcceptedProgress.total, 1),
                    })
                  : t('lists.acceptedAnswersBulk')}
              </button>
            </div>
          </div>
        </div>
      </details>

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
              <TranslationRowView
                row={row}
                needsTranslation={needsTranslation}
                languageFromLabel={formatLanguageLabel(list.languageFrom)}
                languageToLabel={formatLanguageLabel(list.languageTo)}
                categories={categories}
                currentCategoryId={categoryByRow[row.id] ?? null}
                duplicate={duplicateRowIds.has(row.id)}
                canDelete={Boolean(onRemoveItem)}
                canAssign={Boolean(onAssignCategory)}
                busy={assigningRowId === row.id}
                focusedComment={focusedCommentId === row.id}
                onCellEdit={(field, value) => handleCellEdit(row.id, field, value)}
                onCommentEdit={(value) => handleCommentEdit(row.id, value)}
                onCommentFocus={() => setFocusedCommentId(row.id)}
                onCommentBlur={() => setFocusedCommentId((current) => current === row.id ? null : current)}
                onEditAccepted={() => setAcceptedAnswersRowId(row.id)}
                onDelete={() => handleDeleteRow(row.id)}
                onAssign={(categoryId) => void handleAssignCategory(row.id, categoryId)}
              />
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
          onClick={handleBackWithGenerationGuard}
        >
            {`\u2190 ${t('lists.back')}`}
          </button>
        ) : <div />}
        <div className="flex gap-2">
        <button
          type="button"
          className="px-4 py-2 rounded-lg border border-border-subtle text-text text-sm hover:bg-background-elevated transition-colors"
          onClick={handleSkipWithGenerationGuard}
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
