'use client';

import { useState, useCallback, useEffect } from 'react';
import { listsApiFetch } from '@/features/lists/api';
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

export function TranslationStep({
  list,
  pendingItems,
  inputLanguage,
  heading = 'Translate Words',
  googleUsage,
  onComplete,
  onSkip,
  onUsageRefresh,
  onBack,
}: TranslationStepProps) {
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
  const [provider, setProvider] = useState<'google' | 'openrouter'>('google');
  const [openRouterState, setOpenRouterState] = useState<OpenRouterUiState>('not_connected');
  const [openRouterLoading, setOpenRouterLoading] = useState(false);
  const [openRouterModel, setOpenRouterModel] = useState(DEFAULT_OPENROUTER_TRANSLATION_MODEL);

  const needsTranslation = inputLanguage === 'known' ? 'textTarget' : 'textKnown';
  const hasSource = inputLanguage === 'known' ? 'textKnown' : 'textTarget';

  const pendingCount = rows.filter((r) => !r[needsTranslation] || r.status === 'pending').length;
  const readyCount = rows.filter((r) => r[needsTranslation] && r.status !== 'pending').length;
  const dedupCount = rows.filter((r) => r.source === 'dedup').length;
  const googleTranslateUsage = googleUsage?.account.find((scope) => scope.scope === 'translate');
  const isGooglePaused = Boolean(googleTranslateUsage?.paused);
  const googlePausedMessage = googleTranslateUsage?.limit_message
    ?? 'This account has reached the free Google API usage limit. Reach out to us for more usage, or use your own API keys.';

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
      setOpenRouterModel(normalizeOpenRouterModel(data.connection?.translationModel));
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
        throw new Error(data.error ?? 'Failed to start OpenRouter connection');
      }
      if (!data.authorizeUrl || typeof data.authorizeUrl !== 'string') {
        throw new Error('OpenRouter authorization URL missing');
      }
      setOpenRouterState('connecting');
      window.location.assign(data.authorizeUrl);
    } catch (err) {
      setOpenRouterState('failed_retryable');
      setError(err instanceof Error ? err.message : 'Failed to start OpenRouter connection');
      setOpenRouterLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOpenRouterStatus();
  }, [loadOpenRouterStatus]);

  const handleAutoTranslate = useCallback(async () => {
    if (provider === 'google' && isGooglePaused) {
      setError(googlePausedMessage);
      return;
    }
    if (provider === 'openrouter' && openRouterState !== 'connected') {
      setError('Connect OpenRouter before using this provider.');
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
        throw new Error(data.error ?? 'Translation failed');
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
        const firstError = data.results[0]?.error ?? 'Translation failed';
        setError(`Auto-translate failed: ${firstError}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
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
  ]);

  const handleOpenRouterModelSave = useCallback(async () => {
    const model = normalizeOpenRouterModel(openRouterModel);
    setOpenRouterModel(model);
    setError(null);
    setOpenRouterLoading(true);
    try {
      const res = await listsApiFetch('/api/providers/openrouter', {
        method: 'PATCH',
        body: JSON.stringify({ translation_model: model }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to save OpenRouter model');
      }
      setOpenRouterModel(normalizeOpenRouterModel(data.connection?.translationModel));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save OpenRouter model');
    } finally {
      setOpenRouterLoading(false);
    }
  }, [openRouterModel]);

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
        throw new Error(data.error ?? 'Failed to save translations');
      }

      await onComplete(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setConfirming(false);
    }
  }, [rows, needsTranslation, list.id, onComplete]);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text">{heading}</h2>
          <p className="text-sm text-text-soft mt-0.5">
            {readyCount} of {rows.length} translated
            {dedupCount > 0 && (
              <span className="text-done ml-1">({dedupCount} reused from existing)</span>
            )}
          </p>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-border-subtle text-text-soft text-sm hover:text-text transition-colors"
          onClick={onSkip}
        >
          Skip for now
        </button>
      </div>

      {/* Provider selector + auto-translate */}
      <div className="mb-4 p-3 rounded-lg bg-background-elevated border border-border-subtle">
        <div className="flex items-center gap-3">
          <select
            value={provider}
            onChange={(e) => {
              const next = e.target.value as 'google' | 'openrouter';
              setProvider(next);
              if (next === 'openrouter') {
                void loadOpenRouterStatus();
              }
            }}
            className="px-2 py-1.5 rounded-lg bg-background border border-border-subtle text-text text-xs"
          >
            <option value="google">Google Translate</option>
            <option value="openrouter">OpenRouter (BYOK)</option>
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
            {translating ? 'Translating...' : `Auto-translate (${pendingCount})`}
          </button>
        </div>
        {provider === 'google' && googleTranslateUsage && (
          <GoogleUsageHint scope={googleTranslateUsage} />
        )}
      </div>

      {provider === 'google' && isGooglePaused && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
          {googlePausedMessage}
        </div>
      )}

      {provider === 'openrouter' && openRouterState !== 'connected' && (
        <div className="mb-4 p-3 rounded-lg border border-border-subtle bg-background-elevated flex items-center justify-between gap-3">
          <div className="text-xs text-text-soft">
            {openRouterState === 'connecting'
              ? 'OpenRouter connection is in progress.'
              : openRouterState === 'failed_retryable'
              ? 'OpenRouter connection failed. Retry to continue.'
              : 'OpenRouter is not connected for this account.'}
          </div>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg bg-accent text-background text-xs font-medium disabled:opacity-60"
            onClick={handleConnectOpenRouter}
            disabled={openRouterLoading || openRouterState === 'connecting'}
          >
            {openRouterState === 'failed_retryable'
              ? 'Retry connect'
              : openRouterState === 'connecting'
              ? 'Connecting...'
              : 'Connect OpenRouter'}
          </button>
        </div>
      )}

      {provider === 'openrouter' && openRouterState === 'connected' && (
        <div className="mb-4 p-3 rounded-lg border border-border-subtle bg-background-elevated">
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="text-xs font-medium text-text" htmlFor="translation-openrouter-model">
              OpenRouter model
            </label>
            <a
              className="text-[11px] text-accent hover:text-accent-strong"
              href={OPENROUTER_MODELS_URL}
              target="_blank"
              rel="noreferrer"
            >
              Browse models
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
                if (next !== 'custom') setOpenRouterModel(next);
              }}
              className="min-w-0 flex-1 px-2 py-1.5 rounded-lg bg-background border border-border-subtle text-text text-xs"
            >
              {OPENROUTER_TRANSLATION_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} - {model.price}
                </option>
              ))}
              <option value="custom">Custom model name</option>
            </select>
            <input
              type="text"
              value={openRouterModel}
              onChange={(e) => setOpenRouterModel(e.target.value)}
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
              {openRouterLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 text-danger text-sm">{error}</div>
      )}

      <div className="mb-4 rounded-lg border border-border-subtle bg-background-elevated p-3 text-xs text-text-soft">
        {inputLanguage === 'target'
          ? `You entered ${list.languageTo.toUpperCase()} text, so new rows will get their ${list.languageFrom.toUpperCase()} side filled here. That can make new Czech-side entries appear when you add target-language lines.`
          : `You entered ${list.languageFrom.toUpperCase()} text, so new rows will get their ${list.languageTo.toUpperCase()} side filled here.`}
      </div>

      {/* Two-column table */}
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <div className="grid grid-cols-2 gap-0 bg-background-elevated text-xs font-medium text-text-soft uppercase tracking-wide">
          <div className="px-3 py-2 border-r border-border-subtle">
            {inputLanguage === 'known' ? 'Known' : 'Target'} (source)
          </div>
          <div className="px-3 py-2">
            {inputLanguage === 'known' ? 'Target' : 'Known'} (translation)
          </div>
        </div>
        <div className="divide-y divide-border-subtle max-h-[60vh] overflow-y-auto">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`grid grid-cols-2 gap-0 ${
                row.status === 'error' ? 'bg-danger/5' : ''
              }`}
            >
              <div className="px-3 py-2 border-r border-border-subtle">
                <input
                  type="text"
                  value={row[hasSource]}
                  onChange={(e) => handleCellEdit(row.id, hasSource, e.target.value)}
                  className="w-full bg-transparent text-text text-sm focus:outline-none"
                />
              </div>
              <div className="px-3 py-2 flex items-center gap-2">
                <input
                  type="text"
                  value={row[needsTranslation]}
                  onChange={(e) => handleCellEdit(row.id, needsTranslation, e.target.value)}
                  placeholder="Enter translation..."
                  className="flex-1 bg-transparent text-text text-sm focus:outline-none placeholder:text-text-soft/50"
                />
                {row.status === 'error' && (
                  <span className="text-danger text-xs shrink-0" title={row.error}>!</span>
                )}
                {row.source === 'dedup' && (
                  <span className="text-done text-xs shrink-0" title="Reused from existing">reused</span>
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
            ← Back
          </button>
        ) : <div />}
        <div className="flex gap-2">
        <button
          type="button"
          className="px-4 py-2 rounded-lg border border-border-subtle text-text text-sm hover:bg-background-elevated transition-colors"
          onClick={onSkip}
        >
          Skip translations
        </button>
        <button
          type="button"
          disabled={confirming}
          className="px-4 py-2 rounded-lg bg-accent text-background text-sm font-medium disabled:opacity-50 hover:bg-accent-strong transition-colors"
          onClick={handleConfirmTranslations}
        >
          {confirming ? 'Saving...' : 'Confirm translations'}
        </button>
        </div>
      </div>
    </div>
  );
}
