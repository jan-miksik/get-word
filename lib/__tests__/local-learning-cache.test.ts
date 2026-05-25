import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLearningCache,
  getAudioCachePreference,
  getAudioCacheStatus,
  getStoragePreference,
  setAudioCachePreference,
  setStoragePreference,
} from '../local-learning-cache';

describe('local learning cache preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'caches');
    Reflect.deleteProperty(globalThis, 'indexedDB');
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
});
