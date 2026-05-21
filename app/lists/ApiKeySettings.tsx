'use client';

import { useState, useEffect, useCallback } from 'react';
import { listsApiFetch } from '@/features/lists/api';
import {
  DEFAULT_OPENROUTER_TRANSLATION_MODEL,
  OPENROUTER_MODELS_URL,
  OPENROUTER_TRANSLATION_MODELS,
  normalizeOpenRouterModel,
} from '@/lib/openrouter-models';

type StoredKey = {
  provider: string;
  lastFour: string;
  createdAt: string;
  status?: 'connected' | 'failed';
  keyLabel?: string | null;
  connectedAt?: string;
  lastValidatedAt?: string | null;
  connectionMethod?: 'oauth' | 'manual';
  translationModel?: string | null;
};

type OpenRouterUiState =
  | 'checking'
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'failed_retryable';

interface ApiKeySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeySettings({ isOpen, onClose }: ApiKeySettingsProps) {
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  // Start as 'checking' to avoid flash of "Not connected" before data loads
  const [openRouterState, setOpenRouterState] = useState<OpenRouterUiState>('checking');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [openRouterModel, setOpenRouterModel] = useState(DEFAULT_OPENROUTER_TRANSLATION_MODEL);
  // Custom model: separate from the dropdown selection
  const [customModelInput, setCustomModelInput] = useState('');
  const [customModelSaved, setCustomModelSaved] = useState('');

  const reasonMessages: Record<string, string> = {
    invalid_state: 'Stav návratu z OpenRouteru je neplatný. Zkuste to znovu.',
    missing_code: 'OpenRouter nevrátil autorizační kód.',
    code_expired: 'Autorizační kód OpenRouteru vypršel. Zkuste to znovu.',
    invalid_code: 'Autorizační kód OpenRouteru je neplatný. Zkuste to znovu.',
    exchange_rejected: 'OpenRouter odmítl autorizační požadavek.',
    exchange_failed: 'Výměna klíče OpenRouteru selhala. Zkuste to znovu.',
    oauth_not_configured: 'OAuth výměna OpenRouteru není na serveru nastavená.',
    provider_error: 'OpenRouter vrátil chybu OAuth před dokončením výměny klíče.',
    test_failed: 'Test klíče OpenRouteru po výměně selhal.',
    unauthorized: 'Test klíče OpenRouteru selhal kvůli neoprávněné odpovědi.',
    rate_limited: 'Příliš mnoho požadavků na OpenRouter. Počkejte a zkuste to znovu.',
  };

  function applyModelState(model: string) {
    const normalized = normalizeOpenRouterModel(model);
    const isKnown = OPENROUTER_TRANSLATION_MODELS.some((m) => m.id === normalized);
    setOpenRouterModel(normalized);
    if (!isKnown) {
      setCustomModelInput(normalized);
      setCustomModelSaved(normalized);
    } else {
      setCustomModelInput('');
      setCustomModelSaved('');
    }
  }

