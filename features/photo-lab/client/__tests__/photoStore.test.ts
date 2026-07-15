import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoLabSession } from '@/features/photo-lab/types';

type Handler = (() => void) | null;

function requestWithResult<T>(result: T) {
  const request = {
    result,
    error: null,
    onsuccess: null as Handler,
    onerror: null as Handler,
  };
  queueMicrotask(() => request.onsuccess?.());
  return request;
}

function installIndexedDbStub() {
  const stores = new Map<string, Map<string, unknown>>();
  const db = {
    objectStoreNames: {
      contains: (name: string) => stores.has(name),
    },
    createObjectStore(name: string) {
      const store = new Map<string, unknown>();
      stores.set(name, store);
      return store;
    },
    transaction() {
      const transaction = {
        oncomplete: null as Handler,
        onerror: null as Handler,
        onabort: null as Handler,
        objectStore(name: string) {
          const records = stores.get(name);
          if (!records) throw new Error(`Missing store: ${name}`);
          return {
            get(key: string) {
              return requestWithResult(records.get(key));
            },
            getAll() {
              return requestWithResult([...records.values()]);
            },
            put(value: { id?: string; hash?: string }) {
              const key = value.id ?? value.hash;
              if (!key) throw new Error('Missing key');
              records.set(key, structuredClone(value));
              return requestWithResult(key);
            },
            delete(key: string) {
              records.delete(key);
              return requestWithResult(undefined);
            },
          };
        },
      };
      setTimeout(() => transaction.oncomplete?.(), 0);
      return transaction;
    },
  };

  const indexedDb = {
    open() {
      const request = {
        result: db,
        error: null,
        onupgradeneeded: null as Handler,
        onsuccess: null as Handler,
        onerror: null as Handler,
        onblocked: null as Handler,
      };
      setTimeout(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);
      return request;
    },
  };

  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: indexedDb as unknown as IDBFactory,
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'indexedDB');
  vi.resetModules();
});

describe('updateSessionAudioHashes', () => {
  it('merges hashes into the latest stored row instead of overwriting newer data', async () => {
    installIndexedDbStub();
    const { listSessions, putSession, updateSessionAudioHashes } = await import('../photoStore');
    const original: PhotoLabSession = {
      id: 'session-1',
      createdAt: 1,
      languageFrom: 'cs',
      languageTo: 'vi',
      photoHash: 'photo-1',
      labels: [
        { id: 'a', known: 'pes', target: 'chó', x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
      ],
    };

    expect(await putSession(original)).toBe(true);
    const newer = { ...original, createdAt: 2, labels: [...original.labels, {
      id: 'b', known: 'kočka', target: 'mèo', x: 0.3, y: 0.4, w: 0.1, h: 0.1,
    }] };
    expect(await putSession(newer)).toBe(true);

    expect(await updateSessionAudioHashes(original.id, { a: 'audio-hash' })).toBe(true);

    expect(await listSessions()).toEqual([
      expect.objectContaining({
        id: 'session-1',
        createdAt: 2,
        labels: newer.labels,
        audioHashes: { a: 'audio-hash' },
      }),
    ]);
  });
});
