# Offline-First Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform WordLink from server-dependent to fully offline-first, enabling users to learn without internet connection with automatic sync when online.

**Architecture:** IndexedDB for local storage, sync manager for background synchronization with delta-based conflict resolution, connection monitor for online/offline detection, modified useAppState to read/write from IndexedDB instead of direct API calls.

**Tech Stack:** IndexedDB (via idb library), TypeScript, Vitest, Next.js 15, React 19

---

## Phase 1: Foundation - IndexedDB Layer

### Task 1: Install dependencies and setup types

**Files:**
- Modify: `package.json`
- Create: `lib/db/indexed/types.ts`

**Step 1: Install idb library**

```bash
pnpm add idb
```

Expected: idb added to dependencies

**Step 2: Create TypeScript types for IndexedDB stores**

Create `lib/db/indexed/types.ts`:

```typescript
// IndexedDB types for offline-first storage

export interface WordRecord {
  id: string;
  cz: string;
  en: string;
  vi: string;
  category: string[];
  czPron?: string;
  viPron?: string;
  czAudio?: string;
  viAudio?: string;
  czHint?: string;
  viHint?: string;
  version: number; // timestamp
}

export interface ProgressRecord {
  wordId: string;
  stageIndex: number;
  knownCount: number;
  unknownCount: number;
  lastKnownAt?: number;
  lastUnknownAt?: number;
  nextDueAt?: number;

  // Server state tracking (for delta-based merging)
  serverKnownCount: number;
  serverUnknownCount: number;
  serverStageIndex: number;
  serverVersion: number;

  // Sync state
  isDirty: boolean;
  localVersion: number;
}

export interface MetadataRecord {
  key: string;
  userId?: string;
  role?: 'cz' | 'vi';
  showEnglish?: boolean;
  showCategoryBadges?: boolean;
  userRole?: 'user' | 'editor';
  walletAddress?: string;

  // Server state tracking
  serverVersion?: number;
  isDirty?: boolean;

  // For arbitrary metadata
  value?: any;
}

export interface MemoryHookRecord {
  wordId: string;
  text: string;
  updatedAt: number;

  // Server state tracking
  serverText: string;
  serverUpdatedAt: number;
  serverVersion: number;
  isDirty: boolean;
}

export interface CategoryFilterRecord {
  category: string;
  isDirty: boolean;
}

export interface SyncQueueRecord {
  id: string;
  type: 'progress' | 'hook' | 'filter' | 'preference';
  payload: any;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

// Database schema
export interface WordLinkDB {
  words: {
    key: string;
    value: WordRecord;
    indexes: { category: string };
  };
  user_progress: {
    key: string;
    value: ProgressRecord;
  };
  user_metadata: {
    key: string;
    value: MetadataRecord;
  };
  memory_hooks: {
    key: string;
    value: MemoryHookRecord;
  };
  category_filters: {
    key: string;
    value: CategoryFilterRecord;
  };
  sync_queue: {
    key: string;
    value: SyncQueueRecord;
    indexes: { timestamp: number };
  };
  metadata: {
    key: string;
    value: MetadataRecord;
  };
}
```

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml lib/db/indexed/types.ts
git commit -m "feat: add idb library and IndexedDB type definitions

- Install idb for Promise-based IndexedDB wrapper
- Define TypeScript types for all object stores
- Include server state tracking for delta-based sync

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Create IndexedDB connection and schema

**Files:**
- Create: `lib/db/indexed/connection.ts`
- Create: `lib/db/indexed/__tests__/connection.test.ts`

**Step 1: Write the failing test**

Create `lib/db/indexed/__tests__/connection.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openWordLinkDB, closeWordLinkDB, deleteWordLinkDB } from '../connection';

describe('IndexedDB Connection', () => {
  afterEach(async () => {
    await closeWordLinkDB();
    await deleteWordLinkDB();
  });

  it('should open database with correct version', async () => {
    const db = await openWordLinkDB();
    expect(db.version).toBe(1);
    expect(db.name).toBe('wordlink-db');
  });

  it('should create all required object stores', async () => {
    const db = await openWordLinkDB();
    const storeNames = Array.from(db.objectStoreNames);

    expect(storeNames).toContain('words');
    expect(storeNames).toContain('user_progress');
    expect(storeNames).toContain('user_metadata');
    expect(storeNames).toContain('memory_hooks');
    expect(storeNames).toContain('category_filters');
    expect(storeNames).toContain('sync_queue');
    expect(storeNames).toContain('metadata');
  });

  it('should reuse existing connection when called multiple times', async () => {
    const db1 = await openWordLinkDB();
    const db2 = await openWordLinkDB();
    expect(db1).toBe(db2);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test lib/db/indexed/__tests__/connection.test.ts
```

Expected: FAIL - "Cannot find module '../connection'"

**Step 3: Write minimal implementation**

Create `lib/db/indexed/connection.ts`:

