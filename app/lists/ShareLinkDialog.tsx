'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';
import { HoldButton } from './HoldButton';
import type { WordList } from '@/features/lists/types';

interface ShareLinkDialogProps {
  list: WordList;
  onClose: () => void;
  onListUpdated?: (list: WordList) => void;
}

/**
 * Owner dialog to copy a list's share link and, for a private list, optionally
 * make it publicly discoverable. The token itself is never rendered — only the
 * /join URL that carries it. Resetting the link lives separately (kebab menu →
 * ResetShareLinkDialog) since it's a destructive action.
 */
export function ShareLinkDialog({ list, onClose, onListUpdated }: ShareLinkDialogProps) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPublic, setIsPublic] = useState(list.isPublic);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void deviceJsonFetch(`/api/lists/${list.id}/share`, { method: 'POST' })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = (await res.json()) as { url: string };
        setUrl(data.url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [list.id]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const copyUrl = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — select the text so the owner can copy manually.
      inputRef.current?.select();
    }
  }, [url]);

  const handleMakePublic = useCallback(async () => {
    setBusy(true);
    try {
      const res = await deviceJsonFetch(`/api/lists/${list.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_public: true }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as { list: WordList };
      onListUpdated?.(data.list);
      setIsPublic(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [list.id, onListUpdated]);

  if (typeof document === 'undefined') return null;

  const dialog = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-border-subtle bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 rounded-md p-1 text-text-soft transition-colors hover:text-text"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <h2 className="pr-6 text-base font-semibold text-text">{t('share.manageTitle')}</h2>
        <p className="mt-1 truncate text-sm text-text-soft">{list.name}</p>

        {loading ? (
          <p className="mt-4 text-sm text-text-soft">{t('share.creatingLink')}</p>
        ) : error ? (
          <p className="mt-4 text-sm text-danger">{t('share.error')}</p>
        ) : (
          <>
            <div className="mt-4 flex gap-2">
              <input
                ref={inputRef}
                readOnly
                value={url ?? ''}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-background-elevated px-3 py-2 text-xs text-text"
              />
              <button
                type="button"
                className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent/90"
                onClick={copyUrl}
              >
                {copied ? t('share.copied') : t('share.copyLink')}
              </button>
            </div>

            {!isPublic ? (
              <div className="mt-4 rounded-lg border border-border-subtle bg-background-elevated p-3">
                <p className="flex items-start gap-1.5 text-xs text-text-soft">
                  <span aria-hidden>🔒</span>
                  <span>{t('share.privateCaveat')}</span>
                </p>
                <HoldButton
                  variant="neutral"
                  durationMs={2000}
                  disabled={busy}
                  onConfirm={handleMakePublic}
                  className="mt-3 w-full"
                >
                  {t('share.makePublicCta')}
                </HoldButton>
                <p className="mt-1.5 text-center text-[0.65rem] text-text-soft/70">{t('share.holdHint')}</p>
              </div>
            ) : (
              <p className="mt-4 flex items-start gap-1.5 text-xs text-text-soft">
                <span aria-hidden>🌐</span>
                <span>{t('share.publicNotice')}</span>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
