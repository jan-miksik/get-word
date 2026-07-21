'use client';

import { useCallback, useEffect, useState } from 'react';
import { listsApiFetch } from '@/features/lists/api';
import {
  readStoredOpenRouterModel,
  readStoredTranslationProvider,
  writeStoredOpenRouterModel,
  writeStoredTranslationProvider,
} from '@/features/lists/client/storage';
import type { I18nKey } from '@/lib/i18n/messages';
import {
  DEFAULT_OPENROUTER_TRANSLATION_MODEL,
  OPENROUTER_TRANSLATION_MODELS,
  normalizeOpenRouterModel,
} from '@/lib/openrouter-models';
import type {
  OpenRouterUiState,
  SchoolTranslationEntitlement,
  TranslationProvider,
} from './types';

type Translate = (key: I18nKey, values?: Record<string, string | number>) => string;

export function useTranslationWorkflow({
  t,
  onError,
}: {
  t: Translate;
  onError: (message: string | null) => void;
}) {
  const [provider, setProvider] = useState<TranslationProvider>(
    () => readStoredTranslationProvider(),
  );
  const [openRouterState, setOpenRouterState] = useState<OpenRouterUiState>('not_connected');
  const [openRouterLoading, setOpenRouterLoading] = useState(false);
  const [openRouterModel, setOpenRouterModel] = useState(
    () => readStoredOpenRouterModel() ?? DEFAULT_OPENROUTER_TRANSLATION_MODEL,
  );
  const [schoolEntitlement, setSchoolEntitlement] =
    useState<SchoolTranslationEntitlement | null>(null);

  const loadOpenRouterStatus = useCallback(async () => {
    setOpenRouterLoading(true);
    try {
      const response = await listsApiFetch('/api/providers/openrouter/status');
      if (!response.ok) {
        setOpenRouterState('not_connected');
        return;
      }
      const data = await response.json();
      setOpenRouterState((data.state as OpenRouterUiState) ?? 'not_connected');
      setOpenRouterModel(
        readStoredOpenRouterModel()
          ?? normalizeOpenRouterModel(data.connection?.translationModel),
      );
    } catch {
      setOpenRouterState('not_connected');
    } finally {
      setOpenRouterLoading(false);
    }
  }, []);

  const loadSchoolEntitlement = useCallback(async () => {
    try {
      const response = await listsApiFetch('/api/schools/me');
      if (!response.ok) {
        setSchoolEntitlement(null);
        setProvider((current) => current === 'school_openrouter' ? 'google' : current);
        return;
      }
      const data = await response.json();
      const entitlement = data.entitlement;
      if (!entitlement) {
        setSchoolEntitlement(null);
        setProvider((current) => current === 'school_openrouter' ? 'google' : current);
        return;
      }
      setSchoolEntitlement({
        schoolName: String(entitlement.school_name ?? ''),
        role: entitlement.role === 'teacher' ? 'teacher' : 'student',
        translationItemsLimit: Number(entitlement.limits?.translation_items_monthly_limit ?? 0),
        translationItemsRemaining: Number(entitlement.usage?.ai_translation?.remaining ?? 0),
        translationItemMaxChars: Number(entitlement.limits?.translation_item_max_chars ?? 160),
        resetAt: String(entitlement.usage?.ai_translation?.reset_at ?? ''),
      });
    } catch {
      setSchoolEntitlement(null);
      setProvider((current) => current === 'school_openrouter' ? 'google' : current);
    }
  }, []);

  const connectOpenRouter = useCallback(async () => {
    onError(null);
    setOpenRouterLoading(true);
    try {
      const returnTo = typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : '/lists';
      const response = await listsApiFetch('/api/providers/openrouter/connect/start', {
        method: 'POST',
        body: JSON.stringify({ returnTo }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? t('lists.openRouterConnectStartFailed'));
      if (!data.authorizeUrl || typeof data.authorizeUrl !== 'string') {
        throw new Error(t('lists.openRouterMissingAuthorizeUrl'));
      }
      setOpenRouterState('connecting');
      window.location.assign(data.authorizeUrl);
    } catch (error) {
      setOpenRouterState('failed_retryable');
      onError(error instanceof Error ? error.message : t('lists.openRouterConnectStartFailed'));
      setOpenRouterLoading(false);
    }
  }, [onError, t]);

  const changeOpenRouterModel = useCallback((model: string) => {
    setOpenRouterModel(model);
    writeStoredOpenRouterModel(model);
  }, []);

  const saveOpenRouterModel = useCallback(async () => {
    const model = normalizeOpenRouterModel(openRouterModel);
    setOpenRouterModel(model);
    writeStoredOpenRouterModel(model);
    onError(null);
    setOpenRouterLoading(true);
    try {
      const response = await listsApiFetch('/api/providers/openrouter', {
        method: 'PATCH',
        body: JSON.stringify({ translation_model: model }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? t('lists.openRouterModelSaveFailed'));
      const savedModel = normalizeOpenRouterModel(data.connection?.translationModel);
      setOpenRouterModel(savedModel);
      writeStoredOpenRouterModel(savedModel);
    } catch (error) {
      onError(error instanceof Error ? error.message : t('lists.openRouterModelSaveFailed'));
    } finally {
      setOpenRouterLoading(false);
    }
  }, [onError, openRouterModel, t]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadOpenRouterStatus(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadOpenRouterStatus]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadSchoolEntitlement(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSchoolEntitlement]);

  useEffect(() => {
    writeStoredTranslationProvider(provider);
  }, [provider]);

  const openRouterModelLabel =
    OPENROUTER_TRANSLATION_MODELS.find((model) => model.id === openRouterModel)?.name
    ?? openRouterModel;

  return {
    provider,
    setProvider,
    openRouterState,
    openRouterLoading,
    openRouterModel,
    openRouterModelLabel,
    schoolEntitlement,
    refreshSchoolEntitlement: loadSchoolEntitlement,
    refreshOpenRouterStatus: loadOpenRouterStatus,
    connectOpenRouter,
    changeOpenRouterModel,
    saveOpenRouterModel,
  };
}
