'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';
import { HoldButton } from './HoldButton';
import type { WordList } from '@/features/lists/types';

interface ShareVisibilityDialogProps {
  list: WordList;
  /**
   * True for the owner (and editors of common lists): unlocks the visibility
   * toggle and the link reset. A plain viewer of a public list opens the same
   * dialog in copy-only mode.
   */
  canManage: boolean;
  onClose: () => void;
  onListUpdated?: (list: WordList) => void;
}

/**
 * Unified "share & visibility" dialog. It merges what used to be three separate
 * surfaces — the copy-link dialog, the public/private checkbox, and the
 * reset-link dialog — into one place whose sections switch on the list's
 * visibility:
 *
 * - Copy link: always available. The link is the same `/join/{token}` capability
 *   for both public and private lists; only *who* can open this dialog differs.
 * - Make public / make private: hold-to-confirm, both directions, each with the
 *   consequence spelled out inline (going private keeps existing students).
 * - Reset link: private lists only — it rotates the token and drops everyone who
 *   joined. Meaningless for a public list, so it isn't shown there.
 *
 * The token itself is never rendered — only the /join URL that carries it.
 */
export function ShareVisibilityDialog({
  list,
  canManage,
  onClose,
  onListUpdated,
}: ShareVisibilityDialogProps) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPublic, setIsPublic] = useState(list.isPublic);
  const [resetDone, setResetDone] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, busy]);

  const copyUrl = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — select the text so the user can copy manually.
      inputRef.current?.select();
    }
  }, [url]);

  const setVisibility = useCallback(
    async (nextPublic: boolean) => {
      setBusy(true);
      setError(false);
      try {
        const res = await deviceJsonFetch(`/api/lists/${list.id}`, {
          method: 'PUT',
          body: JSON.stringify({ is_public: nextPublic }),
        });
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = (await res.json()) as { list: WordList };
        onListUpdated?.(data.list);
        // Trust the server's value, not our optimistic one: common/recommended
        // lists are coerced back to public, so nextPublic can be a lie.
        setIsPublic(data.list.isPublic);
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    },
    [list.id, onListUpdated],
  );

  const handleReset = useCallback(async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await deviceJsonFetch(`/api/lists/${list.id}/share/reset`, {
        method: 'POST',
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as { url: string };
      setUrl(data.url);
      setResetDone(true);
      setTimeout(() => setResetDone(false), 4000);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [list.id]);

  // Common/recommended lists are structurally public and can't be made private,
  // so the "make private" action would be a no-op the server rejects — hide it.
  const lockedPublic = Boolean(list.isCommon || list.isRecommended);
  const hasAdvanced = !isPublic || !lockedPublic;

  if (typeof document === 'undefined') return null;

  const dialog = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-border-subtle bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 rounded-md p-1 text-text-soft transition-colors hover:text-text disabled:opacity-50"
          onClick={onClose}
          disabled={busy}
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
        ) : error && !url ? (
          <p className="mt-4 text-sm text-danger">{t('share.error')}</p>
        ) : (
          <>
            {/* Visibility status */}
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-background-elevated px-3 py-2.5">
              <span aria-hidden className="text-base">{isPublic ? '🌐' : '🔒'}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">
                  {isPublic ? t('share.visibilityPublic') : t('share.visibilityPrivate')}
                </p>
                <p className="truncate text-xs text-text-soft">
                  {isPublic ? t('share.visibilityPublicSub') : t('share.visibilityPrivateSub')}
                </p>
              </div>
            </div>

            {/* Copy link */}
            <p className="mt-4 text-xs text-text-soft">{t('share.linkLabel')}</p>
            <div className="mt-1.5 flex gap-2">
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
            {resetDone && (
              <p className="mt-1.5 text-xs text-done">{t('share.newLinkReady')}</p>
            )}
            {error && url && (
              <p className="mt-1.5 text-xs text-danger">{t('share.error')}</p>
            )}

            {/* Management: make-public stays the primary action; the reductive
                actions (make-private, reset) sit under a quiet disclosure so
                they aren't front-and-center. */}
            {canManage && (
              <div className="mt-4 space-y-3 border-t border-border-subtle pt-4">
                {!isPublic && (
                  <div className="rounded-lg border border-border-subtle bg-background-elevated p-3">
                    <p className="flex items-start gap-1.5 text-xs text-text-soft">
                      <span aria-hidden>🔒</span>
                      <span>{t('share.privateCaveat')}</span>
                    </p>
                    <HoldButton
                      variant="neutral"
                      durationMs={2000}
                      disabled={busy}
                      onConfirm={() => setVisibility(true)}
                      className="mt-3 w-full"
                    >
                      {t('share.makePublicCta')}
                    </HoldButton>
                    <p className="mt-1.5 text-center text-[0.65rem] text-text-soft/70">{t('share.holdHint')}</p>
                  </div>
                )}

                {hasAdvanced && (
                <div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-text-soft transition-colors hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                    onClick={() => setShowAdvanced((v) => !v)}
                    aria-expanded={showAdvanced}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                      className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                    >
                      <path d="M7 5l6 5-6 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t('share.moreOptions')}
                  </button>

                  {showAdvanced && (
                    <div className="mt-3">
                      {isPublic ? (
                        <div className="rounded-lg border border-border-subtle bg-background-elevated p-3">
                          <p className="flex items-start gap-1.5 text-xs text-text-soft">
                            <span aria-hidden>⚠️</span>
                            <span>{t('share.makePrivateWarning')}</span>
                          </p>
                          <HoldButton
                            variant="neutral"
                            durationMs={2000}
                            disabled={busy}
                            onConfirm={() => setVisibility(false)}
                            className="mt-3 w-full"
                          >
                            {t('share.makePrivateCta')}
                          </HoldButton>
                          <p className="mt-1.5 text-center text-[0.65rem] text-text-soft/70">{t('share.holdHint')}</p>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-danger/20 bg-danger/[0.04] p-3">
                          <p className="flex items-start gap-1.5 text-xs text-text">
                            <span aria-hidden className="text-danger">⚠️</span>
                            <span>{t('share.resetInlineNote')}</span>
                          </p>
                          <HoldButton
                            variant="danger"
                            durationMs={2500}
                            disabled={busy}
                            onConfirm={handleReset}
                            className="mt-3 w-full"
                          >
                            {busy ? t('share.resetting') : t('share.resetLink')}
                          </HoldButton>
                          <p className="mt-1.5 text-center text-[0.65rem] text-text-soft/70">{t('share.holdHint')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
