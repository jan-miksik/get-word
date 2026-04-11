'use client';

import { useState, useEffect, useCallback } from 'react';
import { listsApiFetch } from '@/features/lists/api';

type StoredKey = {
  provider: string;
  lastFour: string;
  createdAt: string;
  status?: 'connected' | 'failed';
  keyLabel?: string | null;
  connectedAt?: string;
  lastValidatedAt?: string | null;
  connectionMethod?: 'oauth' | 'manual';
};

type OpenRouterUiState =
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
  const [openRouterState, setOpenRouterState] = useState<OpenRouterUiState>('not_connected');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const reasonMessages: Record<string, string> = {
    invalid_state: 'OpenRouter callback state was invalid. Please retry.',
    missing_code: 'OpenRouter did not return an authorization code.',
    code_expired: 'OpenRouter authorization code expired. Please retry.',
    invalid_code: 'OpenRouter authorization code was invalid. Please retry.',
    exchange_rejected: 'OpenRouter rejected the authorization request.',
    exchange_failed: 'OpenRouter key exchange failed. Please retry.',
    test_failed: 'OpenRouter key test failed after exchange.',
    unauthorized: 'OpenRouter key test failed with unauthorized response.',
    rate_limited: 'Too many OpenRouter requests. Please wait and retry.',
  };

  const loadOpenRouterStatus = useCallback(async () => {
    try {
      const res = await listsApiFetch('/api/providers/openrouter/status');
      if (!res.ok) return;
      const data = await res.json();
      setOpenRouterState((data.state as OpenRouterUiState) ?? 'not_connected');
    } catch {
      // no-op
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
      setStatusNotice('OpenRouter connected successfully.');
      setOpenRouterState('connected');
    } else if (result === 'failed') {
      setOpenRouterState('failed_retryable');
      setStatusNotice(reason ? (reasonMessages[reason] ?? 'OpenRouter connection failed. Please retry.') : 'OpenRouter connection failed. Please retry.');
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
        body: JSON.stringify({ provider, key: newKey.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save key');
      }
      setNewKey('');
      setAddingProvider(null);
      await loadKeys();
      if (provider === 'openrouter') {
        setOpenRouterState('connected');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key');
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
        throw new Error(data.error ?? 'Failed to start OpenRouter connection');
      }
      if (!data.authorizeUrl || typeof data.authorizeUrl !== 'string') {
        throw new Error('OpenRouter authorization URL missing from server response');
      }

      setOpenRouterState('connecting');
      window.location.assign(data.authorizeUrl);
    } catch (err) {
      setOpenRouterState('failed_retryable');
      setError(err instanceof Error ? err.message : 'Failed to start OpenRouter connection');
      setBusyAction(null);
    }
  }

  async function handleOpenRouterTest() {
    setError(null);
    setBusyAction('openrouter:test');
    try {
      const res = await listsApiFetch('/api/providers/openrouter/test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? 'OpenRouter test failed');
      }
      setStatusNotice('OpenRouter connection is valid.');
      setOpenRouterState('connected');
      await loadKeys();
      await loadOpenRouterStatus();
    } catch (err) {
      setOpenRouterState('failed_retryable');
      setError(err instanceof Error ? err.message : 'OpenRouter test failed');
    } finally {
      setBusyAction(null);
    }
  }

  if (!isOpen) return null;

  const providers = [
    { id: 'openrouter', name: 'OpenRouter', description: 'For AI-powered translations' },
    { id: 'elevenlabs', name: 'ElevenLabs', description: 'For premium TTS audio' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background-elevated rounded-xl border border-border-subtle w-full max-w-md mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-text">API Keys</h3>
          <button
            type="button"
            className="text-text-soft hover:text-text text-lg"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <p className="text-xs text-text-soft mb-4">
          Add your own API keys to unlock additional translation and audio providers. Keys are encrypted and never shown again.
        </p>

        {error && (
          <div className="mb-3 p-2 rounded-lg bg-danger/10 text-danger text-xs">{error}</div>
        )}
        {statusNotice && (
          <div className="mb-3 p-2 rounded-lg bg-done/10 text-done text-xs">{statusNotice}</div>
        )}

        <div className="space-y-3">
          {providers.map((p) => {
            const stored = keys.find((k) => k.provider === p.id);
            const isAdding = addingProvider === p.id;
            const isBusy = busyAction !== null;
            const isOpenRouter = p.id === 'openrouter';

            return (
              <div key={p.id} className="p-3 rounded-lg border border-border-subtle">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-text">{p.name}</div>
                    <div className="text-xs text-text-soft">{p.description}</div>
                  </div>
                  {isOpenRouter && openRouterState !== 'connected' ? (
                    <button
                      type="button"
                      className="text-xs text-accent hover:text-accent-strong disabled:opacity-60"
                      onClick={handleOpenRouterConnect}
                      disabled={isBusy || openRouterState === 'connecting'}
                    >
                      {openRouterState === 'connecting'
                        ? 'Connecting...'
                        : openRouterState === 'failed_retryable'
                        ? 'Retry connect'
                        : 'Connect'}
                    </button>
                  ) : stored ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-soft font-mono">****{stored.lastFour}</span>
                      {isOpenRouter && (
                        <button
                          type="button"
                          className="text-xs text-accent hover:text-accent-strong disabled:opacity-60"
                          onClick={handleOpenRouterTest}
                          disabled={isBusy}
                        >
                          Test
                        </button>
                      )}
                      {isOpenRouter && (
                        <button
                          type="button"
                          className="text-xs text-accent hover:text-accent-strong disabled:opacity-60"
                          onClick={handleOpenRouterConnect}
                          disabled={isBusy}
                        >
                          Reconnect
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-xs text-danger hover:text-danger/80"
                        onClick={() => handleDeleteKey(p.id)}
                        disabled={isBusy}
                      >
                        Remove
                      </button>
                    </div>
                  ) : !isAdding ? (
                    <button
                      type="button"
                      className="text-xs text-accent hover:text-accent-strong"
                      onClick={() => setAddingProvider(p.id)}
                      disabled={isBusy}
                    >
                      Add key
                    </button>
                  ) : null}
                </div>

                {isOpenRouter && (
                  <div className="mt-1 text-[11px] text-text-soft">
                    {openRouterState === 'connected'
                      ? 'Connected'
                      : openRouterState === 'connecting'
                      ? 'Connection in progress'
                      : openRouterState === 'failed_retryable'
                      ? 'Connection failed. Retry recommended.'
                      : 'Not connected'}
                  </div>
                )}

                {isAdding && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="password"
                      placeholder={`Enter ${p.name} API key`}
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg bg-background border border-border-subtle text-text text-xs focus:outline-none focus:border-accent"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveKey(p.id);
                        if (e.key === 'Escape') setAddingProvider(null);
                      }}
                    />
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-accent text-background text-xs font-medium"
                      onClick={() => handleSaveKey(p.id)}
                      disabled={isBusy}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1.5 rounded-lg border border-border-subtle text-text text-xs"
                      onClick={() => { setAddingProvider(null); setNewKey(''); }}
                      disabled={isBusy}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {loading && (
          <p className="text-xs text-text-soft mt-3 text-center">Loading...</p>
        )}
      </div>
    </div>
  );
}
