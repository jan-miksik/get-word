'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';
import { useSupportedLanguages } from '@/features/shared/languages/useSupportedLanguages';
import { readPhotoLabPreference } from '@/features/photo-lab/client/preferences';
import { WARM_PALETTE, warmPaletteVars } from '@/features/shared/theme/warm-palette';
import { createBrowserId } from '@/lib/browser-id';
import { getLanguageFlag, getLocalizedLanguageName } from '@/lib/i18n/languages';
import { getPrefsRow } from '@/lib/local-first/stores';
import { requestPhotoAnalysis, PhotoLabRequestError, type PhotoLabErrorCode } from '../client/analyze';
import { requestPhotoLabAudio } from '../client/audio';
import { downscalePhoto, type DownscaledPhoto } from '../client/downscale';
import { requestPhotoLabUsage, type PhotoLabUsage } from '../client/usage';
import {
  cleanupPhotoLab,
  deleteSession,
  getPhoto,
  listSessions,
  putPhoto,
  putSession,
  updateSessionAudioHashes,
} from '../client/photoStore';
import type { PhotoLabSession } from '../types';
import { LabeledPhoto } from './LabeledPhoto';
import { LanguagePairModal } from './LanguagePairModal';

const LANGS_STORAGE_KEY = 'get-word-photo-lab-langs';
const HISTORY_LIMIT = 20;
// Calibrated to the pro-tier vision model (see PHOTO_LAB_MODEL).
const ANALYSIS_ESTIMATE_SECONDS = 25;

const ERROR_MESSAGE_KEYS = {
  limit: 'photoLab.errorLimit',
  imageProcessing: 'photoLab.errorImageProcessing',
  tooLarge: 'photoLab.errorTooLarge',
  unauthorized: 'photoLab.errorUnauthorized',
  generic: 'photoLab.errorGeneric',
} as const;

type LanguagePair = { from: string; to: string };

function readStoredLanguagePair(): Partial<LanguagePair> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LANGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<LanguagePair>;
    return {
      from: typeof parsed.from === 'string' ? parsed.from : undefined,
      to: typeof parsed.to === 'string' ? parsed.to : undefined,
    };
  } catch {
    return {};
  }
}

