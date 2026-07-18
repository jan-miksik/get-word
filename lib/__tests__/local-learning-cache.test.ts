import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheActiveListAudio,
  clearLearningCache,
  getAudioCachePreference,
  getAudioCacheStatus,
  getAudioCandidateGroupsForWords,
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
  czAudio: ['https://turbo-gateway.com/known', '/api/audio/hash-known'],
  viAudio: ['https://turbo-gateway.com/target', '/api/audio/hash-target'],
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

  it('builds gateway-first candidate groups with the API mirror as last resort', () => {
    expect(getAudioCandidateGroupsForWords([audioWord])).toEqual([
      [
        'https://arweave.net/known',
        'https://turbo-gateway.com/known',
        'https://ar-io.net/known',
        '/api/audio/hash-known',
      ],
      [
        'https://arweave.net/target',
        'https://turbo-gateway.com/target',
        'https://ar-io.net/target',
        '/api/audio/hash-target',
      ],
    ]);
  });

  it('caches a small list on cellular data', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { type: 'cellular', effectiveType: '4g', saveData: false },
    });
    setAudioCachePreference(true);
    const cache = {
      keys: vi.fn().mockResolvedValue([]),
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn(),
    };
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) });
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response('a', { headers: { 'content-length': '1024' } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await cacheActiveListAudio([audioWord]);

    // Both word sides download even on metered data because the list is tiny.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cache.put).toHaveBeenCalledTimes(2);
  });

  it('stops caching on cellular once the 10 MB size budget is exceeded', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { type: 'cellular', effectiveType: '4g', saveData: false },
    });
    setAudioCachePreference(true);
    const cache = {
      keys: vi.fn().mockResolvedValue([]),
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn(),
    };
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) });
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response('x', { headers: { 'content-length': String(11 * 1024 * 1024) } }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await cacheActiveListAudio([audioWord]);

    // First download already exceeds the metered budget, so the second is skipped.
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    // Unmetered connections fan out, so both word sides are in flight at once.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
    await caching;

    expect(attemptedSignal?.aborted).toBe(true);
  });

  it('skips a failing clip and keeps caching the rest of the list', async () => {
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
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url).includes('known-2')) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve(new Response('a', { headers: { 'content-length': '10' } }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const words: NormalizedWord[] = Array.from({ length: 4 }, (_, index) => ({
      ...audioWord,
      id: `word-${index}`,
      czAudio: [`/api/audio/known-${index}`],
      viAudio: [`/api/audio/target-${index}`],
    }));

    await cacheActiveListAudio(words);

    // One clip failing on its only source must not stop the rest of the list.
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(cache.put).toHaveBeenCalledTimes(7);
  });

  it('stops optional downloads after repeated clip failures instead of attempting the whole list', async () => {
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

    // More URLs than the concurrency limit so a failure can stop the remainder.
    const words: NormalizedWord[] = Array.from({ length: 20 }, (_, index) => ({
      ...audioWord,
      id: `word-${index}`,
      czAudio: [`/api/audio/known-${index}`],
      viAudio: [`/api/audio/target-${index}`],
    }));

    await cacheActiveListAudio(words);

    // Three clips in a row failing on every source abort the controller, so
    // the remaining clips are skipped.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(fetchMock.mock.calls.length).toBeLessThan(words.length * 2);
  });
});
