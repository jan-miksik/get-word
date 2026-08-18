'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';
import { runSignOutHandler } from '@/features/auth/client/sign-out-runtime';
import { deleteDeviceId } from '@/lib/device-id';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Signed-in email, if any. Determines the confirmation phrase. */
  authEmail?: string;
}

type Preview = {
  keptLists: { name: string; subscriberCount: number }[];
  deletedListCount: number;
  requiresEmailConfirmation: boolean;
};

type Phase = 'confirm' | 'deleting' | 'deleted' | 'completing' | 'error';

/** Remove only Get-Word-owned localStorage keys; leave unrelated keys alone. */
function clearGetWordLocalStorage() {
  try {
    deleteDeviceId();
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('get_word') || key.startsWith('get-word'))) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore storage access errors (private mode, etc.).
  }
}

export function DeleteAccountModal({ isOpen, onClose, authEmail }: DeleteAccountModalProps) {
  if (!isOpen) return null;
  return <DeleteAccountModalContent onClose={onClose} authEmail={authEmail} />;
}

function DeleteAccountModalContent({ onClose, authEmail }: Omit<DeleteAccountModalProps, 'isOpen'>) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [phase, setPhase] = useState<Phase>('confirm');
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isDone = phase === 'deleted' || phase === 'completing';

  const expected = authEmail ?? 'DELETE';

  useEffect(() => {
    let cancelled = false;
    deviceJsonFetch('/api/auth/account/deletion-preview')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Preview | null) => {
        if (!cancelled && data) setPreview(data);
      })
      .catch(() => {
        /* preview is advisory; modal still works without it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && phase === 'confirm') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, phase]);

  // iOS raises the keyboard *over* the page instead of shrinking it, so a
  // dialog centred in the layout viewport keeps its confirmation field — the
  // last thing in a long modal — behind the keys, with no way to see what is
  // being typed. The shell already publishes the visible height as
  // `--app-viewport-height` (see `useVisualViewportHeight`); the dialog is
  // centred inside *that* and its body scrolls, and the field is pulled back
  // into the body whenever the visible area moves while it has focus.
  useEffect(() => {
    const input = inputRef.current;
    const body = bodyRef.current;
    if (!input || !body) return;

    let frame = 0;
    const reveal = () => {
      if (document.activeElement !== input) return;
      if (frame) return;
      // After the shell has resized for the keyboard, not during: the body's
      // own height is what the field has to be centred in.
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const field = input.getBoundingClientRect();
        const view = body.getBoundingClientRect();
        // Only the modal body is scrolled. `scrollIntoView` would also move the
        // window, which does nothing for a fixed dialog and leaves the page
        // behind it shifted.
        body.scrollTop += field.top + field.height / 2 - (view.top + view.height / 2);
      });
    };

    const viewport = window.visualViewport ?? null;
    input.addEventListener('focus', reveal);
    viewport?.addEventListener('resize', reveal);
    viewport?.addEventListener('scroll', reveal);
    // The shell resize is what the platforms that do report a keyboard give us;
    // the observer catches it after layout rather than racing it.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal);
    observer?.observe(body);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      input.removeEventListener('focus', reveal);
      viewport?.removeEventListener('resize', reveal);
      viewport?.removeEventListener('scroll', reveal);
      observer?.disconnect();
    };
  }, [isDone]);

  if (typeof document === 'undefined') return null;

  async function handleDelete() {
    setPhase('deleting');
    try {
      const res = await deviceJsonFetch('/api/auth/account', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation }),
      });
      if (!res.ok) {
        setPhase('error');
        return;
      }
      const data = (await res.json()) as { status: 'deleted' | 'completing' };
      clearGetWordLocalStorage();
      setPhase(data.status === 'completing' ? 'completing' : 'deleted');
      // Give the user a moment to read the confirmation, then drop into a fully
      // signed-out state. On the web that is a hard reload once the session
      // cookie is expired; the native shell owns its Keychain session, so it
      // has to be the one to end it — reloading there would boot straight back
      // into a token whose account no longer exists.
      setTimeout(() => {
        void runSignOutHandler().then((handled) => {
          if (!handled) window.location.href = '/';
        });
      }, 2500);
    } catch {
      setPhase('error');
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[80] bg-black/60"
      onClick={() => phase === 'confirm' && onClose()}
    >
      <div
        data-testid="delete-account-frame"
        className="flex items-center justify-center p-4"
        style={{ height: 'var(--app-viewport-height, 100dvh)' }}
      >
      <div
        className="panel-token-scope flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border-subtle bg-background-elevated text-text shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isDone ? (
          <div className="flex items-start gap-3 p-6">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-done/15 text-done">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4">
                <path d="M4 10.5l3.5 3.5L16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="m-0 text-sm leading-relaxed text-text">
              {phase === 'deleted' ? t('account.deletedTitle') : t('account.completingTitle')}
            </p>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-3 border-b border-danger/20 bg-danger/[0.06] px-6 py-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4">
                  <path d="M10 7v4m0 3h.01M8.6 3.2L1.7 15a1.6 1.6 0 001.4 2.4h13.8a1.6 1.6 0 001.4-2.4L11.4 3.2a1.6 1.6 0 00-2.8 0z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h2 className="m-0 min-w-0 break-words text-base font-semibold text-text">
                {authEmail
                  ? t('account.deleteTitleNamed', { name: authEmail })
                  : t('account.deleteTitle')}
              </h2>
            </div>

            <div
              ref={bodyRef}
              data-testid="delete-account-body"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6"
            >
            <p className="mt-0 text-sm text-text-soft">{t('account.deleteIntro')}</p>

            <div className="mt-4 rounded-xl border border-danger/20 bg-danger/[0.04] p-3">
              <p className="m-0 text-[0.7rem] font-semibold uppercase tracking-wider text-danger/80">
                {t('account.deletePermanentHeading')}
              </p>
              <p className="mt-1 mb-0 text-sm text-text-soft">{t('account.deletePermanentItems')}</p>
            </div>

            {preview && preview.keptLists.length > 0 ? (
              <div className="mt-4">
                <p className="m-0 text-[0.7rem] font-semibold uppercase tracking-wider text-text-soft/70">
                  {t('account.deleteKeptHeading')}
                </p>
                <p className="mt-1 text-sm text-text-soft">{t('account.deleteKeptIntro')}</p>
                <ul className="mt-2 flex flex-col gap-1 pl-4 list-disc">
                  {preview.keptLists.map((list) => (
                    <li key={list.name} className="text-sm text-text-soft">
                      {t('account.deleteKeptItem', {
                        name: list.name,
                        count: String(list.subscriberCount),
                      })}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-text-soft/80">
                  {t('account.deleteRenameWarning')}
                </p>
              </div>
            ) : preview ? (
              <p className="mt-3 text-sm text-text-soft">{t('account.deleteNoKept')}</p>
            ) : null}

            <label className="mt-5 block text-sm text-text-soft">
              {authEmail
                ? t('account.deleteConfirmEmailLabel')
                : t('account.deleteConfirmWordLabel')}
              <input
                ref={inputRef}
                type="text"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode={authEmail ? 'email' : 'text'}
                className="mt-1 w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text transition-colors focus:border-danger/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                placeholder={authEmail ?? 'DELETE'}
              />
            </label>

            {phase === 'error' && (
              <p className="mt-2 text-sm text-danger">{t('account.deleteError')}</p>
            )}

            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-xs text-text-soft/70 underline hover:text-text"
            >
              {t('account.deletePrivacyLink')}
            </Link>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-soft hover:bg-background-elevated transition-colors"
                onClick={onClose}
                disabled={phase === 'deleting'}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleDelete}
                disabled={confirmation !== expected || phase === 'deleting'}
              >
                {phase === 'deleting' ? t('account.deleting') : t('account.deleteButton')}
              </button>
            </div>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
