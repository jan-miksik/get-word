'use client';

import type { Word } from '@/lib/words';
import { stripLegacyLocalSpeechAudioFromWord } from '@/lib/words';

// The word list is global and changes rarely, yet `/api/words` is a multi-second
// round-trip to the remote DB. Cache the resolved list for the session so it's
// fetched at most once and every later page mount (notably the post-login
// remount) reads it instantly instead of re-paying that latency.

const SESSION_CACHE_KEY = 'get-word-words-cache-v1';
const WORDS_FETCH_TIMEOUT_MS = 30_000;

let cachedWords: Word[] | null = null;
let inFlight: Promise<Word[]> | null = null;

function readSessionCache(): Word[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Word[]) : null;
  } catch {
    return null;
  }
}

function writeSessionCache(words: Word[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(words));
  } catch {
    // Quota/serialization failure is non-fatal — the in-memory cache still serves.
  }
}

/** Promote a warm session cache into the in-memory cache, if present. */
function hydrateFromSession(): Word[] | null {
  if (cachedWords) return cachedWords;
  const fromSession = readSessionCache();
  if (fromSession) {
    cachedWords = fromSession;
    return cachedWords;
  }
  return null;
}

async function requestWords(): Promise<Word[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORDS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('/api/words', { signal: controller.signal });
    if (!res.ok) throw new Error(`Words API ${res.status}: ${res.statusText}`);
    const data = await res.json();
    const words: Word[] = Array.isArray(data.words)
      ? data.words.map(stripLegacyLocalSpeechAudioFromWord)
      : [];
    cachedWords = words;
    writeSessionCache(words);
    return words;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Load the global word list, deduping concurrent callers and reusing the
 * resolved list for the rest of the session. Lives at module scope so an
 * in-flight fetch survives component unmounts (e.g. the signed-out `/` → `/login`
 * redirect no longer discards it).
 */
export function loadWords(): Promise<Word[]> {
  const warm = hydrateFromSession();
  if (warm) return Promise.resolve(warm);
  if (inFlight) return inFlight;
  const pending = requestWords();
  inFlight = pending;
  // Clear the in-flight handle once settled so a failed fetch can be retried.
  void pending.finally(() => {
    if (inFlight === pending) inFlight = null;
  });
  return pending;
}

/** Warm the cache ahead of time (e.g. from the login screen). */
export function prefetchWords(): void {
  void loadWords().catch(() => undefined);
}