```typescript
import { openDB, IDBPDatabase, deleteDB } from 'idb';
import type { WordLinkDB } from './types';

const DB_NAME = 'wordlink-db';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<WordLinkDB> | null = null;

/**
 * Open (or create) the WordLink IndexedDB database
 * Reuses existing connection if already open
 */
export async function openWordLinkDB(): Promise<IDBPDatabase<WordLinkDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<WordLinkDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Create object stores on first run or version upgrade

      // 1. words - vocabulary data
      if (!db.objectStoreNames.contains('words')) {
        const wordsStore = db.createObjectStore('words', { keyPath: 'id' });
        wordsStore.createIndex('category', 'category', { multiEntry: true });
      }

      // 2. user_progress - spaced repetition state
      if (!db.objectStoreNames.contains('user_progress')) {
        db.createObjectStore('user_progress', { keyPath: 'wordId' });
      }

      // 3. user_metadata - user preferences
      if (!db.objectStoreNames.contains('user_metadata')) {
        db.createObjectStore('user_metadata', { keyPath: 'key' });
      }

      // 4. memory_hooks - custom notes
      if (!db.objectStoreNames.contains('memory_hooks')) {
        db.createObjectStore('memory_hooks', { keyPath: 'wordId' });
      }

      // 5. category_filters - selected categories
      if (!db.objectStoreNames.contains('category_filters')) {
        db.createObjectStore('category_filters', { keyPath: 'category' });
      }

      // 6. sync_queue - pending sync operations
      if (!db.objectStoreNames.contains('sync_queue')) {
        const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
        syncStore.createIndex('timestamp', 'timestamp');
      }

      // 7. metadata - app metadata (migration status, versions, etc.)
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    },
    blocked() {
      console.warn('IndexedDB upgrade blocked - close other tabs');
    },
    blocking() {
      console.warn('IndexedDB blocking other tabs');
      // Close the database to allow other tabs to upgrade
      if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
      }
    },
    terminated() {
      console.error('IndexedDB connection terminated unexpectedly');
      dbInstance = null;
    },
  });

  return dbInstance;
}

/**
 * Close the database connection
 */
export function closeWordLinkDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Delete the entire database (for testing or reset)
 */
export async function deleteWordLinkDB(): Promise<void> {
  closeWordLinkDB();
  await deleteDB(DB_NAME);
}

/**
 * Get the current database instance (if open)
 */
export function getWordLinkDB(): IDBPDatabase<WordLinkDB> | null {
  return dbInstance;
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test lib/db/indexed/__tests__/connection.test.ts
```

Expected: PASS - all 3 tests pass

**Step 5: Commit**

```bash
git add lib/db/indexed/connection.ts lib/db/indexed/__tests__/connection.test.ts
git commit -m "feat: add IndexedDB connection management

- Create openWordLinkDB with schema v1
- Define 7 object stores: words, progress, hooks, filters, queue, metadata
- Add connection reuse, close, and delete functions
- Include tests for connection lifecycle

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 3: Create words store operations

**Files:**
- Create: `lib/db/indexed/stores/words.ts`
- Create: `lib/db/indexed/stores/__tests__/words.test.ts`

**Step 1: Write the failing test**

Create `lib/db/indexed/stores/__tests__/words.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  putWord,
  getWord,
  getAllWords,
  getWordsByCategory,
  putManyWords,
  clearWords
} from '../words';
import { deleteWordLinkDB, closeWordLinkDB } from '../../connection';
import type { WordRecord } from '../../types';

