'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createBrowserId } from '@/lib/browser-id';
import { getPrefsRow } from '@/lib/local-first/stores';
import {
  PhotoLabRequestError,
  requestPhotoAnalysis,
  type PhotoLabErrorCode,
} from '../client/analyze';
import { requestPhotoLabAudio } from '../client/audio';
import { downscalePhoto, type DownscaledPhoto } from '../client/downscale';
import {
  readPhotoLabLanguagePair,
  storePhotoLabLanguagePair,
  type PhotoLabLanguagePair,
} from '../client/languagePair';
import {
  cleanupPhotoLab,
  deleteSession,
  getPhoto,
  listSessions,
  putPhoto,
  putSession,
  updateSessionAudioHashes,
} from '../client/photoStore';
import { requestPhotoLabUsage, type PhotoLabUsage } from '../client/usage';
import type { PhotoLabSession } from '../types';

const HISTORY_LIMIT = 20;

export function usePhotoLabStudio() {
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

  // Default language pair: last used here, else the learning pair cached from sync.
  useEffect(() => {
    let cancelled = false;
    const stored = readPhotoLabLanguagePair();
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

  const changeLanguagePair = useCallback((pair: PhotoLabLanguagePair) => {
    setLangFrom(pair.from);
    setLangTo(pair.to);
    storePhotoLabLanguagePair({ from: pair.from || undefined, to: pair.to || undefined });
  }, []);
  const openLanguageModal = useCallback(() => setLangModalOpen(true), []);
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
        requestSessionAudio(session);
        void (async () => {
          try {
            if (await putPhoto(photo.hash, photo.blob)) {
              await putSession(session);
              await cleanupPhotoLab();
              void refreshHistory();
            }
          } catch {
            // The analyzed session remains usable in memory if persistence fails.
          }
        })();
      } catch (error) {
        console.error('[photo-lab] analysis failed', error);
        setErrorCode(error instanceof PhotoLabRequestError ? error.code : 'generic');
      } finally {
        stopAnalyzing();
        void loadUsage();
      }
    },
    [langFrom, langTo, loadUsage, refreshHistory, requestSessionAudio, startAnalyzing, stopAnalyzing],
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      // The button is disabled once the allowance is spent, but a stale usage
      // read (or a second tab) can still get a file here. Refuse before the
      // spinner starts rather than after a pointless upload.
      if (usage && usage.remaining <= 0) {
        setErrorCode('limit');
        void loadUsage();
        return;
      }
      startAnalyzing();
      setErrorCode(null);
      setCurrent(null);
      try {
        const photo = await downscalePhoto(file);
        setPendingPhoto(photo);
        await analyze(photo);
      } catch (error) {
        console.error('[photo-lab] image preparation failed', error);
        setErrorCode('imageProcessing');
        stopAnalyzing();
      }
    },
    [analyze, loadUsage, startAnalyzing, stopAnalyzing, usage],
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

  return {
    langFrom,
    langTo,
    langModalOpen,
    analysisElapsedSeconds,
    analyzing: analysisStartedAt !== null,
    errorCode,
    usage,
    current,
    history,
    confirmDeleteId,
    thumbUrls,
    fileInputRef,
    pendingPhoto,
    // Unknown usage (offline, first load) must not block the button — the
    // server is still the authority and answers with a 429.
    limitReached: usage ? usage.remaining <= 0 : false,
    languagesReady: Boolean(langFrom && langTo && langFrom !== langTo),
    changeLanguagePair,
    openLanguageModal,
    closeLanguageModal,
    analyze,
    handleFileChange,
    openSession,
    removeSession,
    requestDelete: setConfirmDeleteId,
    cancelDelete: () => setConfirmDeleteId(null),
  };
}
