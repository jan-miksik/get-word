'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
  WordList,
} from '@/features/lists/types';
import { GoogleUsageHint } from './GoogleUsageHint';
import {
  DEFAULT_OPENROUTER_TRANSLATION_MODEL,
  OPENROUTER_MODELS_URL,
  OPENROUTER_TRANSLATION_MODELS,
  normalizeOpenRouterModel,
} from '@/lib/openrouter-models';

type PendingItem = NonNullable<ConfirmResult['pending_items']>[number];

interface TranslationStepProps {
  list: WordList;
  pendingItems: PendingItem[];
  inputLanguage: 'known' | 'target';
  heading?: string;
  googleUsage?: GoogleUsageResponse | null;
  onInputLanguageChange?: (language: 'known' | 'target') => void;
  onComplete: (rows: CompletedTranslationRow[]) => Promise<void>;
  onSkip: () => Promise<void>;
  onUsageRefresh?: () => Promise<void>;
  onBack?: () => void;
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
}

function TranslationTextarea({
  value,
  onChange,
  ariaLabel,
  placeholder,
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
      rows={1}
      className="block min-h-7 w-full cursor-text select-text resize-none overflow-hidden bg-transparent text-sm leading-relaxed text-text focus:outline-none placeholder:text-text-soft/50"
      spellCheck={false}
    />
  );
}

export function TranslationStep({
  list,
  pendingItems,
  inputLanguage,
  heading,
  googleUsage,
  onInputLanguageChange,
  onComplete,
  onSkip,
  onUsageRefresh,
  onBack,
}: TranslationStepProps) {
  const { t } = useI18n();
  const [rows, setRows] = useState<TranslationRow[]>(() =>
    pendingItems.map((item) => ({
      id: item.id,
      textKnown: item.text_known ?? '',
      textTarget: item.text_target ?? '',
      // Items that already have both fields are considered translated
      status: (item.text_known && item.text_target ? 'ok' : 'pending') as TranslationRow['status'],
    }))
  );
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

  const needsTranslation = inputLanguage === 'known' ? 'textTarget' : 'textKnown';
  const hasSource = inputLanguage === 'known' ? 'textKnown' : 'textTarget';

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
      const resultMap = new Map<string, { translated_text: string | null; status: string; source?: string; error?: string }>();
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
        row.id === id ? { ...row, [field]: value, status: 'manual' as const } : row
      )
    );
  }, []);

  const handleConfirmTranslations = useCallback(async () => {
    setConfirming(true);
    setError(null);
    try {
      const translations = rows
        .filter((r) => r[needsTranslation])
        .map((r) => ({
          id: r.id,
          text_target: r.textTarget || undefined,
          text_known: r.textKnown || undefined,
          status: (r.status === 'ok' ? 'translated' : 'manual') as 'translated' | 'manual',
        }));

      const res = await listsApiFetch(`/api/lists/${list.id}/items/translations`, {
        method: 'POST',
        body: JSON.stringify({ translations }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? t('lists.translationSaveFailed'));
      }

      await onComplete(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lists.saveFailedShort'));
    } finally {
      setConfirming(false);
    }
  }, [rows, needsTranslation, list.id, onComplete, t]);

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

      {/* Two-column table: known language always left, target language always right */}
      <div className="rounded-lg border border-border-subtle overflow-hidden">
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
          {rows.map((row) => (
            <div
              key={row.id}
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
                {needsTranslation === 'textTarget' && row.source === 'dedup' && (
                  <span className="mt-1 text-done text-xs shrink-0" title={t('lists.reusedFromExisting')}>
                    {t('lists.audioStatusReused')}
                  </span>
                )}
              </div>
            </div>
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