function storeLanguagePair(pair: Partial<LanguagePair>): void {
  try {
    window.localStorage.setItem(LANGS_STORAGE_KEY, JSON.stringify(pair));
  } catch {
    // Preference persistence is best-effort.
  }
}

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

  const [langFrom, setLangFrom] = useState('');
  const [langTo, setLangTo] = useState('');
  const [langModalOpen, setLangModalOpen] = useState(false);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null);
  const [analysisElapsedSeconds, setAnalysisElapsedSeconds] = useState(0);
  const [errorCode, setErrorCode] = useState<PhotoLabErrorCode | null>(null);
  const [usage, setUsage] = useState<PhotoLabUsage | null>(null);
  const [current, setCurrent] = useState<{ session: PhotoLabSession; imageUrl: string } | null>(
    null,
  );
  const [history, setHistory] = useState<PhotoLabSession[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const thumbUrlsRef = useRef<Map<string, string>>(new Map());
  const historyRefreshIdRef = useRef(0);
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(() => new Map());

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Held for "try again" so a failed analysis doesn't force re-picking the photo.
  const [pendingPhoto, setPendingPhoto] = useState<DownscaledPhoto | null>(null);
  const createdUrlsRef = useRef<string[]>([]);
  const analyzing = analysisStartedAt !== null;
  const analysisRemainingSeconds = Math.max(
    1,
    ANALYSIS_ESTIMATE_SECONDS - analysisElapsedSeconds,
  );
  const analysisStatusText =
    analysisElapsedSeconds < ANALYSIS_ESTIMATE_SECONDS
      ? t('photoLab.analyzingWithEta', { seconds: analysisRemainingSeconds })
      : t('photoLab.analyzingTakingLonger');

  // Default language pair: last used here, else the learning pair cached from sync.
  useEffect(() => {
    let cancelled = false;
    const stored = readStoredLanguagePair();
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      if (stored.from) setLangFrom(stored.from);
      if (stored.to) setLangTo(stored.to);
      if (stored.from && stored.to) return;

      void getPrefsRow<{ language_from?: string | null; language_to?: string | null }>('user').then(
        (row) => {
          if (cancelled || !row?.value) return;
          if (!stored.from && row.value.language_from) setLangFrom(row.value.language_from);
          if (!stored.to && row.value.language_to) setLangTo(row.value.language_to);
        },
      );
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const changeLanguagePair = useCallback((pair: LanguagePair) => {
    setLangFrom(pair.from);
    setLangTo(pair.to);
    storeLanguagePair({ from: pair.from || undefined, to: pair.to || undefined });
  }, []);
  const closeLanguageModal = useCallback(() => setLangModalOpen(false), []);
  const startAnalyzing = useCallback(() => {
    setAnalysisStartedAt((startedAt) => startedAt ?? Date.now());
    setAnalysisElapsedSeconds(0);
  }, []);
  const stopAnalyzing = useCallback(() => setAnalysisStartedAt(null), []);
  const loadUsage = useCallback(async () => {
    const next = await requestPhotoLabUsage();
    if (next) setUsage(next);
  }, []);

  useEffect(() => {
    if (analysisStartedAt === null) return undefined;
    const updateElapsed = () =>
      setAnalysisElapsedSeconds(Math.floor((Date.now() - analysisStartedAt) / 1000));
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [analysisStartedAt]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadUsage(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadUsage]);

  const trackUrl = useCallback((url: string) => {
    createdUrlsRef.current.push(url);
    return url;
  }, []);

  const requestSessionAudio = useCallback((session: PhotoLabSession) => {
    if (session.audioHashes !== undefined) return;

    void requestPhotoLabAudio(session.id, session.labels, session.languageTo).then(
      async (result) => {
        if (!result.ok) return;
        await updateSessionAudioHashes(session.id, result.hashes);
        const withAudio = (candidate: PhotoLabSession): PhotoLabSession =>
          candidate.id === session.id
            ? { ...candidate, audioHashes: result.hashes }
            : candidate;
        setCurrent((value) =>
          value?.session.id === session.id
            ? { ...value, session: withAudio(value.session) }
            : value,
        );
        setHistory((items) => items.map(withAudio));
      },
    );
  }, []);

  const refreshHistory = useCallback(async () => {
    const refreshId = historyRefreshIdRef.current + 1;
    historyRefreshIdRef.current = refreshId;
    const sessions = (await listSessions()).slice(0, HISTORY_LIMIT);
    const knownIds = new Set(thumbUrlsRef.current.keys());
    const entries = await Promise.all(
      sessions.filter((session) => !knownIds.has(session.id)).map(async (session) => {
        const blob = await getPhoto(session.photoHash);
        return blob ? ([session.id, URL.createObjectURL(blob)] as const) : null;
      }),
    );
    if (refreshId !== historyRefreshIdRef.current) {
      for (const entry of entries) {
        if (entry) URL.revokeObjectURL(entry[1]);
      }
      return;
    }
    setHistory(sessions);
    setThumbUrls((previous) => {
      const next = new Map(previous);
      const activeIds = new Set(sessions.map((session) => session.id));
      for (const [id, url] of next) {
        if (activeIds.has(id)) continue;
        URL.revokeObjectURL(url);
        next.delete(id);
      }
      for (const entry of entries) {
        if (!entry) continue;
        if (next.has(entry[0])) {
          // A concurrent refresh won the race after this URL was created.
          URL.revokeObjectURL(entry[1]);
          continue;
        }
        next.set(entry[0], trackUrl(entry[1]));
      }
      thumbUrlsRef.current = next;
      return next;
    });
  }, [trackUrl]);

  useEffect(() => {
    void refreshHistory();
    const urls = createdUrlsRef.current;
    return () => {
      historyRefreshIdRef.current += 1;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [refreshHistory]);

  const analyze = useCallback(
    async (photo: DownscaledPhoto) => {
      startAnalyzing();
      setErrorCode(null);
      setCurrent(null);
      try {
        const labels = await requestPhotoAnalysis(photo.dataUrl, langFrom, langTo);
        const session: PhotoLabSession = {
          id: createBrowserId('photo-lab-session'),
          createdAt: Date.now(),
          languageFrom: langFrom,
          languageTo: langTo,
          photoHash: photo.hash,
          labels,
        };
        setPendingPhoto(null);
        setCurrent({ session, imageUrl: photo.dataUrl });
        // Audio and local persistence continue after labels are visible. Neither
        // should keep the user behind the analyzing state.
        requestSessionAudio(session);
        void (async () => {
          try {
            // The photo blob must land before the session row so history never
            // references a missing image.
            if (await putPhoto(photo.hash, photo.blob)) {
              await putSession(session);
              await cleanupPhotoLab();
              void refreshHistory();
            }
          } catch {
            // The analyzed session remains usable in memory if persistence fails.
          }
        })();
      } catch (err) {
        console.error('[photo-lab] analysis failed', err);
        setErrorCode(err instanceof PhotoLabRequestError ? err.code : 'generic');
      } finally {
        stopAnalyzing();
        void loadUsage();
      }
    },
    [langFrom, langTo, loadUsage, refreshHistory, requestSessionAudio, startAnalyzing, stopAnalyzing],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      startAnalyzing();
      setErrorCode(null);
      setCurrent(null);
      try {
        const photo = await downscalePhoto(file);
        setPendingPhoto(photo);
        await analyze(photo);
      } catch (err) {
        console.error('[photo-lab] image preparation failed', err);
        setErrorCode('imageProcessing');
        stopAnalyzing();
      }
    },
    [analyze, startAnalyzing, stopAnalyzing],
  );

  const openSession = useCallback(
    async (session: PhotoLabSession) => {
      setErrorCode(null);
      const knownUrl = thumbUrls.get(session.id);
      if (knownUrl) {
        setCurrent({ session, imageUrl: knownUrl });
        requestSessionAudio(session);
        return;
      }
      const blob = await getPhoto(session.photoHash);
      if (blob) {
        setCurrent({ session, imageUrl: trackUrl(URL.createObjectURL(blob)) });
        requestSessionAudio(session);
      }
    },
    [thumbUrls, trackUrl, requestSessionAudio],
  );

  const removeSession = useCallback(
    async (id: string) => {
      setConfirmDeleteId(null);
      await deleteSession(id);
      setCurrent((value) => (value?.session.id === id ? null : value));
      void refreshHistory();
    },
    [refreshHistory],
  );

  const languagesReady = Boolean(langFrom && langTo && langFrom !== langTo);

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
          <LanguagePairSummary from={langFrom} to={langTo} onOpen={() => setLangModalOpen(true)} />
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
                  onClick={() => setConfirmDeleteId(session.id)}
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
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </main>
  );
}
