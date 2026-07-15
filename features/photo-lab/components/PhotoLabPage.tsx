'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { useListsSettingsLanguage } from '@/features/lists/hooks/useListsSettingsLanguage';
// TODO: lift useLearningLanguages out of features/lists into a shared location.
import { useLearningLanguages } from '@/features/lists/hooks/useLearningLanguages';
import { readPhotoLabPreference } from '@/features/learning/state/preferences';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';
import { getLanguageFlag, getLocalizedLanguageName } from '@/lib/i18n/languages';
import { getPrefsRow } from '@/lib/local-first/stores';
import { requestPhotoAnalysis, PhotoLabRequestError, type PhotoLabErrorCode } from '../client/analyze';
import { requestPhotoLabAudio } from '../client/audio';
import { downscalePhoto, type DownscaledPhoto } from '../client/downscale';
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

const ERROR_MESSAGE_KEYS = {
  limit: 'photoLab.errorLimit',
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
  return (
    <div
      style={warmPaletteVars}
      className="min-h-dvh bg-[var(--ob-surface)] text-[color:var(--ob-ink)]"
    >
      {children}
    </div>
  );
}

export function PhotoLabPage() {
  const settingsLanguage = useListsSettingsLanguage();

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
    if (!code) return fallbackLabel;
    const flag = getLanguageFlag(code);
    const name = getLocalizedLanguageName(code, uiLanguage) ?? code.toUpperCase();
    return flag ? `${flag} ${name}` : name;
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('photoLab.changeLanguages')}
      title={t('photoLab.changeLanguages')}
      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[color:var(--ob-ink)] bg-[var(--ob-surface)] px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--ob-surface-hover)]"
    >
      <span className="truncate">{describe(from, t('photoLab.knownLanguage'))}</span>
      <span aria-hidden="true" className="text-[color:var(--ob-ink-soft)]">
        →
      </span>
      <span className="truncate">{describe(to, t('photoLab.targetLanguage'))}</span>
      <span aria-hidden="true" className="text-xs text-[color:var(--ob-ink-soft)]">
        ✎
      </span>
    </button>
  );
}

function PhotoLabStudio() {
  const { t } = useI18n();
  const languages = useLearningLanguages();

  const [langFrom, setLangFrom] = useState('');
  const [langTo, setLangTo] = useState('');
  const [langModalOpen, setLangModalOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorCode, setErrorCode] = useState<PhotoLabErrorCode | null>(null);
  const [current, setCurrent] = useState<{ session: PhotoLabSession; imageUrl: string } | null>(
    null,
  );
  const [history, setHistory] = useState<PhotoLabSession[]>([]);
  const thumbUrlsRef = useRef<Map<string, string>>(new Map());
  const historyRefreshIdRef = useRef(0);
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(() => new Map());

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Held for "try again" so a failed analysis doesn't force re-picking the photo.
  const [pendingPhoto, setPendingPhoto] = useState<DownscaledPhoto | null>(null);
  const createdUrlsRef = useRef<string[]>([]);

  // LanguageCombobox expects the onboarding language shape.
  const onboardingLanguages = useMemo(
    () =>
      languages.map((language) => ({
        ...language,
        ttsAvailable: language.ttsAvailable ?? false,
        preferredVoice: null,
      })),
    [languages],
  );

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
      setAnalyzing(true);
      setErrorCode(null);
      setCurrent(null);
      try {
        const labels = await requestPhotoAnalysis(photo.dataUrl, langFrom, langTo);
        const session: PhotoLabSession = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          languageFrom: langFrom,
          languageTo: langTo,
          photoHash: photo.hash,
          labels,
        };
        // The photo blob must land before the session row so history never
        // references a missing image; on write failure the session stays
        // in-memory only.
        if (await putPhoto(photo.hash, photo.blob)) {
          await putSession(session);
          await cleanupPhotoLab();
          void refreshHistory();
        }
        setPendingPhoto(null);
        setCurrent({ session, imageUrl: photo.dataUrl });
        requestSessionAudio(session);
      } catch (err) {
        setErrorCode(err instanceof PhotoLabRequestError ? err.code : 'generic');
      } finally {
        setAnalyzing(false);
      }
    },
    [langFrom, langTo, refreshHistory, requestSessionAudio],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const photo = await downscalePhoto(file);
        setPendingPhoto(photo);
        await analyze(photo);
      } catch {
        setErrorCode('generic');
      }
    },
    [analyze],
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
      await deleteSession(id);
      setCurrent((value) => (value?.session.id === id ? null : value));
      void refreshHistory();
    },
    [refreshHistory],
  );

  const languagesReady = Boolean(langFrom && langTo && langFrom !== langTo);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 p-4 pb-10">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between">
        <h1 className="m-0 text-lg font-semibold">{t('photoLab.title')}</h1>
        <Link href="/" className="text-sm text-[color:var(--ob-accent)] underline">
          ← Get Word
        </Link>
      </header>

      <section className="mx-auto w-full max-w-xl">
        <LanguagePairSummary from={langFrom} to={langTo} onOpen={() => setLangModalOpen(true)} />
      </section>

      <LanguagePairModal
        isOpen={langModalOpen}
        languages={onboardingLanguages}
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
      <div className="mx-auto w-full max-w-xl">
        <button
          type="button"
          disabled={!languagesReady || analyzing}
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-xl bg-[var(--ob-accent)] px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          📷 {t('photoLab.pickPhoto')}
        </button>
      </div>

      {analyzing && (
        <p className="m-0 animate-pulse text-center text-sm text-[color:var(--ob-ink-soft)]">
          {t('photoLab.analyzing')}
        </p>
      )}

      {errorCode && !analyzing && (
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-2 rounded-xl border-2 border-[color:var(--ob-ink)] p-4">
          <p className="m-0 text-center text-sm">{t(ERROR_MESSAGE_KEYS[errorCode])}</p>
          {pendingPhoto && errorCode !== 'limit' && errorCode !== 'tooLarge' && (
            <button
              type="button"
              onClick={() => void analyze(pendingPhoto)}
              className="rounded-lg border-2 border-[color:var(--ob-ink)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--ob-surface-hover)]"
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

      <section className="mx-auto flex w-full max-w-xl flex-col gap-2">
        <h2 className="m-0 text-sm font-medium text-[color:var(--ob-ink-soft)]">
          {t('photoLab.history')}
        </h2>
        {history.length === 0 ? (
          <p className="m-0 text-xs text-[color:var(--ob-ink-soft)]/70">
            {t('photoLab.historyEmpty')}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {history.map((session) => (
              <div key={session.id} className="relative">
                <button
                  type="button"
                  onClick={() => void openSession(session)}
                  className="block w-full overflow-hidden rounded-lg border-2 border-[color:var(--ob-ink)]/25 transition-colors hover:border-[color:var(--ob-ink)]"
                >
                  {thumbUrls.get(session.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                    <img
                      src={thumbUrls.get(session.id)}
                      alt=""
                      className="block aspect-square w-full object-cover"
                    />
                  ) : (
                    <span className="block aspect-square w-full bg-[color:var(--ob-ink)]/10" />
                  )}
                  <span className="block truncate px-1 py-0.5 text-[10px] text-[color:var(--ob-ink-soft)]">
                    {session.languageFrom}→{session.languageTo} · {session.labels.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void removeSession(session.id)}
                  aria-label={t('photoLab.deletePhoto')}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