  const saveModel = useCallback(async (model: string) => {
    const normalized = normalizeOpenRouterModel(model);
    setError(null);
    setBusyAction('openrouter:model');
    try {
      const res = await listsApiFetch('/api/providers/openrouter', {
        method: 'PATCH',
        body: JSON.stringify({ translation_model: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? 'Model OpenRouteru se nepodařilo uložit');
      }
      applyModelState(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Model OpenRouteru se nepodařilo uložit');
    } finally {
      setBusyAction(null);
    }
  }, []);

  const loadOpenRouterStatus = useCallback(async () => {
    try {
      const res = await listsApiFetch('/api/providers/openrouter/status');
      if (!res.ok) {
        setOpenRouterState('not_connected');
        return;
      }
      const data = await res.json();
      setOpenRouterState((data.state as OpenRouterUiState) ?? 'not_connected');
      if (data.connection?.translationModel) {
        applyModelState(data.connection.translationModel);
      }
    } catch {
      setOpenRouterState('not_connected');
    }
  }, []);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listsApiFetch('/api/keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys ?? []);
        const openrouter = (data.keys ?? []).find((k: StoredKey) => k.provider === 'openrouter');
        if (!openrouter) {
          setOpenRouterState((prev) => (prev === 'connecting' ? prev : 'not_connected'));
        } else if (openrouter.status === 'failed') {
          setOpenRouterState('failed_retryable');
        } else {
          setOpenRouterState((prev) => (prev === 'connecting' ? prev : 'connected'));
        }
        if (openrouter?.translationModel) {
          applyModelState(openrouter.translationModel);
        }
      }
    } catch {
      // Keys endpoint might not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadKeys();
      void loadOpenRouterStatus();
    }
  }, [isOpen, loadKeys, loadOpenRouterStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get('openrouter');
    const reason = params.get('reason');
    if (!result) return;

    if (result === 'connected') {
      setStatusNotice('OpenRouter byl úspěšně připojen.');
      setOpenRouterState('connected');
    } else if (result === 'failed') {
      setOpenRouterState('failed_retryable');
      setStatusNotice(reason ? (reasonMessages[reason] ?? 'Připojení k OpenRouteru selhalo. Zkuste to znovu.') : 'Připojení k OpenRouteru selhalo. Zkuste to znovu.');
    }

    params.delete('openrouter');
    params.delete('reason');
    const clean = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', clean);
  }, []);

