'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';
import { useSupportedLanguages } from '@/features/shared/languages/useSupportedLanguages';
import { readPhotoLabPreference } from '@/features/photo-lab/client/preferences';
import { WARM_PALETTE, warmPaletteVars } from '@/features/shared/theme/warm-palette';
import { getLanguageFlag, getLocalizedLanguageName } from '@/lib/i18n/languages';
import { cleanupPhotoLab } from '../client/photoStore';
import { LabeledPhoto } from './LabeledPhoto';
import { LanguagePairModal } from './LanguagePairModal';
import { usePhotoLabStudio } from './usePhotoLabStudio';

// Calibrated to the pro-tier vision model (see PHOTO_LAB_MODEL).
const ANALYSIS_ESTIMATE_SECONDS = 25;

const ERROR_MESSAGE_KEYS = {
  limit: 'photoLab.errorLimit',
  imageProcessing: 'photoLab.errorImageProcessing',
  tooLarge: 'photoLab.errorTooLarge',
  unauthorized: 'photoLab.errorUnauthorized',
  generic: 'photoLab.errorGeneric',
} as const;

/** Full-bleed warm background; the app body is dark navy. */
function PhotoLabShell({ children }: { children: React.ReactNode }) {
  // Paint the body itself warm while mounted — otherwise the navy app body
  // shows through iOS overscroll bounce and below the shell on browsers
  // where 100dvh is unsupported.
  useEffect(() => {
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = WARM_PALETTE.surface;
    return () => {
      document.body.style.backgroundColor = previous;
    };
  }, []);

  return (
    <div
      style={warmPaletteVars}
      className="photo-lab-shell relative bg-[var(--ob-surface)] text-[color:var(--ob-ink)]"
    >
      {/* Soft accent/ink washes give the flat surface a hint of depth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_520px_at_85%_-10%,rgba(30,111,168,0.10),transparent_60%),radial-gradient(900px_460px_at_-15%_35%,rgba(42,34,24,0.06),transparent_55%)]"
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function PhotoLabPage() {
  const settingsLanguage = useSettingsLanguage();

  return (
    <I18nProvider language={settingsLanguage}>
      <PhotoLabShell>
        <PhotoLabContent />
      </PhotoLabShell>
    </I18nProvider>
  );
}

function PhotoLabContent() {
  const { t } = useI18n();
  // null = not yet known (first client render); avoids a hydration mismatch.
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setEnabled(readPhotoLabPreference()), 0);
    void cleanupPhotoLab();
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (enabled === null) return null;
  if (!enabled) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="flex max-w-sm flex-col gap-3 rounded-xl border-2 border-[color:var(--ob-ink)] p-6 text-center">
          <p className="m-0 text-sm">{t('photoLab.enableHint')}</p>
          <Link href="/" className="text-sm text-[color:var(--ob-accent)] underline">
            ← Get Word
          </Link>
        </div>
      </main>
    );
  }
  return <PhotoLabStudio />;
}

function LanguagePairSummary({
  from,
  to,
  onOpen,
}: {
  from: string;
  to: string;
  onOpen: () => void;
}) {
  const { t, language: uiLanguage } = useI18n();

  const describe = (code: string, fallbackLabel: string) => {
    if (!code) return { flag: '🌐', name: fallbackLabel };
    const flag = getLanguageFlag(code);
    const name = getLocalizedLanguageName(code, uiLanguage) ?? code.toUpperCase();
    return { flag, name };
  };
  const source = describe(from, t('photoLab.knownLanguage'));
  const target = describe(to, t('photoLab.targetLanguage'));

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('photoLab.changeLanguages')}
      title={t('photoLab.changeLanguages')}
      className="flex max-w-full items-center gap-1 rounded-full border-2 border-[color:var(--ob-ink)]/60 bg-[#F4EFE2]/70 px-3.5 py-2 text-sm font-semibold text-[color:var(--ob-ink)] transition hover:-translate-y-0.5 hover:border-[color:var(--ob-ink)] hover:bg-[var(--ob-surface-hover)] hover:shadow-md hover:shadow-[#2A2218]/10 sm:gap-2"
    >
      <span aria-hidden="true">{source.flag}</span>
      <span className="hidden truncate sm:inline">{source.name}</span>
      <span aria-hidden="true" className="text-[color:var(--ob-ink-soft)]">
        →
      </span>
      <span aria-hidden="true">{target.flag}</span>
      <span className="hidden truncate sm:inline">{target.name}</span>
      <span aria-hidden="true" className="text-xs text-[color:var(--ob-ink-soft)]">
        ✎
      </span>
    </button>
  );
}

/** Small confirmation dialog shown before a photo (and its session) is deleted. */
function DeletePhotoConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="photo-lab-delete-title"
        style={warmPaletteVars}
        className="w-full max-w-xs rounded-2xl border-2 border-[color:var(--ob-ink)] bg-[var(--ob-surface)] p-5 text-[color:var(--ob-ink)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="photo-lab-delete-title" className="m-0 text-sm font-medium">
          {t('photoLab.deleteConfirm')}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            className="rounded-lg border border-[color:var(--ob-ink)]/25 px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--ob-surface-hover)]"
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--ob-ink)] px-4 py-2 text-sm font-medium text-[var(--ob-surface)] transition-opacity hover:opacity-85"
            onClick={onConfirm}
          >
            {t('photoLab.deletePhoto')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PhotoLabStudio() {
  const { t } = useI18n();
  const { languages } = useSupportedLanguages();
  const {
    langFrom,
    langTo,
    langModalOpen,
    analysisElapsedSeconds,
    analyzing,
    errorCode,
    usage,
    current,
    history,
    confirmDeleteId,
    thumbUrls,
    fileInputRef,
    pendingPhoto,
    languagesReady,
    changeLanguagePair,
    openLanguageModal,
    closeLanguageModal,
    analyze,
    handleFileChange,
    openSession,
    removeSession,
    requestDelete,
    cancelDelete,
  } = usePhotoLabStudio();
  const analysisRemainingSeconds = Math.max(
    1,
    ANALYSIS_ESTIMATE_SECONDS - analysisElapsedSeconds,
  );
  const analysisStatusText =
    analysisElapsedSeconds < ANALYSIS_ESTIMATE_SECONDS
      ? t('photoLab.analyzingWithEta', { seconds: analysisRemainingSeconds })
      : t('photoLab.analyzingTakingLonger');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1800px] flex-col gap-4 px-3 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6 lg:px-8">
      <header className="flex w-full flex-col gap-5 animate-[photo-lab-rise_0.5s_ease-out_both] motion-reduce:animate-none">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="shrink-0 rounded-full border-2 border-[color:var(--ob-ink)]/60 bg-[#F4EFE2]/70 px-3.5 py-2 text-sm font-semibold text-[color:var(--ob-ink)] transition hover:-translate-y-0.5 hover:border-[color:var(--ob-ink)] hover:bg-[var(--ob-surface-hover)] hover:shadow-md hover:shadow-[#2A2218]/10 sm:text-base"
          >
            ← {t('photoLab.back')}
          </Link>
          <LanguagePairSummary from={langFrom} to={langTo} onOpen={openLanguageModal} />
        </div>
        <div className="flex flex-col gap-2.5">
          <h1 className="m-0 text-3xl font-bold tracking-tight [font-family:var(--font-photo-display),system-ui] sm:text-5xl">
            {t('photoLab.title')}
          </h1>
          <div
            aria-hidden="true"
            className="h-2 w-24 -rotate-1 rounded-full bg-[var(--ob-accent)] sm:h-2.5 sm:w-36"
          />
        </div>
      </header>

      <LanguagePairModal
        isOpen={langModalOpen}
        languages={languages}
        loading={languages.length === 0}
        from={langFrom}
        to={langTo}
        onChange={changeLanguagePair}
        onClose={closeLanguageModal}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex flex-wrap items-center gap-2 animate-[photo-lab-rise_0.5s_ease-out_80ms_both] motion-reduce:animate-none sm:gap-3">
        <button
          type="button"
          disabled={!languagesReady || analyzing}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-2xl border-2 border-[color:var(--ob-ink)] bg-[var(--ob-accent)] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#1E6FA8]/25 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#1E6FA8]/30 active:translate-y-0 active:shadow-md disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none sm:text-base"
        >
          📷 {t('photoLab.pickPhoto')}
        </button>
        {usage && (
          <span
            className="rounded-full border border-[color:var(--ob-ink)]/25 bg-white/40 px-3 py-1.5 text-xs font-medium text-[color:var(--ob-ink-soft)] sm:text-sm"
            aria-live="polite"
          >
            {t(
              usage.period === 'week'
                ? 'photoLab.usageRemainingWeek'
                : 'photoLab.usageRemaining',
              {
                remaining: usage.remaining,
                limit: usage.limit,
              },
            )}
          </span>
        )}
      </div>

      {analyzing && (
        <div
          className={
            pendingPhoto
              ? // Mirror the LabeledPhoto viewport (full-bleed square on mobile,
                // rounded and bordered on sm+) so corners don't jump when the
                // analysis finishes.
                'relative -mx-3 overflow-hidden bg-black/5 shadow-lg sm:mx-0 sm:max-w-3xl sm:rounded-2xl sm:border-2 sm:border-[color:var(--ob-ink)] sm:shadow-xl sm:shadow-[#2A2218]/10'
              : 'mx-auto w-full max-w-xl rounded-2xl border-2 border-[color:var(--ob-ink)]/60 bg-white/35 px-4 py-3'
          }
          aria-live="polite"
        >
          {pendingPhoto && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
              <img
                src={pendingPhoto.dataUrl}
                alt=""
                draggable={false}
                // Safari can let a blurred child leak past the parent's rounded
                // overflow clip; round the image itself to the inner radius too.
                className="block w-full select-none opacity-90 blur-[3px] sm:rounded-[14px]"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-black/25" />
              <div
                aria-hidden="true"
                className="absolute inset-x-0 h-20 bg-gradient-to-b from-transparent via-white/45 to-transparent motion-safe:animate-[photo-lab-scan_2.2s_linear_infinite] motion-reduce:hidden"
              />
            </>
          )}
          <div
            className={`flex flex-col gap-2 text-center text-sm sm:text-base ${
              pendingPhoto
                ? 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 pb-4 pt-10 text-white/85'
                : 'text-[color:var(--ob-ink-soft)]'
            }`}
          >
            <p className={`m-0 font-semibold ${pendingPhoto ? 'text-white' : 'text-[color:var(--ob-ink)]'}`}>
              {t('photoLab.analyzing')}
            </p>
            <p className="m-0">{analysisStatusText}</p>
            <div
              className={`h-1.5 overflow-hidden rounded-full ${
                pendingPhoto ? 'bg-white/25' : 'bg-[#2A2218]/10'
              }`}
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-[var(--ob-accent)] transition-[width] duration-500"
                style={{
                  width: `${Math.min(
                    94,
                    Math.max(8, (analysisElapsedSeconds / ANALYSIS_ESTIMATE_SECONDS) * 100),
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {errorCode && !analyzing && (
        <div className="flex w-full max-w-xl flex-col items-center gap-2.5 rounded-2xl border-2 border-[color:var(--ob-ink)] bg-[#B91C1C]/5 p-4">
          <p className="m-0 text-center text-sm font-medium">{t(ERROR_MESSAGE_KEYS[errorCode])}</p>
          {pendingPhoto && errorCode !== 'limit' && errorCode !== 'tooLarge' && (
            <button
              type="button"
              onClick={() => void analyze(pendingPhoto)}
              className="rounded-xl border-2 border-[color:var(--ob-ink)] px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:bg-[var(--ob-surface-hover)] hover:shadow-md hover:shadow-[color:var(--ob-ink)]/10"
            >
              {t('photoLab.retry')}
            </button>
          )}
        </div>
      )}

      {current && !analyzing && (
        <LabeledPhoto
          key={current.session.id}
          imageUrl={current.imageUrl}
          labels={current.session.labels}
          audioHashes={current.session.audioHashes}
        />
      )}

      <section className="mt-4 flex w-full max-w-5xl flex-col gap-4 animate-[photo-lab-rise_0.5s_ease-out_160ms_both] motion-reduce:animate-none">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-base font-semibold text-[color:var(--ob-ink)] [font-family:var(--font-photo-display),system-ui] sm:text-lg">
            {t('photoLab.history')}
          </h2>
          <p className="m-0 text-xs text-[color:var(--ob-ink-soft)]">
            {t('photoLab.historyNote')}
          </p>
        </div>
        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-[color:var(--ob-ink)]/30 px-4 py-8 text-center">
            <span aria-hidden="true" className="text-2xl">
              📷
            </span>
            <p className="m-0 text-xs text-[color:var(--ob-ink-soft)]">
              {t('photoLab.historyEmpty')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {history.map((session) => (
              <div key={session.id} className="group relative">
                <button
                  type="button"
                  onClick={() => void openSession(session)}
                  className="relative block w-full overflow-hidden rounded-xl border-2 border-[color:var(--ob-ink)]/25 transition group-hover:-translate-y-1 group-hover:border-[color:var(--ob-ink)] group-hover:shadow-lg group-hover:shadow-[#2A2218]/15"
                >
                  {thumbUrls.get(session.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                    <img
                      src={thumbUrls.get(session.id)}
                      alt=""
                      className="block aspect-square w-full object-cover"
                    />
                  ) : (
                    <span className="block aspect-square w-full bg-[#2A2218]/10" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/65 to-transparent px-2 pb-1.5 pt-7 text-[11px] font-medium text-white">
                    <span aria-hidden="true">{getLanguageFlag(session.languageFrom)}</span>
                    <span aria-hidden="true">→</span>
                    <span aria-hidden="true">{getLanguageFlag(session.languageTo)}</span>
                    <span className="ml-auto tabular-nums">{session.labels.length}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => requestDelete(session.id)}
                  aria-label={t('photoLab.deletePhoto')}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/40 bg-black/60 text-[11px] text-white transition hover:bg-black/80"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {confirmDeleteId && (
        <DeletePhotoConfirmModal
          onConfirm={() => void removeSession(confirmDeleteId)}
          onCancel={cancelDelete}
        />
      )}
    </main>
  );
}
