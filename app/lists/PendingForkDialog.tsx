'use client';

import { useI18n } from '@/components/I18nProvider';
import type { ForkProgress } from '@/features/lists/client/actions';
import type { LearningLanguage, PendingFork, TranslationProvider } from '@/features/lists/types';
import {
  DEFAULT_OPENROUTER_TRANSLATION_MODEL,
  OPENROUTER_MODELS_URL,
  OPENROUTER_TRANSLATION_MODELS,
} from '@/lib/openrouter-models';

type PendingForkDialogProps = {
  pendingFork: PendingFork;
  forkingListId: string | null;
  forkProgress: ForkProgress | null;
  languageOptions: LearningLanguage[];
  onChange: (updater: (current: PendingFork) => PendingFork) => void;
  onModelChange: (model: string) => void;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  onError: (message: string) => void;
};

export function PendingForkDialog({
  pendingFork,
  forkingListId,
  forkProgress,
  languageOptions,
  onChange,
  onModelChange,
  onCancel,
  onConfirm,
  onError,
}: PendingForkDialogProps) {
  const { t } = useI18n();
  const isForking = forkingListId === pendingFork.source.id;
  const progressPercent = forkProgress && forkProgress.total > 0
    ? Math.min(100, Math.round((forkProgress.processed / forkProgress.total) * 100))
    : 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onClick={isForking ? undefined : onCancel}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border-subtle bg-background p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3">
          <h2 className="text-base font-semibold text-text">{t('lists.copyList')}</h2>
          <p className="mt-1 text-sm text-text-soft">{pendingFork.source.name}</p>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-text-soft">{t('lists.knownLanguage')}</span>
              <select
                value={pendingFork.languageFrom}
                onChange={(event) => onChange((current) => ({ ...current, languageFrom: event.target.value }))}
                className="rounded-lg border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent"
              >
                {languageOptions.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="hidden pb-2 text-xs text-text-soft sm:block">→</span>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-text-soft">{t('lists.targetLanguage')}</span>
              <select
                value={pendingFork.languageTo}
                onChange={(event) => onChange((current) => ({ ...current, languageTo: event.target.value }))}
                className="rounded-lg border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent"
              >
                {languageOptions.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-text-soft">{t('lists.translation')}</span>
            <select
              value={pendingFork.provider}
              onChange={(event) => onChange((current) => ({
                ...current,
                provider: event.target.value as TranslationProvider,
              }))}
              className="rounded-lg border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent"
            >
              <option value="none">{t('lists.noAutoTranslation')}</option>
              <option value="google">{t('lists.translationProviderGoogle')}</option>
              <option value="openrouter">BYOK LLM (OpenRouter)</option>
            </select>
          </label>
          {pendingFork.provider !== 'none' && (
            <label className="grid gap-1">
              <span className="text-xs font-medium text-text-soft">{t('lists.translateFromOriginalLanguage')}</span>
              <select
                value={pendingFork.sourceLanguage}
                onChange={(event) => onChange((current) => ({ ...current, sourceLanguage: event.target.value }))}
                className="rounded-lg border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent"
              >
                <option value={pendingFork.source.languageFrom}>{pendingFork.source.languageFrom}</option>
                <option value={pendingFork.source.languageTo}>{pendingFork.source.languageTo}</option>
              </select>
            </label>
          )}
          {pendingFork.provider !== 'none' && (
            <label className="flex items-center gap-2 text-sm text-text-soft">
              <input
                type="checkbox"
                checked={pendingFork.translateCategoryNames}
                onChange={(event) =>
                  onChange((current) => ({ ...current, translateCategoryNames: event.target.checked }))
                }
                className="size-4 accent-accent"
              />
              {t('lists.translateCategoryNames')}
            </label>
          )}
          {pendingFork.provider === 'openrouter' && (
            <div className="grid gap-2 rounded-lg border border-border-subtle bg-background-elevated p-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-text-soft" htmlFor="fork-openrouter-model">
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
              <div className="grid gap-2 md:grid-cols-2">
                <select
                  id="fork-openrouter-model"
                  value={
                    OPENROUTER_TRANSLATION_MODELS.some((model) => model.id === pendingFork.translationModel)
                      ? pendingFork.translationModel
                      : 'custom'
                  }
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next !== 'custom') onModelChange(next);
                  }}
                  className="min-w-0 rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
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
                  value={pendingFork.translationModel}
                  onChange={(event) => onModelChange(event.target.value)}
                  placeholder="provider/model-name"
                  className="min-w-0 rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
                  spellCheck={false}
                />
              </div>
            </div>
          )}
          {isForking && (
            <div className="grid gap-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-background-elevated">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-text-soft">
                {forkProgress?.phase === 'saving'
                  ? t('lists.forkProgressSaving')
                  : t('lists.forkProgressTranslating', {
                      current: forkProgress?.processed ?? 0,
                      total: forkProgress?.total ?? 0,
                    })}
              </span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isForking}
              className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-soft disabled:opacity-50"
              onClick={onCancel}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={isForking || pendingFork.languageFrom === pendingFork.languageTo}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
              onClick={() => {
                void onConfirm().catch((err) => {
                  onError(err instanceof Error ? err.message : t('lists.copyFailed'));
                });
              }}
            >
              {isForking ? t('lists.copying') : t('lists.copyList')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