  async function handleSaveKey(provider: string) {
    if (!newKey.trim()) return;
    setError(null);
    setBusyAction(`save:${provider}`);
    try {
      const res = await listsApiFetch('/api/keys', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          key: newKey.trim(),
          ...(provider === 'openrouter' ? { translation_model: openRouterModel } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Klíč se nepodařilo uložit');
      }
      setNewKey('');
      setAddingProvider(null);
      await loadKeys();
      if (provider === 'openrouter') {
        setOpenRouterState('connected');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Klíč se nepodařilo uložit');
      if (provider === 'openrouter') {
        setOpenRouterState('failed_retryable');
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteKey(provider: string) {
    setBusyAction(`delete:${provider}`);
    try {
      if (provider === 'openrouter') {
        await listsApiFetch('/api/providers/openrouter', { method: 'DELETE' });
        setOpenRouterState('not_connected');
      } else {
        await listsApiFetch(`/api/keys/${provider}`, { method: 'DELETE' });
      }
      await loadKeys();
    } catch {
      // ignore
    } finally {
      setBusyAction(null);
    }
  }

  async function handleOpenRouterConnect() {
    setError(null);
    setStatusNotice(null);
    setBusyAction('openrouter:connect');
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
        throw new Error(data.error ?? 'Připojení k OpenRouteru se nepodařilo spustit');
      }
      if (!data.authorizeUrl || typeof data.authorizeUrl !== 'string') {
        throw new Error('V odpovědi serveru chybí autorizační URL OpenRouteru');
      }

      setOpenRouterState('connecting');
      window.location.assign(data.authorizeUrl);
    } catch (err) {
      setOpenRouterState('failed_retryable');
      setError(err instanceof Error ? err.message : 'Připojení k OpenRouteru se nepodařilo spustit');
      setBusyAction(null);
    }
  }

  if (!isOpen) return null;

  const providers = [
    { id: 'openrouter', name: 'OpenRouter', description: 'AI překlady' },
    { id: 'elevenlabs', name: 'ElevenLabs', description: 'Prémiový převod textu na řeč' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background-elevated rounded-2xl border border-border-subtle w-full max-w-md shadow-soft max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-1">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-text leading-tight">API klíče</h3>
            <p className="text-sm text-text-soft mt-1.5 leading-relaxed">
              Připojte vlastní klíče a odemkněte další poskytovatele. Klíče jsou šifrované a znovu se nezobrazí.
            </p>
          </div>
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-soft hover:text-text hover:bg-background transition-colors flex-shrink-0 -mt-1 -mr-2"
            onClick={onClose}
            aria-label="Zavřít"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Notifications */}
        {(error || statusNotice) && (
          <div className="px-6 pt-4 space-y-2">
            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-danger/10 text-danger text-sm">
                <span aria-hidden="true" className="mt-0.5">⚠</span>
                <span className="leading-snug">{error}</span>
              </div>
            )}
            {statusNotice && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-done/10 text-done text-sm">
                <span aria-hidden="true" className="mt-0.5">✓</span>
                <span className="leading-snug">{statusNotice}</span>
              </div>
            )}
          </div>
        )}

        {/* Provider cards */}
        <div className="px-6 pb-6 pt-5 space-y-3">
          {providers.map((p) => {
            const stored = keys.find((k) => k.provider === p.id);
            const isAdding = addingProvider === p.id;
            const isBusy = busyAction !== null;
            const isOpenRouter = p.id === 'openrouter';
            const openRouterConnected = isOpenRouter && openRouterState === 'connected';
            const modelIsKnown = OPENROUTER_TRANSLATION_MODELS.some((m) => m.id === openRouterModel);
            const customInputDirty = customModelInput.trim() !== customModelSaved;

            let statusDotClass = 'bg-text-soft/40';
            let statusText = 'Nepřipojeno';
            if (isOpenRouter) {
              if (openRouterState === 'checking') { statusDotClass = 'bg-text-soft/40 animate-pulse'; statusText = 'Kontroluji…'; }
              else if (openRouterState === 'connected') { statusDotClass = 'bg-done'; statusText = 'Připojeno'; }
              else if (openRouterState === 'connecting') { statusDotClass = 'bg-fresh animate-pulse'; statusText = 'Připojuji…'; }
              else if (openRouterState === 'failed_retryable') { statusDotClass = 'bg-danger'; statusText = 'Připojení selhalo'; }
            } else if (stored) {
              statusDotClass = stored.status === 'failed' ? 'bg-danger' : 'bg-done';
              statusText = stored.status === 'failed' ? 'Připojení selhalo' : 'Připojeno';
            }

            return (
              <section
                key={p.id}
                className="rounded-xl border border-border-subtle bg-background/30"
              >
                {/* Provider header */}
                <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
                  <div className="min-w-0">
                    <h4 className="text-base font-semibold text-text">{p.name}</h4>
                    <p className="text-xs text-text-soft mt-0.5">{p.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
                    <span className={`w-2 h-2 rounded-full ${statusDotClass}`} aria-hidden="true" />
                    <span className="text-xs text-text-soft font-medium">{statusText}</span>
                  </div>
                </header>

                {/* Connected: show key + disconnect */}
                {stored && !isAdding && (
                  <div className="px-5 pb-4 space-y-3">
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-background border border-border-subtle">
                      <span className="text-[11px] text-text-soft uppercase tracking-wider font-medium">
                        API key
                      </span>
                      <span className="text-sm font-mono text-text tracking-wide">
                        ••••&nbsp;{stored.lastFour}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg text-danger/80 text-sm hover:bg-danger/10 transition-colors disabled:opacity-60"
                      onClick={() => handleDeleteKey(p.id)}
                      disabled={isBusy}
                    >
                      {busyAction === `delete:${p.id}` ? 'Odpojuji…' : 'Odpojit'}
                    </button>
                  </div>
                )}

                {/* OpenRouter not connected: Connect CTA */}
                {isOpenRouter && !openRouterConnected && !stored && openRouterState !== 'checking' && (
                  <div className="px-5 pb-5">
                    <button
                      type="button"
                      className="w-full px-4 py-2.5 rounded-lg bg-accent text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                      onClick={handleOpenRouterConnect}
                      disabled={isBusy || openRouterState === 'connecting'}
                    >
                      {openRouterState === 'connecting'
                        ? 'Připojuji…'
                        : openRouterState === 'failed_retryable'
                        ? 'Zkusit znovu - připojit OpenRouter'
                        : 'Připojit OpenRouter'}
                    </button>
                    <p className="text-[11px] text-text-soft text-center mt-2">
                      Budete přesměrováni na OpenRouter kvůli autorizaci.
                    </p>
                  </div>
                )}

                {/* Non-OpenRouter: Add key CTA */}
                {!isOpenRouter && !stored && !isAdding && (
                  <div className="px-5 pb-5">
                    <button
                      type="button"
                      className="w-full px-4 py-2.5 rounded-lg border border-border-subtle text-text text-sm font-medium hover:bg-background hover:border-accent transition-colors disabled:opacity-60"
                      onClick={() => setAddingProvider(p.id)}
                      disabled={isBusy}
                    >
                      Přidat API klíč {p.name}
                    </button>
                  </div>
                )}

                {/* Manual key input */}
                {isAdding && (
                  <div className="border-t border-border-subtle px-5 py-4 space-y-3">
                    <div>
                      <label
                        htmlFor={`${p.id}-key-input`}
                        className="text-[11px] text-text-soft uppercase tracking-wider font-medium"
                      >
                        {p.name} API key
                      </label>
                      <input
                        id={`${p.id}-key-input`}
                        type="password"
                        placeholder={p.id === 'elevenlabs' ? 'sk_...' : 'Vložte API klíč'}
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-background border border-border-subtle text-text text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveKey(p.id);
                          if (e.key === 'Escape') { setAddingProvider(null); setNewKey(''); }
                        }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex-1 px-4 py-2 rounded-lg bg-accent text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                        onClick={() => handleSaveKey(p.id)}
                        disabled={isBusy || !newKey.trim()}
                      >
                        {busyAction === `save:${p.id}` ? 'Ukládám…' : 'Uložit klíč'}
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 rounded-lg border border-border-subtle text-text text-sm hover:bg-background transition-colors disabled:opacity-60"
                        onClick={() => { setAddingProvider(null); setNewKey(''); }}
                        disabled={isBusy}
                      >
                        Zrušit
                      </button>
                    </div>
                  </div>
                )}

                {/* OpenRouter model configuration — only when connected */}
                {openRouterConnected && (
                  <div className="border-t border-border-subtle px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="openrouter-model-select"
                        className="text-[11px] text-text-soft uppercase tracking-wider font-medium"
                      >
                        Překladový model
                      </label>
                      <a
                        className="text-xs text-accent hover:text-accent-strong"
                        href={OPENROUTER_MODELS_URL}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Procházet vše ↗
                      </a>
                    </div>

                    {/* Model dropdown — auto-saves on change */}
                    <select
                      id="openrouter-model-select"
                      value={modelIsKnown ? openRouterModel : 'custom'}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === 'custom') return;
                        setOpenRouterModel(next);
                        setCustomModelInput('');
                        setCustomModelSaved('');
                        void saveModel(next);
                      }}
                      disabled={isBusy}
                      className="w-full px-3 py-2.5 rounded-lg bg-background border border-border-subtle text-text text-sm hover:border-accent focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
                    >
                      {OPENROUTER_TRANSLATION_MODELS.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                      <option value="custom">Vlastní model…</option>
                    </select>

                    {/* Custom model input — only show save button when dirty */}
                    <div className="relative">
                      <label htmlFor="openrouter-model-custom" className="text-[11px] text-text-soft">
                        ID vlastního modelu
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="openrouter-model-custom"
                          type="text"
                          value={customModelInput}
                          onChange={(e) => setCustomModelInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && customInputDirty && customModelInput.trim()) {
                              void saveModel(customModelInput.trim());
                            }
                          }}
                          placeholder="provider/model-name"
                          className="w-full px-3 py-2 rounded-lg bg-background border border-border-subtle text-text text-sm font-mono focus:outline-none focus:border-accent transition-colors pr-16"
                          spellCheck={false}
                        />
                        {customInputDirty && customModelInput.trim() && (
                          <button
                            type="button"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-accent text-background text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                            onClick={() => void saveModel(customModelInput.trim())}
                            disabled={isBusy}
                          >
                            {busyAction === 'openrouter:model' ? '…' : 'Uložit'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {loading && (
          <p className="text-sm text-text-soft pb-5 text-center">Načítání…</p>
        )}
      </div>
    </div>
  );
}
