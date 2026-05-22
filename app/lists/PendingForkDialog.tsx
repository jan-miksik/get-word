'use client';

import { useI18n } from '@/components/I18nProvider';
import type { LearningLanguage, PendingFork, TranslationProvider } from '@/features/lists/types';
import {
  OPENROUTER_MODELS_URL,
  OPENROUTER_TRANSLATION_MODELS,
} from '@/lib/openrouter-models';

type PendingForkDialogProps = {
  pendingFork: PendingFork;
  forkingListId: string | null;
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
  languageOptions,
  onChange,
  onModelChange,
  onCancel,
  onConfirm,
  onError,
}: PendingForkDialogProps) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
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
                      {model.name} - {model.price}
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
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-soft"
              onClick={onCancel}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={forkingListId === pendingFork.source.id || pendingFork.languageFrom === pendingFork.languageTo}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
              onClick={() => {
                void onConfirm().catch((err) => {
                  onError(err instanceof Error ? err.message : t('lists.copyFailed'));
                });
              }}
            >
              {forkingListId === pendingFork.source.id ? t('lists.copying') : t('lists.copyList')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
