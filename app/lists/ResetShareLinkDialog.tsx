'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';
import { HoldButton } from './HoldButton';
import type { WordList } from '@/features/lists/types';

interface ResetShareLinkDialogProps {
  list: WordList;
  onClose: () => void;
}

/**
 * Reset a list's share link. For private lists, rotating the token also removes
 * everyone who joined via it, so the action is gated behind a press-and-hold.
 * After a successful reset the new link is shown for the owner to re-share.
 */
export function ResetShareLinkDialog({ list, onClose }: ResetShareLinkDialogProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, busy]);

  const handleReset = useCallback(async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await deviceJsonFetch(`/api/lists/${list.id}/share/reset`, { method: 'POST' });
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as { url: string };
      setNewUrl(data.url);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [list.id]);

  const copyUrl = useCallback(async () => {
    if (!newUrl) return;
    try {
      await navigator.clipboard.writeText(newUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      inputRef.current?.select();
    }
  }, [newUrl]);

  if (typeof document === 'undefined') return null;

  const dialog = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border-subtle bg-background-elevated text-text shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {newUrl ? (
          <div className="p-6">
            <h2 className="text-base font-semibold text-text">{t('share.newLinkReady')}</h2>
            <div className="mt-4 flex gap-2">
              <input
                ref={inputRef}
                readOnly
                value={newUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-background px-3 py-2 text-xs text-text"
              />
              <button
                type="button"
                className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent/90"
                onClick={copyUrl}
              >
                {copied ? t('share.copied') : t('share.copyLink')}
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-soft transition-colors hover:bg-background"
                onClick={onClose}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-danger/20 bg-danger/[0.06] px-6 py-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4">
                  <path d="M10 7v4m0 3h.01M8.6 3.2L1.7 15a1.6 1.6 0 001.4 2.4h13.8a1.6 1.6 0 001.4-2.4L11.4 3.2a1.6 1.6 0 00-2.8 0z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h2 className="m-0 min-w-0 break-words text-base font-semibold text-text">
                {t('share.resetLink')}
              </h2>
            </div>

            <div className="p-6">
              <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/[0.04] p-3">
                <span aria-hidden className="mt-0.5 text-danger">⚠️</span>
                <p className="m-0 text-sm leading-relaxed text-text">
                  {t(list.isPublic ? 'share.resetPublicNote' : 'share.resetPrivateWarning')}
                </p>
              </div>

              {error && <p className="mt-3 text-sm text-danger">{t('share.error')}</p>}

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-soft transition-colors hover:bg-background disabled:opacity-50"
                  onClick={onClose}
                  disabled={busy}
                >
                  {t('common.cancel')}
                </button>
                <HoldButton
                  variant="danger"
                  durationMs={2500}
                  disabled={busy}
                  onConfirm={handleReset}
                  className="px-4 py-2 text-sm"
                >
                  {busy ? t('share.resetting') : t('share.resetLink')}
                </HoldButton>
              </div>
              <p className="mt-2 text-right text-[0.65rem] text-text-soft/70">{t('share.holdHint')}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
