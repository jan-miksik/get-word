import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

import {
  DB_NAME,
  DB_VERSION,
  OLDEST_SUPPORTED_DB_VERSION,
  migrationVersionsFrom,
  normalizeLegacyOutboxRecord,
  openDb,
  STORE_CONTENT,
  STORE_CATEGORY_FILTERS,
  STORE_KV,
  STORE_MEMORY_HOOKS,
  STORE_META,
  STORE_OUTBOX,
  STORE_PREFS,
  STORE_PROGRESS,
} from '../local-first/db';

const LEGACY_SNAPSHOT_KEY = 'learning-snapshot';

function waitForRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}

async function seedHistoricalDatabase(version: number): Promise<void> {
  const request = indexedDB.open(DB_NAME, version);
  request.onupgradeneeded = () => {
    const database = request.result;
    database.createObjectStore(STORE_KV);
    database.createObjectStore(STORE_OUTBOX);
    if (version >= 2) {
      database.createObjectStore(STORE_PROGRESS);
      database.createObjectStore(STORE_MEMORY_HOOKS);
      database.createObjectStore(STORE_CATEGORY_FILTERS);
      database.createObjectStore(STORE_PREFS);
      database.createObjectStore(STORE_META);
    }
  };
  const database = await waitForRequest(request);
  const stores = [STORE_KV, STORE_OUTBOX];
  if (version >= 2) stores.push(
    STORE_PROGRESS,
    STORE_MEMORY_HOOKS,
    STORE_CATEGORY_FILTERS,
    STORE_PREFS,
    STORE_META,
  );
  const transaction = database.transaction(stores, 'readwrite');
  transaction.objectStore(STORE_KV).put({
    savedAt: Date.parse('2026-01-01T00:00:00.000Z'),
    activeListId: 'list-1',
    data: {
      user: { id: 'user-1', settings_language: 'cs' },
      progress: [{ wordId: 'word-1', stageIndex: 2 }],
      word_list_items: [{ id: 'item-1' }],
      categories: { category: { name: 'Category', position: 0 } },
      lists: [{ id: 'list-1', name: 'List' }],
      sync_revision: 17,
    },
  }, LEGACY_SNAPSHOT_KEY);
  transaction.objectStore(STORE_OUTBOX).put({
    clientOpId: 'legacy-op',
    entity: 'game_score',
    opType: 'max',
    payload: { score: 8 },
    attempts: 0,
    ...(version >= 3 ? { status: 'pending' } : {}),
  }, 'legacy-op');
  if (version >= 2) {
    const domainRow = (value: unknown) => ({
      schemaVersion: version >= 3 ? 3 : 2,
      updatedAt: '2026-01-01T00:00:00.000Z',
      value,
    });
    transaction.objectStore(STORE_PREFS).put(
      domainRow({ id: 'user-1', settings_language: 'cs' }),
      'user',
    );
    transaction.objectStore(STORE_PROGRESS).put(
      domainRow({ wordId: 'word-1', stageIndex: 2 }),
      'word-1',
    );
  }
  await waitForTransaction(transaction);
  database.close();
}

async function readStoreValue<T>(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  const transaction = database.transaction(storeName, 'readonly');
  const value = await waitForRequest(transaction.objectStore(storeName).get(key));
  await waitForTransaction(transaction);
  return value as T | undefined;
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});

describe('IndexedDB direct migrations', () => {
  it('plans every required step from the oldest supported version to current', () => {
    expect(migrationVersionsFrom(OLDEST_SUPPORTED_DB_VERSION)).toEqual([2, 3, 4]);
  });

  it('plans a direct previous-to-current upgrade', () => {
    expect(migrationVersionsFrom(DB_VERSION - 1)).toEqual([DB_VERSION]);
    expect(migrationVersionsFrom(DB_VERSION)).toEqual([]);
  });

  it('normalizes pre-lifecycle outbox rows without discarding their payload', () => {
    const legacy = {
      clientOpId: 'op-1',
      entity: 'game_score',
      opType: 'max',
      payload: { score: 8 },
      attempts: 2,
    };
    expect(normalizeLegacyOutboxRecord(legacy)).toEqual({ ...legacy, status: 'pending' });
  });

  it('preserves an explicit blocked state and diagnostics', () => {
    const blocked = { status: 'blocked', diagnostic: { reasonCode: 'HTTP_403' } };
    expect(normalizeLegacyOutboxRecord(blocked)).toBe(blocked);
  });

  it.each([
    ['oldest', OLDEST_SUPPORTED_DB_VERSION],
    ['intermediate', 2],
    ['previous', DB_VERSION - 1],
  ] as const)('directly upgrades the %s supported database to current without deleting fallback data', async (_label, version) => {
    await seedHistoricalDatabase(version);

    const database = await openDb();

    expect(database?.version).toBe(DB_VERSION);
    expect(database && [...database.objectStoreNames]).toEqual(expect.arrayContaining([
      STORE_CONTENT,
      STORE_PREFS,
      STORE_PROGRESS,
      STORE_OUTBOX,
    ]));
    if (!database) throw new Error('Expected IndexedDB');
    expect(await readStoreValue(database, STORE_KV, LEGACY_SNAPSHOT_KEY)).toBeDefined();
    expect(await readStoreValue<{ value: { sync_revision: number } }>(
      database,
      STORE_CONTENT,
      'sync-content',
    )).toMatchObject({ value: { sync_revision: 17 } });
    expect(await readStoreValue<{ value: { id: string } }>(database, STORE_PREFS, 'user'))
      .toMatchObject({ value: { id: 'user-1' } });
    expect(await readStoreValue<{ status: string }>(database, STORE_OUTBOX, 'legacy-op'))
      .toMatchObject({ status: 'pending' });
    database.close();
  });
});
