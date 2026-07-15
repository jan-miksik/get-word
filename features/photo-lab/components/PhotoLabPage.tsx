'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { useListsSettingsLanguage } from '@/features/lists/hooks/useListsSettingsLanguage';
// TODO: lift useLearningLanguages out of features/lists into a shared location.
import { useLearningLanguages } from '@/features/lists/hooks/useLearningLanguages';
import { readPhotoLabPreference } from '@/features/learning/state/preferences';
import { getPrefsRow } from '@/lib/local-first/stores';
import { requestPhotoAnalysis, PhotoLabRequestError, type PhotoLabErrorCode } from '../client/analyze';
import { downscalePhoto, type DownscaledPhoto } from '../client/downscale';
import {
  cleanupPhotoLab,
  deleteSession,
  getPhoto,
  listSessions,
  putPhoto,
  putSession,
} from '../client/photoStore';
import type { PhotoLabSession } from '../types';
import { LabeledPhoto } from './LabeledPhoto';

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

export function PhotoLabPage() {
  const settingsLanguage = useListsSettingsLanguage();

  return (
    <I18nProvider language={settingsLanguage}>
      <PhotoLabContent />
    </I18nProvider>
  );
}

function PhotoLabContent() {
  const { t } = useI18n();
  // null = not yet known (first client render); avoids a hydration mismatch.
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    setEnabled(readPhotoLabPreference());
    void cleanupPhotoLab();
  }, []);

  if (enabled === null) return null;
  if (!enabled) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="flex max-w-sm flex-col gap-3 rounded-xl border border-border-subtle p-6 text-center">
          <p className="m-0 text-sm text-text">{t('photoLab.enableHint')}</p>
          <Link href="/" className="text-sm text-accent underline">
            ← Get Word
          </Link>
        </div>
      </main>
    );
  }
  return <PhotoLabStudio />;
}

function PhotoLabStudio() {
  const { t } = useI18n();
  const languages = useLearningLanguages();

  const [langFrom, setLangFrom] = useState('');
  const [langTo, setLangTo] = useState('');
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

  // Default language pair: last used here, else the learning pair cached from sync.
  useEffect(() => {
    let cancelled = false;
    const stored = readStoredLanguagePair();
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
    return () => {
      cancelled = true;
    };
  }, []);

  const trackUrl = useCallback((url: string) => {
    createdUrlsRef.current.push(url);
    return url;
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
      } catch (err) {
        setErrorCode(err instanceof PhotoLabRequestError ? err.code : 'generic');
      } finally {
        setAnalyzing(false);
      }
    },
    [langFrom, langTo, refreshHistory],
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
        return;
      }
      const blob = await getPhoto(session.photoHash);
      if (blob) {
        setCurrent({ session, imageUrl: trackUrl(URL.createObjectURL(blob)) });
      }
    },
    [thumbUrls, trackUrl],
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
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-5 p-4 pb-10">
      <header className="flex items-center justify-between">
        <h1 className="m-0 text-lg font-semibold text-text">{t('photoLab.title')}</h1>
        <Link href="/" className="text-sm text-accent underline">
          ← Get Word
        </Link>
      </header>

      <section className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-text-soft">
          {t('photoLab.knownLanguage')}
          <select
            value={langFrom}
            onChange={(event) => {
              setLangFrom(event.target.value);
              storeLanguagePair({ from: event.target.value, to: langTo || undefined });
            }}
            className="w-full rounded-lg border border-border-subtle bg-transparent px-2 py-1.5 text-sm text-text"
          >
            <option value="" disabled />
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-1.5 text-text-soft">→</span>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-text-soft">
          {t('photoLab.targetLanguage')}
          <select
            value={langTo}
            onChange={(event) => {
              setLangTo(event.target.value);
              storeLanguagePair({ from: langFrom || undefined, to: event.target.value });
            }}
            className="w-full rounded-lg border border-border-subtle bg-transparent px-2 py-1.5 text-sm text-text"
          >
            <option value="" disabled />
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        disabled={!languagesReady || analyzing}
        onClick={() => fileInputRef.current?.click()}
        className="rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
      >
        📷 {t('photoLab.pickPhoto')}
      </button>

      {analyzing && (
        <p className="m-0 animate-pulse text-center text-sm text-text-soft">
          {t('photoLab.analyzing')}
        </p>
      )}

      {errorCode && !analyzing && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border-subtle p-4">
          <p className="m-0 text-center text-sm text-text">{t(ERROR_MESSAGE_KEYS[errorCode])}</p>
          {pendingPhoto && errorCode !== 'limit' && errorCode !== 'tooLarge' && (
            <button
              type="button"
              onClick={() => void analyze(pendingPhoto)}
              className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text"
            >
              {t('photoLab.retry')}
            </button>
          )}
        </div>
      )}

      {current && !analyzing && (
        <LabeledPhoto imageUrl={current.imageUrl} labels={current.session.labels} />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-medium text-text-soft">{t('photoLab.history')}</h2>
        {history.length === 0 ? (
          <p className="m-0 text-xs text-text-soft/70">{t('photoLab.historyEmpty')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {history.map((session) => (
              <div key={session.id} className="relative">
                <button
                  type="button"
                  onClick={() => void openSession(session)}
                  className="block w-full overflow-hidden rounded-lg border border-border-subtle"
                >
                  {thumbUrls.get(session.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                    <img
                      src={thumbUrls.get(session.id)}
                      alt=""
                      className="block aspect-square w-full object-cover"
                    />
                  ) : (
                    <span className="block aspect-square w-full bg-border-subtle/40" />
                  )}
                  <span className="block truncate px-1 py-0.5 text-[10px] text-text-soft">
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
