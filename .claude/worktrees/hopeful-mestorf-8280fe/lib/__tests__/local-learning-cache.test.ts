import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLearningCache,
  getAudioCachePreference,
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

  it('defaults larger local caches to off', () => {
    expect(getStoragePreference()).toBe(false);
    expect(getAudioCachePreference()).toBe(false);
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

    expect(deleteDatabase).toHaveBeenCalledWith('wordlink-learning-cache');
    expect(deleteCache).toHaveBeenCalledWith('wordlink-active-list-audio-v1');
    expect(getStoragePreference()).toBe(true);
  });
});