describe('Words Store', () => {
  afterEach(async () => {
    await closeWordLinkDB();
    await deleteWordLinkDB();
  });

  const sampleWord: WordRecord = {
    id: 'w000',
    cz: 'ahoj',
    en: 'hello',
    vi: 'xin chào',
    category: ['basic', 'greeting'],
    czPron: 'ahoy',
    viPron: 'sin chao',
    version: Date.now(),
  };

  it('should put and get a word', async () => {
    await putWord(sampleWord);
    const retrieved = await getWord('w000');
    expect(retrieved).toEqual(sampleWord);
  });

  it('should return undefined for non-existent word', async () => {
    const retrieved = await getWord('w999');
    expect(retrieved).toBeUndefined();
  });

  it('should get all words', async () => {
    await putWord(sampleWord);
    await putWord({ ...sampleWord, id: 'w001', cz: 'děkuji' });

    const all = await getAllWords();
    expect(all).toHaveLength(2);
    expect(all.map(w => w.id)).toContain('w000');
    expect(all.map(w => w.id)).toContain('w001');
  });

  it('should get words by category', async () => {
    await putWord(sampleWord);
    await putWord({ ...sampleWord, id: 'w001', category: ['food'] });

    const greetings = await getWordsByCategory('greeting');
    expect(greetings).toHaveLength(1);
    expect(greetings[0].id).toBe('w000');
  });

  it('should put many words at once', async () => {
    const words: WordRecord[] = [
      { ...sampleWord, id: 'w000' },
      { ...sampleWord, id: 'w001' },
      { ...sampleWord, id: 'w002' },
    ];

    await putManyWords(words);
    const all = await getAllWords();
    expect(all).toHaveLength(3);
  });

  it('should clear all words', async () => {
    await putWord(sampleWord);
    await clearWords();
    const all = await getAllWords();
    expect(all).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test lib/db/indexed/stores/__tests__/words.test.ts
```

Expected: FAIL - "Cannot find module '../words'"

**Step 3: Write minimal implementation**

Create `lib/db/indexed/stores/words.ts`:

```typescript
import { openWordLinkDB } from '../connection';
import type { WordRecord } from '../types';

/**
 * Store a single word
 */
export async function putWord(word: WordRecord): Promise<void> {
  const db = await openWordLinkDB();
  await db.put('words', word);
}

/**
 * Store multiple words (bulk operation)
 */
export async function putManyWords(words: WordRecord[]): Promise<void> {
  const db = await openWordLinkDB();
  const tx = db.transaction('words', 'readwrite');
  await Promise.all(words.map(word => tx.store.put(word)));
  await tx.done;
}

/**
 * Get a word by ID
 */
export async function getWord(id: string): Promise<WordRecord | undefined> {
  const db = await openWordLinkDB();
  return db.get('words', id);
}

/**
 * Get all words
 */
export async function getAllWords(): Promise<WordRecord[]> {
  const db = await openWordLinkDB();
  return db.getAll('words');
}

/**
 * Get words by category (uses multiEntry index)
 */
export async function getWordsByCategory(category: string): Promise<WordRecord[]> {
  const db = await openWordLinkDB();
  return db.getAllFromIndex('words', 'category', category);
}

/**
 * Clear all words (for testing or reset)
 */
export async function clearWords(): Promise<void> {
  const db = await openWordLinkDB();
  await db.clear('words');
}

/**
 * Get vocabulary version metadata
 */
export async function getVocabVersion(): Promise<number | undefined> {
  const db = await openWordLinkDB();
  const meta = await db.get('metadata', 'vocabVersion');
  return meta?.value;
}

/**
 * Set vocabulary version metadata
 */
export async function setVocabVersion(version: number): Promise<void> {
  const db = await openWordLinkDB();
  await db.put('metadata', { key: 'vocabVersion', value: version });
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test lib/db/indexed/stores/__tests__/words.test.ts
```

Expected: PASS - all 6 tests pass

**Step 5: Commit**

```bash
git add lib/db/indexed/stores/words.ts lib/db/indexed/stores/__tests__/words.test.ts
git commit -m "feat: add words store CRUD operations

- Implement put, get, getAll, getByCategory
- Add bulk putMany for efficient initial load
- Include vocabulary version tracking
- Full test coverage for words store

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 4: Create progress store operations

**Files:**
- Create: `lib/db/indexed/stores/progress.ts`
- Create: `lib/db/indexed/stores/__tests__/progress.test.ts`

**Step 1: Write the failing test**

Create `lib/db/indexed/stores/__tests__/progress.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import {
  putProgress,
  getProgress,
  getAllProgress,
  getDirtyProgress,
  markProgressClean,
  clearProgress,
} from '../progress';
import { deleteWordLinkDB, closeWordLinkDB } from '../../connection';
import type { ProgressRecord } from '../../types';

describe('Progress Store', () => {
  afterEach(async () => {
    await closeWordLinkDB();
    await deleteWordLinkDB();
  });

  const sampleProgress: ProgressRecord = {
    wordId: 'w000',
    stageIndex: 2,
    knownCount: 5,
    unknownCount: 1,
    lastKnownAt: Date.now(),
    nextDueAt: Date.now() + 86400000,
    serverKnownCount: 3,
    serverUnknownCount: 0,
    serverStageIndex: 1,
    serverVersion: 10,
    isDirty: true,
    localVersion: 1,
  };

  it('should put and get progress', async () => {
    await putProgress(sampleProgress);
    const retrieved = await getProgress('w000');
    expect(retrieved).toEqual(sampleProgress);
  });

  it('should get all progress records', async () => {
    await putProgress(sampleProgress);
    await putProgress({ ...sampleProgress, wordId: 'w001' });

    const all = await getAllProgress();
    expect(all).toHaveLength(2);
  });

  it('should get only dirty progress records', async () => {
    await putProgress(sampleProgress); // dirty
    await putProgress({ ...sampleProgress, wordId: 'w001', isDirty: false });

    const dirty = await getDirtyProgress();
    expect(dirty).toHaveLength(1);
    expect(dirty[0].wordId).toBe('w000');
  });

  it('should mark progress as clean', async () => {
    await putProgress(sampleProgress);
    await markProgressClean('w000');

    const retrieved = await getProgress('w000');
    expect(retrieved?.isDirty).toBe(false);
  });

  it('should clear all progress', async () => {
    await putProgress(sampleProgress);
    await clearProgress();

    const all = await getAllProgress();
    expect(all).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test lib/db/indexed/stores/__tests__/progress.test.ts
```

Expected: FAIL - "Cannot find module '../progress'"

**Step 3: Write minimal implementation**

Create `lib/db/indexed/stores/progress.ts`:

```typescript
import { openWordLinkDB } from '../connection';
import type { ProgressRecord } from '../types';

/**
 * Store progress for a word
 */
export async function putProgress(progress: ProgressRecord): Promise<void> {
  const db = await openWordLinkDB();
  await db.put('user_progress', progress);
}

/**
 * Get progress for a word
 */
export async function getProgress(wordId: string): Promise<ProgressRecord | undefined> {
  const db = await openWordLinkDB();
  return db.get('user_progress', wordId);
}

/**
 * Get all progress records
 */
export async function getAllProgress(): Promise<ProgressRecord[]> {
  const db = await openWordLinkDB();
  return db.getAll('user_progress');
}

/**
 * Get all dirty (needs sync) progress records
 */
export async function getDirtyProgress(): Promise<ProgressRecord[]> {
  const db = await openWordLinkDB();
  const all = await db.getAll('user_progress');
  return all.filter(p => p.isDirty);
}

/**
 * Mark progress as clean (synced)
 */
export async function markProgressClean(wordId: string): Promise<void> {
  const db = await openWordLinkDB();
  const progress = await db.get('user_progress', wordId);
  if (progress) {
    progress.isDirty = false;
    await db.put('user_progress', progress);
  }
}

/**
 * Clear all progress (for testing or reset)
 */
export async function clearProgress(): Promise<void> {
  const db = await openWordLinkDB();
  await db.clear('user_progress');
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test lib/db/indexed/stores/__tests__/progress.test.ts
```

Expected: PASS - all 5 tests pass

**Step 5: Commit**

```bash
git add lib/db/indexed/stores/progress.ts lib/db/indexed/stores/__tests__/progress.test.ts
git commit -m "feat: add progress store operations

- Implement put, get, getAll for user progress
- Add getDirtyProgress for sync operations
- Include markProgressClean for post-sync cleanup
- Full test coverage

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 5: Create memory hooks, filters, and metadata store operations

**Files:**
- Create: `lib/db/indexed/stores/hooks.ts`
- Create: `lib/db/indexed/stores/filters.ts`
- Create: `lib/db/indexed/stores/metadata.ts`
- Create: `lib/db/indexed/stores/__tests__/hooks.test.ts`
- Create: `lib/db/indexed/stores/__tests__/filters.test.ts`
- Create: `lib/db/indexed/stores/__tests__/metadata.test.ts`

**Step 1: Write the failing tests**

Create `lib/db/indexed/stores/__tests__/hooks.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { putHook, getHook, getAllHooks, getDirtyHooks, clearHooks } from '../hooks';
import { deleteWordLinkDB, closeWordLinkDB } from '../../connection';
import type { MemoryHookRecord } from '../../types';

describe('Memory Hooks Store', () => {
  afterEach(async () => {
    await closeWordLinkDB();
    await deleteWordLinkDB();
  });

  const sampleHook: MemoryHookRecord = {
    wordId: 'w000',
    text: 'Remember: ahoj sounds like "ahoy"',
    updatedAt: Date.now(),
    serverText: '',
    serverUpdatedAt: 0,
    serverVersion: 0,
    isDirty: true,
  };

  it('should put and get hook', async () => {
    await putHook(sampleHook);
    const retrieved = await getHook('w000');
    expect(retrieved).toEqual(sampleHook);
  });

  it('should get all hooks', async () => {
    await putHook(sampleHook);
    const all = await getAllHooks();
    expect(all).toHaveLength(1);
  });

  it('should get dirty hooks', async () => {
    await putHook(sampleHook);
    await putHook({ ...sampleHook, wordId: 'w001', isDirty: false });

    const dirty = await getDirtyHooks();
    expect(dirty).toHaveLength(1);
    expect(dirty[0].wordId).toBe('w000');
  });
});
```

Create `lib/db/indexed/stores/__tests__/filters.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import {
  putFilter,
  getFilter,
  getAllFilters,
  removeFilter,
  clearFilters
} from '../filters';
import { deleteWordLinkDB, closeWordLinkDB } from '../../connection';

describe('Category Filters Store', () => {
  afterEach(async () => {
    await closeWordLinkDB();
    await deleteWordLinkDB();
  });

  it('should put and get filter', async () => {
    await putFilter('basic');
    const retrieved = await getFilter('basic');
    expect(retrieved?.category).toBe('basic');
  });

  it('should get all filters', async () => {
    await putFilter('basic');
    await putFilter('food');

    const all = await getAllFilters();
    expect(all.map(f => f.category)).toContain('basic');
    expect(all.map(f => f.category)).toContain('food');
  });

  it('should remove filter', async () => {
    await putFilter('basic');
    await removeFilter('basic');

    const retrieved = await getFilter('basic');
    expect(retrieved).toBeUndefined();
  });
});
```

Create `lib/db/indexed/stores/__tests__/metadata.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import {
  putMetadata,
  getMetadata,
  getPreferences,
  putPreferences
} from '../metadata';
import { deleteWordLinkDB, closeWordLinkDB } from '../../connection';

describe('Metadata Store', () => {
  afterEach(async () => {
    await closeWordLinkDB();
    await deleteWordLinkDB();
  });

  it('should put and get metadata', async () => {
    await putMetadata({ key: 'migrated', value: true });
    const retrieved = await getMetadata('migrated');
    expect(retrieved?.value).toBe(true);
  });

  it('should put and get preferences', async () => {
    await putPreferences({
      key: 'preferences',
      role: 'vi',
      showEnglish: true,
      showCategoryBadges: false,
      userRole: 'user',
      isDirty: false,
      serverVersion: 1,
    });

    const prefs = await getPreferences();
    expect(prefs?.role).toBe('vi');
    expect(prefs?.showEnglish).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test lib/db/indexed/stores/__tests__/hooks.test.ts
pnpm test lib/db/indexed/stores/__tests__/filters.test.ts
pnpm test lib/db/indexed/stores/__tests__/metadata.test.ts
```

Expected: FAIL - "Cannot find module"

**Step 3: Write minimal implementations**

Create `lib/db/indexed/stores/hooks.ts`:

```typescript
import { openWordLinkDB } from '../connection';
import type { MemoryHookRecord } from '../types';

export async function putHook(hook: MemoryHookRecord): Promise<void> {
  const db = await openWordLinkDB();
  await db.put('memory_hooks', hook);
}

export async function getHook(wordId: string): Promise<MemoryHookRecord | undefined> {
  const db = await openWordLinkDB();
  return db.get('memory_hooks', wordId);
}

export async function getAllHooks(): Promise<MemoryHookRecord[]> {
  const db = await openWordLinkDB();
  return db.getAll('memory_hooks');
}

export async function getDirtyHooks(): Promise<MemoryHookRecord[]> {
  const db = await openWordLinkDB();
  const all = await db.getAll('memory_hooks');
  return all.filter(h => h.isDirty);
}

export async function clearHooks(): Promise<void> {
  const db = await openWordLinkDB();
  await db.clear('memory_hooks');
}
```

Create `lib/db/indexed/stores/filters.ts`:

```typescript
import { openWordLinkDB } from '../connection';
import type { CategoryFilterRecord } from '../types';

export async function putFilter(category: string): Promise<void> {
  const db = await openWordLinkDB();
  await db.put('category_filters', { category, isDirty: true });
}

export async function getFilter(category: string): Promise<CategoryFilterRecord | undefined> {
  const db = await openWordLinkDB();
  return db.get('category_filters', category);
}

export async function getAllFilters(): Promise<CategoryFilterRecord[]> {
  const db = await openWordLinkDB();
  return db.getAll('category_filters');
}

export async function removeFilter(category: string): Promise<void> {
  const db = await openWordLinkDB();
  await db.delete('category_filters', category);
}

export async function clearFilters(): Promise<void> {
  const db = await openWordLinkDB();
  await db.clear('category_filters');
}
```

Create `lib/db/indexed/stores/metadata.ts`:

```typescript
import { openWordLinkDB } from '../connection';
import type { MetadataRecord } from '../types';

export async function putMetadata(metadata: MetadataRecord): Promise<void> {
  const db = await openWordLinkDB();
  await db.put('user_metadata', metadata);
}

export async function getMetadata(key: string): Promise<MetadataRecord | undefined> {
  const db = await openWordLinkDB();
  return db.get('user_metadata', key);
}

export async function getPreferences(): Promise<MetadataRecord | undefined> {
  return getMetadata('preferences');
}

export async function putPreferences(prefs: MetadataRecord): Promise<void> {
  await putMetadata({ ...prefs, key: 'preferences' });
}

export async function clearMetadata(): Promise<void> {
  const db = await openWordLinkDB();
  await db.clear('user_metadata');
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test lib/db/indexed/stores/__tests__/
```

Expected: PASS - all tests pass

**Step 5: Commit**

```bash
git add lib/db/indexed/stores/*.ts lib/db/indexed/stores/__tests__/*.ts
git commit -m "feat: add hooks, filters, and metadata store operations

- Memory hooks: put, get, getAll, getDirty
- Category filters: put, get, getAll, remove
- User metadata: preferences storage and retrieval
- Full test coverage for all stores

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 6: Create sync queue operations

**Files:**
- Create: `lib/db/indexed/stores/sync-queue.ts`
- Create: `lib/db/indexed/stores/__tests__/sync-queue.test.ts`

**Step 1: Write the failing test**

Create `lib/db/indexed/stores/__tests__/sync-queue.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import {
  addToSyncQueue,
  getOldestSyncItem,
  removeSyncItem,
  clearSyncQueue,
  getSyncQueueCount,
} from '../sync-queue';
import { deleteWordLinkDB, closeWordLinkDB } from '../../connection';

describe('Sync Queue Store', () => {
  afterEach(async () => {
    await closeWordLinkDB();
    await deleteWordLinkDB();
  });

  it('should add and retrieve sync item', async () => {
    const id = await addToSyncQueue({
      type: 'progress',
      payload: { wordId: 'w000', stageIndex: 2 },
    });

    const item = await getOldestSyncItem();
    expect(item?.id).toBe(id);
    expect(item?.type).toBe('progress');
  });

  it('should get oldest item first (FIFO)', async () => {
    await addToSyncQueue({ type: 'progress', payload: { test: 1 } });
    await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
    await addToSyncQueue({ type: 'hook', payload: { test: 2 } });

    const oldest = await getOldestSyncItem();
    expect(oldest?.type).toBe('progress');
  });

  it('should remove sync item', async () => {
    const id = await addToSyncQueue({ type: 'progress', payload: {} });
    await removeSyncItem(id);

    const count = await getSyncQueueCount();
    expect(count).toBe(0);
  });

  it('should get sync queue count', async () => {
    await addToSyncQueue({ type: 'progress', payload: {} });
    await addToSyncQueue({ type: 'hook', payload: {} });

    const count = await getSyncQueueCount();
    expect(count).toBe(2);
  });

  it('should clear sync queue', async () => {
    await addToSyncQueue({ type: 'progress', payload: {} });
    await clearSyncQueue();

    const count = await getSyncQueueCount();
    expect(count).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test lib/db/indexed/stores/__tests__/sync-queue.test.ts
```

Expected: FAIL - "Cannot find module '../sync-queue'"

**Step 3: Write minimal implementation**

Create `lib/db/indexed/stores/sync-queue.ts`:

```typescript
import { openWordLinkDB } from '../connection';
import type { SyncQueueRecord } from '../types';

/**
 * Add an item to the sync queue
 * Returns the generated ID
 */
export async function addToSyncQueue(
  item: Omit<SyncQueueRecord, 'id' | 'timestamp' | 'retryCount'>
): Promise<string> {
  const db = await openWordLinkDB();
  const id = crypto.randomUUID();
  const record: SyncQueueRecord = {
    id,
    timestamp: Date.now(),
    retryCount: 0,
    ...item,
  };
  await db.put('sync_queue', record);
  return id;
}

/**
 * Get the oldest item from sync queue (FIFO)
 */
export async function getOldestSyncItem(): Promise<SyncQueueRecord | undefined> {
  const db = await openWordLinkDB();
  const tx = db.transaction('sync_queue', 'readonly');
  const index = tx.store.index('timestamp');
  const cursor = await index.openCursor();
  return cursor?.value;
}

/**
 * Get all sync queue items
 */
export async function getAllSyncItems(): Promise<SyncQueueRecord[]> {
  const db = await openWordLinkDB();
  return db.getAll('sync_queue');
}

/**
 * Remove an item from sync queue
 */
export async function removeSyncItem(id: string): Promise<void> {
  const db = await openWordLinkDB();
  await db.delete('sync_queue', id);
}

/**
 * Update retry count for a sync item
 */
export async function incrementRetryCount(id: string, error?: string): Promise<void> {
  const db = await openWordLinkDB();
  const item = await db.get('sync_queue', id);
  if (item) {
    item.retryCount++;
    if (error) {
      item.lastError = error;
    }
    await db.put('sync_queue', item);
  }
}

/**
 * Get count of items in sync queue
 */
export async function getSyncQueueCount(): Promise<number> {
  const db = await openWordLinkDB();
  return db.count('sync_queue');
}

/**
 * Clear all items from sync queue
 */
export async function clearSyncQueue(): Promise<void> {
  const db = await openWordLinkDB();
  await db.clear('sync_queue');
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test lib/db/indexed/stores/__tests__/sync-queue.test.ts
```

Expected: PASS - all 5 tests pass

**Step 5: Commit**

```bash
git add lib/db/indexed/stores/sync-queue.ts lib/db/indexed/stores/__tests__/sync-queue.test.ts
git commit -m "feat: add sync queue operations

- FIFO queue for pending sync operations
- Add, get oldest, remove operations
- Retry count tracking with error messages
- Full test coverage

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 7: Create IndexedDB index file

**Files:**
- Create: `lib/db/indexed/index.ts`

**Step 1: Create barrel export**

Create `lib/db/indexed/index.ts`:

```typescript
// IndexedDB connection
export * from './connection';

// TypeScript types
export * from './types';

// Store operations
export * from './stores/words';
export * from './stores/progress';
export * from './stores/hooks';
export * from './stores/filters';
export * from './stores/metadata';
export * from './stores/sync-queue';
```

**Step 2: Verify imports work**

```bash
pnpm test lib/db/indexed/
```

Expected: All tests still pass

**Step 3: Commit**

```bash
git add lib/db/indexed/index.ts
git commit -m "feat: add IndexedDB barrel export

- Single entry point for all IndexedDB operations
- Exports connection, types, and all store operations

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: Sync Infrastructure

### Task 8: Create connection monitor

**Files:**
- Create: `lib/connection-monitor.ts`
- Create: `lib/__tests__/connection-monitor.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/connection-monitor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionMonitor } from '../connection-monitor';

describe('ConnectionMonitor', () => {
  let monitor: ConnectionMonitor;

  beforeEach(() => {
    // Mock navigator.onLine
    vi.stubGlobal('navigator', { onLine: true });

    // Mock fetch for connectivity check
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    monitor?.destroy();
    vi.restoreAllMocks();
  });

  it('should initialize with current online status', () => {
    monitor = new ConnectionMonitor();
    expect(monitor.isOnline()).toBe(true);
  });

  it('should notify subscribers of status changes', async () => {
    monitor = new ConnectionMonitor();
    const callback = vi.fn();

    monitor.subscribe(callback);

    // Simulate going offline
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    window.dispatchEvent(new Event('offline'));

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(callback).toHaveBeenCalledWith(false);
  });

  it('should allow unsubscribe', () => {
    monitor = new ConnectionMonitor();
    const callback = vi.fn();

    const unsubscribe = monitor.subscribe(callback);
    unsubscribe();

    // Simulate status change
    window.dispatchEvent(new Event('offline'));

    expect(callback).toHaveBeenCalledTimes(1); // Only initial call
  });

  it('should verify connectivity with API ping', async () => {
    monitor = new ConnectionMonitor();

    // Wait for initial ping
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ method: 'HEAD' })
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test lib/__tests__/connection-monitor.test.ts
```

Expected: FAIL - "Cannot find module '../connection-monitor'"

**Step 3: Write minimal implementation**

Create `lib/connection-monitor.ts`:

```typescript
/**
 * Monitors online/offline connectivity with actual server verification
 */
export class ConnectionMonitor {
  private online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private listeners = new Set<(online: boolean) => void>();
  private pingTimeoutId?: ReturnType<typeof setTimeout>;
  private backoffMs = 5000;
  private readonly maxBackoffMs = 60000;
  private destroyed = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);

      // Verify actual connectivity on init if browser says we're online
      if (this.online) {
        this.verifyConnectivity();
      }
    }
  }

  private handleOnline = (): void => {
    this.verifyConnectivity();
  };

  private handleOffline = (): void => {
    this.setOnline(false);
  };

  private async verifyConnectivity(): Promise<void> {
    if (this.destroyed) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.setOnline(true);
      this.backoffMs = 5000; // Reset backoff on success
    } catch (error) {
      this.setOnline(false);

      // Retry with exponential backoff
      this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
      this.pingTimeoutId = setTimeout(() => {
        this.verifyConnectivity();
      }, this.backoffMs);
    }
  }

  private setOnline(online: boolean): void {
    if (this.online !== online) {
      this.online = online;
      this.listeners.forEach(listener => listener(online));
    }
  }

  /**
   * Subscribe to online/offline status changes
   * Returns unsubscribe function
   */
  subscribe(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);
    // Immediately notify with current status
    callback(this.online);
    return () => this.listeners.delete(callback);
  }

  /**
   * Get current online status
   */
  isOnline(): boolean {
    return this.online;
  }

  /**
   * Force a connectivity check
   */
  checkNow(): void {
    this.verifyConnectivity();
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    this.destroyed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    if (this.pingTimeoutId) {
      clearTimeout(this.pingTimeoutId);
    }
    this.listeners.clear();
  }
}

// Singleton instance
let connectionMonitorInstance: ConnectionMonitor | null = null;

export function getConnectionMonitor(): ConnectionMonitor {
  if (!connectionMonitorInstance) {
    connectionMonitorInstance = new ConnectionMonitor();
  }
  return connectionMonitorInstance;
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test lib/__tests__/connection-monitor.test.ts
```

Expected: PASS - all tests pass

**Step 5: Commit**

```bash
git add lib/connection-monitor.ts lib/__tests__/connection-monitor.test.ts
git commit -m "feat: add connection monitor for online/offline detection

- Monitors navigator.onLine and window events
- Verifies actual connectivity with API health check
- Exponential backoff for retry attempts
- Singleton pattern with subscribe/unsubscribe
- Full test coverage

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 9: Create conflict resolution utilities

**Files:**
- Create: `lib/conflict-resolution.ts`
- Create: `lib/__tests__/conflict-resolution.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/conflict-resolution.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mergeProgress, mergeHook } from '../conflict-resolution';
import type { ProgressRecord, MemoryHookRecord } from '@/lib/db/indexed/types';

describe('Conflict Resolution', () => {
  describe('mergeProgress', () => {
    const baseLocal: ProgressRecord = {
      wordId: 'w000',
      stageIndex: 2,
      knownCount: 8,
      unknownCount: 1,
      lastKnownAt: 1000,
      nextDueAt: 2000,
      serverKnownCount: 5,
      serverUnknownCount: 0,
      serverStageIndex: 1,
      serverVersion: 10,
      isDirty: true,
      localVersion: 1,
    };

    const baseServer = {
      stageIndex: 2,
      knownCount: 7,
      unknownCount: 0,
      lastKnownAt: 900,
      nextDueAt: 1900,
      version: 11,
    };

    it('should use local when no server changes', () => {
      const result = mergeProgress(baseLocal, { ...baseServer, version: 10 });
      expect(result.knownCount).toBe(8);
      expect(result.isDirty).toBe(false);
    });

    it('should use server when no local changes', () => {
      const local = { ...baseLocal, knownCount: 5, stageIndex: 1 };
      const result = mergeProgress(local, baseServer);
      expect(result.knownCount).toBe(7);
      expect(result.stageIndex).toBe(2);
    });

    it('should merge deltas when both changed', () => {
      // Local: 5 → 8 (delta +3)
      // Server: 5 → 7 (delta +2)
      // Result: 7 + 3 = 10
      const result = mergeProgress(baseLocal, baseServer);
      expect(result.knownCount).toBe(10);
    });

    it('should take highest stage on conflict', () => {
      const local = { ...baseLocal, stageIndex: 5, serverStageIndex: 2 };
      const server = { ...baseServer, stageIndex: 3 };
      const result = mergeProgress(local, server);
      expect(result.stageIndex).toBe(5);
    });

    it('should use latest timestamp', () => {
      const result = mergeProgress(baseLocal, baseServer);
      expect(result.lastKnownAt).toBe(1000); // local is newer
    });
  });

  describe('mergeHook', () => {
    const localHook: MemoryHookRecord = {
      wordId: 'w000',
      text: 'Local note',
      updatedAt: 2000,
      serverText: 'Old note',
      serverUpdatedAt: 1000,
      serverVersion: 5,
      isDirty: true,
    };

    const serverHook = {
      text: 'Server note',
      updatedAt: 1500,
      version: 6,
    };

    it('should use local when newer', () => {
      const result = mergeHook(localHook, serverHook);
      expect(result.text).toBe('Local note');
      expect(result.updatedAt).toBe(2000);
    });

    it('should use server when newer', () => {
      const local = { ...localHook, updatedAt: 1000 };
      const result = mergeHook(local, { ...serverHook, updatedAt: 2000 });
      expect(result.text).toBe('Server note');
      expect(result.updatedAt).toBe(2000);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test lib/__tests__/conflict-resolution.test.ts
```

Expected: FAIL - "Cannot find module '../conflict-resolution'"

**Step 3: Write minimal implementation**

Create `lib/conflict-resolution.ts`:

```typescript
import type { ProgressRecord, MemoryHookRecord } from '@/lib/db/indexed/types';
import { STAGES } from './words';

type ServerProgress = {
  stageIndex: number;
  knownCount: number;
  unknownCount: number;
  lastKnownAt?: number | null;
  lastUnknownAt?: number | null;
  nextDueAt?: number | null;
  version: number;
};

type ServerHook = {
  text: string;
  updatedAt: number;
  version: number;
};

/**
 * Merge local and server progress using delta-based conflict resolution
 *
 * Strategy:
 * - No local changes: server wins
 * - No server changes: local wins
 * - Both changed: merge deltas, highest stage wins
 */
export function mergeProgress(
  local: ProgressRecord,
  server: ServerProgress
): ProgressRecord {
  // Check if local has been modified since last sync
  const localModified =
    local.stageIndex !== local.serverStageIndex ||
    local.knownCount !== local.serverKnownCount ||
    local.unknownCount !== local.serverUnknownCount;

  // No local changes - server wins
  if (!localModified) {
    return {
      ...local,
      stageIndex: server.stageIndex,
      knownCount: server.knownCount,
      unknownCount: server.unknownCount,
      lastKnownAt: server.lastKnownAt ?? undefined,
      lastUnknownAt: server.lastUnknownAt ?? undefined,
      nextDueAt: server.nextDueAt ?? undefined,
      serverKnownCount: server.knownCount,
      serverUnknownCount: server.unknownCount,
      serverStageIndex: server.stageIndex,
      serverVersion: server.version,
      isDirty: false,
    };
  }

  // No server changes since last sync - local wins
  if (local.serverVersion === server.version) {
    return {
      ...local,
      isDirty: false, // Will be synced
    };
  }

  // True conflict - both changed offline
  // Calculate deltas and merge
  const localKnownDelta = local.knownCount - local.serverKnownCount;
  const localUnknownDelta = local.unknownCount - local.serverUnknownCount;

  const mergedKnownCount = server.knownCount + localKnownDelta;
  const mergedUnknownCount = server.unknownCount + localUnknownDelta;
  const mergedStageIndex = Math.max(local.stageIndex, server.stageIndex);

  // Use latest timestamps
  const mergedLastKnownAt = Math.max(
    local.lastKnownAt ?? 0,
    server.lastKnownAt ?? 0
  );
  const mergedLastUnknownAt = Math.max(
    local.lastUnknownAt ?? 0,
    server.lastUnknownAt ?? 0
  );

  // Recalculate nextDueAt based on merged stage
  const stage = STAGES[mergedStageIndex];
  const mergedNextDueAt =
    stage.intervalMs > 0
      ? mergedLastKnownAt + stage.intervalMs
      : undefined;

  return {
    wordId: local.wordId,
    stageIndex: mergedStageIndex,
    knownCount: mergedKnownCount,
    unknownCount: mergedUnknownCount,
    lastKnownAt: mergedLastKnownAt || undefined,
    lastUnknownAt: mergedLastUnknownAt || undefined,
    nextDueAt: mergedNextDueAt,
    serverKnownCount: mergedKnownCount,
    serverUnknownCount: mergedUnknownCount,
    serverStageIndex: mergedStageIndex,
    serverVersion: server.version,
    isDirty: false,
    localVersion: local.localVersion + 1,
  };
}

/**
 * Merge memory hook using last-write-wins strategy
 */
export function mergeHook(
  local: MemoryHookRecord,
  server: ServerHook
): MemoryHookRecord {
  // Last-write-wins by timestamp
  const useLocal = local.updatedAt > server.updatedAt;

  if (useLocal) {
    return {
      ...local,
      serverText: server.text,
      serverUpdatedAt: server.updatedAt,
      serverVersion: server.version,
      // Keep isDirty true if local is newer (needs to sync)
    };
  } else {
    return {
      wordId: local.wordId,
      text: server.text,
      updatedAt: server.updatedAt,
      serverText: server.text,
      serverUpdatedAt: server.updatedAt,
      serverVersion: server.version,
      isDirty: false,
    };
  }
}

/**
 * Merge category filters using union strategy
 */
export function mergeFilters(
  local: string[],
  server: string[]
): string[] {
  return Array.from(new Set([...local, ...server]));
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test lib/__tests__/conflict-resolution.test.ts
```

Expected: PASS - all tests pass

**Step 5: Commit**

```bash
git add lib/conflict-resolution.ts lib/__tests__/conflict-resolution.test.ts
git commit -m "feat: add conflict resolution utilities

- Delta-based progress merging (highest stage + summed counters)
- Last-write-wins for memory hooks
- Union strategy for category filters
- Full test coverage for all scenarios

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: Integration

Due to the length of the plan, the remaining tasks are summarized:

### Task 10: Create health check API endpoint
- Create `/app/api/health/route.ts`
- Simple HEAD endpoint that returns 200
- Used by connection monitor

### Task 11: Modify sync API to support versions
- Update `/app/api/sync/route.ts` POST handler
- Add version tracking to responses
- Keep backward compatibility

### Task 12: Add vocabulary metadata endpoint
- Create `/app/api/words/metadata/route.ts`
- Returns version, wordCount, lastUpdated
- Used for vocabulary update checks

### Task 13: Create migration utility
- Create `lib/db/indexed/migration.ts`
- One-time migration from server to IndexedDB
- Marks migration complete in metadata

### Task 14: Create React hooks for IndexedDB
- Create `hooks/useOnlineStatus.ts`
- Create `hooks/useSyncStatus.ts`
- Wrap connection monitor in React hooks

### Task 15: Modify useAppState to use IndexedDB
- Update `hooks/useAppState.ts`
- Read from IndexedDB on mount
- Write to IndexedDB on change
- Trigger sync via sync manager

### Task 16: Create sync manager
- Create `lib/sync-manager.ts`
- Background sync orchestration
- Queue management with retry logic
- Conflict resolution integration

### Task 17: Add UI indicators
- Create `components/SyncStatusIndicator.tsx`
- Show online/offline status
- Show sync state (synced/syncing/error)
- Add to AppLayout

### Task 18: Integration testing
- Test full offline → online flow
- Test multi-device conflict scenarios
- Test vocabulary updates
- Test migration from current architecture

### Task 19: Documentation updates
- Update CLAUDE.md with offline-first architecture
- Add troubleshooting guide for IndexedDB issues
- Document migration process

---

## Testing Strategy

**Unit tests:** All store operations, conflict resolution, connection monitor
**Integration tests:** Full sync flows, migration, multi-tab scenarios
**Manual testing:** Offline learning, multi-device conflicts, vocabulary updates

## Success Criteria

- ✅ App loads instantly from IndexedDB (<500ms)
- ✅ All learning features work offline
- ✅ Automatic sync when back online
- ✅ Zero data loss in conflict scenarios
- ✅ Smooth migration for existing users

---

## Execution Notes

This plan uses TDD approach:
1. Write failing test first
2. Implement minimal code to pass
3. Commit frequently (after each passing test)
4. Keep functions small and focused

Estimated time: 2-3 days for phases 1-2, additional 2-3 days for phase 3 (integration and testing).
