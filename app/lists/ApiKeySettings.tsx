'use client';

import { useState, useEffect, useCallback } from 'react';
import { getDeviceId } from '@/lib/device-id';

function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': getDeviceId(),
      ...options.headers,
    },
  });
}

type StoredKey = {
  provider: string;
  lastFour: string;
  createdAt: string;
};

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

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys ?? []);
      }
    } catch {
      // Keys endpoint might not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadKeys();
  }, [isOpen, loadKeys]);

  async function handleSaveKey(provider: string) {
    if (!newKey.trim()) return;
    setError(null);
    try {
      const res = await apiFetch('/api/keys', {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key');
    }
  }

  async function handleDeleteKey(provider: string) {
    try {
      await apiFetch(`/api/keys/${provider}`, { method: 'DELETE' });
      await loadKeys();
    } catch {
      // ignore
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

        <div className="space-y-3">
          {providers.map((p) => {
            const stored = keys.find((k) => k.provider === p.id);
            const isAdding = addingProvider === p.id;

            return (
              <div key={p.id} className="p-3 rounded-lg border border-border-subtle">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-text">{p.name}</div>
                    <div className="text-xs text-text-soft">{p.description}</div>
                  </div>
                  {stored ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-soft font-mono">****{stored.lastFour}</span>
                      <button
                        type="button"
                        className="text-xs text-danger hover:text-danger/80"
                        onClick={() => handleDeleteKey(p.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ) : !isAdding ? (
                    <button
                      type="button"
                      className="text-xs text-accent hover:text-accent-strong"
                      onClick={() => setAddingProvider(p.id)}
                    >
                      Add key
                    </button>
                  ) : null}
                </div>

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
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1.5 rounded-lg border border-border-subtle text-text text-xs"
                      onClick={() => { setAddingProvider(null); setNewKey(''); }}
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
