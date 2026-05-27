import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheActiveListAudio,
  clearLearningCache,
  getAudioCachePreference,
  getAudioCacheStatus,
  getAudioUrlsForWords,
  getStoragePreference,
  setAudioCachePreference,
  setStoragePreference,
} from '../local-learning-cache';
import type { NormalizedWord } from '../words';

const audioWord: NormalizedWord = {
  id: 'word-a',
  cz: 'hello',
  vi: 'xin chao',
  en: '',
  category: [],
  czAudio: ['/api/audio/hash-known', 'https://turbo-gateway.com/known'],
  viAudio: ['/api/audio/hash-target', 'https://turbo-gateway.com/target'],
};

describe('local learning cache preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'caches');
    Reflect.deleteProperty(globalThis, 'indexedDB');
    Reflect.deleteProperty(navigator, 'connection');
    Reflect.deleteProperty(navigator, 'onLine');
  });

  it('defaults local learning storage on and audio cache on for regular connections', () => {
    expect(getStoragePreference()).toBe(true);
    expect(getAudioCachePreference()).toBe(true);
  });

  it('persists cache preferences independently', () => {
    setStoragePreference(true);
    setAudioCachePreference(true);

    expect(getStoragePreference()).toBe(true);
    expect(getAudioCachePreference()).toBe(true);
  });

  it('clears IndexedDB and active-list audio cache without touching cache preferences', async () => {
    const deleteDatabase = vi.fn().mockImplementation(() => {
      const request: { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {};
      queueMicrotask(() => request.onsuccess?.());
      return request;
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { deleteDatabase },
    });

    const deleteCache = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { delete: deleteCache },
    });

    setStoragePreference(true);
    await clearLearningCache();

    expect(deleteDatabase).toHaveBeenCalledWith('get-word-learning-cache');
    expect(deleteCache).toHaveBeenCalledWith('get-word-active-list-audio-v1');
    expect(getStoragePreference()).toBe(true);
  });

  it('reports the cached audio byte size', async () => {
    const requests = [
      new Request('https://example.com/audio/a.mp3'),
      new Request('https://example.com/audio/b.mp3'),
    ];
    const responses = new Map<string, Response>([
      [
        requests[0].url,
        new Response('a', { headers: { 'content-length': '1024' } }),
      ],
      [
        requests[1].url,
        new Response('b'.repeat(512)),
      ],
    ]);
    const cache = {
      keys: vi.fn().mockResolvedValue(requests),
      match: vi.fn((request: Request) => Promise.resolve(responses.get(request.url) ?? null)),
    };

    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open: vi.fn().mockResolvedValue(cache) },
    });

    const status = await getAudioCacheStatus();

    expect(status.cachedCount).toBe(2);
    expect(status.cachedSizeBytes).toBe(1536);
  });

  it('caches only the preferred source instead of each gateway fallback', () => {
    expect(getAudioUrlsForWords([audioWord])).toEqual([
      '/api/audio/hash-known',
      '/api/audio/hash-target',
    ]);
  });

  it('does not start whole-list downloads on cellular data', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { type: 'cellular', effectiveType: '4g', saveData: false },
    });
    setAudioCachePreference(true);
    const cache = {
      keys: vi.fn().mockResolvedValue([]),
      match: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await cacheActiveListAudio([audioWord]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts an active whole-list download when the connection goes offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { type: 'wifi', effectiveType: '4g', saveData: false },
    });
    setAudioCachePreference(true);
    const cache = {
      keys: vi.fn().mockResolvedValue([]),
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn(),
    };
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) });
    let attemptedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      attemptedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        attemptedSignal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const caching = cacheActiveListAudio([audioWord]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
    await caching;

    expect(attemptedSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops optional downloads after a transport failure before offline is reported', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { type: 'wifi', effectiveType: '4g', saveData: false },
    });
    setAudioCachePreference(true);
    const cache = {
      keys: vi.fn().mockResolvedValue([]),
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn(),
    };
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) });
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await cacheActiveListAudio([audioWord]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
