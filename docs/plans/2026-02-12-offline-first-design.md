# Offline-First Architecture Design

**Date:** 2026-02-12
**Status:** Approved
**Author:** Design session with user

## Overview

Transform WordLink from server-dependent to fully offline-first architecture. Users can learn vocabulary, track progress, and manage memory hooks without internet connection. Changes sync automatically when connection is restored.

## Goals

- **Full offline functionality** - All core learning features work without internet
- **Automatic background sync** - Seamless sync when online, no manual intervention
- **Conflict resolution** - Smart merging when same word progressed on multiple devices offline
- **No data loss** - Progress preserved even with connectivity issues
- **Fast startup** - Instant load from local storage, no server wait

## Non-Goals

- **Offline wallet linking** - Requires server validation, remains online-only
- **Offline editor mode** - Word editing requires server security, remains online-only
- **Service Worker/PWA** - Future enhancement, not in initial implementation

## Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                     React App State                      │
│                    (useAppState hook)                    │
└─────────────────┬───────────────────────┬───────────────┘
                  │                       │
                  ↓                       ↓
         ┌────────────────┐      ┌──────────────┐
         │   IndexedDB    │      │   Online?    │
         │  (local store) │      │  Sync Queue  │
         └────────────────┘      └──────┬───────┘
                  ↑                      │
                  │                      ↓
                  │              ┌──────────────┐
                  └──────────────│ Supabase API │
                                 └──────────────┘
```

### Key Components

**1. IndexedDB Layer** (`lib/db/indexed.ts`)
- Single source of truth for client state
- Stores: progress, memory hooks, filters, preferences, vocabulary, sync queue
- Replaces direct API calls for reads
- Async operations, won't block UI

**2. Sync Manager** (`lib/sync-manager.ts`)
- Monitors online/offline status
- Queues changes while offline
- Auto-syncs when online with conflict resolution
- Handles retry logic with exponential backoff

**3. Connection Monitor** (`lib/connection-monitor.ts`)
- Detects online/offline transitions
- Validates actual connectivity (not just `navigator.onLine`)
- Notifies sync manager of status changes

**4. Modified useAppState** (`hooks/useAppState.ts`)
- Reads from IndexedDB instead of API
- Writes to IndexedDB immediately (optimistic)
- Notifies sync manager of changes
- No debouncing needed (sync manager handles it)

## IndexedDB Schema

**Database:** `wordlink-db` (version 1)

### Object Stores

#### 1. words - Vocabulary Data
```typescript
{
  keyPath: 'id',
  indexes: {
    'category': { keyPath: 'category', multiEntry: true }
  },
  data: {
    id: string,              // 'w000', 'w001', ...
    cz: string,
    en: string,
    vi: string,
    category: string[],
    czPron?: string,
    viPron?: string,
    czAudio?: string,
    viAudio?: string,
    czHint?: string,
    viHint?: string,
    version: number,         // timestamp from server
  }
}
```

#### 2. user_progress - Spaced Repetition State
```typescript
{
  keyPath: 'wordId',
  data: {
    wordId: string,
    stageIndex: number,
    knownCount: number,
    unknownCount: number,
    lastKnownAt?: number,
    lastUnknownAt?: number,
    nextDueAt?: number,

    // Server state tracking (for delta-based merging)
    serverKnownCount: number,
    serverUnknownCount: number,
    serverStageIndex: number,
    serverVersion: number,

    // Sync state
    isDirty: boolean,        // needs sync
    localVersion: number,    // increment on each local change
  }
}
```

#### 3. user_metadata - User Preferences
```typescript
{
  keyPath: 'key',
  data: {
    key: 'preferences',      // single row
    userId?: string,
    role: 'cz' | 'vi',
    showEnglish: boolean,
    showCategoryBadges: boolean,
    userRole: 'user' | 'editor',
    walletAddress?: string,

    // Server state tracking
    serverVersion: number,
    isDirty: boolean,
  }
}
```

#### 4. memory_hooks - Custom Notes
```typescript
{
  keyPath: 'wordId',
  data: {
    wordId: string,
    text: string,
    updatedAt: number,       // timestamp

    // Server state tracking
    serverText: string,
    serverUpdatedAt: number,
    serverVersion: number,
    isDirty: boolean,
  }
}
```

#### 5. category_filters - Selected Categories
```typescript
{
  keyPath: 'category',
  data: {
    category: string,
    isDirty: boolean,
  }
}
```

#### 6. sync_queue - Pending Changes
```typescript
{
  keyPath: 'id',
  indexes: {
    'timestamp': 'timestamp'
  },
  data: {
    id: string,              // uuid
    type: 'progress' | 'hook' | 'filter' | 'preference',
    payload: object,
    timestamp: number,
    retryCount: number,
    lastError?: string,
  }
}
```

#### 7. metadata - App Metadata
```typescript
{
  keyPath: 'key',
  data: {
    key: string,             // 'migrated', 'vocabVersion', etc.
    value: any,
  }
}
```

## Data Loading & Hydration

### Startup Sequence

1. **Initialize IndexedDB**
   ```typescript
   const db = await openDB('wordlink-db', 1, {
     upgrade(db, oldVersion, newVersion, transaction) {
       // Create object stores
     }
   });
   ```

2. **Load vocabulary**
   - Check IndexedDB for stored words
   - If empty: load from bundled `slova.js`, store in IndexedDB
   - If online: background fetch from `/api/words` for updates

3. **Load user data**
   - Read from IndexedDB: progress, hooks, filters, preferences
   - Get `deviceId` from localStorage (existing behavior)
   - Load into React state immediately (no spinner)

4. **Check online status & sync**
   - If online: trigger background sync
   - Fetch server data and merge with local (conflict resolution)
   - Update IndexedDB with merged results

5. **Start sync manager**
   - Monitor connection status
   - Process sync queue
   - Set up periodic sync (when online)

### User Scenarios

**New user (first launch):**
- Load bundled vocabulary → IndexedDB
- Empty progress/hooks
- Works offline immediately

**Returning user (same device):**
- Load from IndexedDB
- Sync when online (should be no conflicts)

**Returning user (new device):**
- Load bundled vocabulary
- If online: detect `userId` from server, fetch and merge data
- If offline: works with empty progress until first sync

## Sync Strategy

### When to Sync

1. **App startup** (if online)
2. **Connection restored** (offline → online event)
3. **After local changes** (debounced 5s, only if online)
4. **Periodic background** (every 30s when online & idle)

### Conflict Resolution

**Problem:** When same word progressed on multiple devices offline, we need smart merging.

**Solution:** Delta-based merging - track what the server state was at last sync, only merge the changes.

#### Progress Merging (Corrected Algorithm)

```typescript
function mergeProgress(local: LocalProgress, server: ServerProgress): MergedProgress {
  // Check for conflicts
  const hasLocalChanges = local.serverVersion !== server.version;
  const localModified =
    local.stageIndex !== local.serverStageIndex ||
    local.knownCount !== local.serverKnownCount ||
    local.unknownCount !== local.serverUnknownCount;

  // No local changes - server wins
  if (!localModified) {
    return {
      ...server,
      serverStageIndex: server.stageIndex,
      serverKnownCount: server.knownCount,
      serverUnknownCount: server.unknownCount,
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

  // True conflict - both changed offline, merge deltas
  const localKnownDelta = local.knownCount - (local.serverKnownCount || 0);
  const localUnknownDelta = local.unknownCount - (local.serverUnknownCount || 0);

  const mergedKnownCount = server.knownCount + localKnownDelta;
  const mergedUnknownCount = server.unknownCount + localUnknownDelta;
  const mergedStageIndex = Math.max(local.stageIndex, server.stageIndex);

  return {
    stageIndex: mergedStageIndex,
    knownCount: mergedKnownCount,
    unknownCount: mergedUnknownCount,
    lastKnownAt: Math.max(local.lastKnownAt || 0, server.lastKnownAt || 0),
    lastUnknownAt: Math.max(local.lastUnknownAt || 0, server.lastUnknownAt || 0),
    nextDueAt: calculateNextDue(mergedStageIndex, Math.max(local.lastKnownAt || 0, server.lastKnownAt || 0)),

    // Update server state tracking
    serverKnownCount: mergedKnownCount,
    serverUnknownCount: mergedUnknownCount,
    serverStageIndex: mergedStageIndex,
    serverVersion: server.version,
    isDirty: false,
  };
}
```

**Example:**
```
Initial state (synced): knownCount = 5, serverKnownCount = 5

Device 1 offline: mark known 3 times → knownCount = 8
Device 2 offline: mark known 2 times → knownCount = 7

Device 2 syncs first: server gets knownCount = 7

Device 1 syncs:
  - localKnownDelta = 8 - 5 = 3
  - server.knownCount = 7
  - merged = 7 + 3 = 10 ✓ (correct: 5 + 3 + 2)
```

#### Other Data Types

**Memory hooks:** Last-write-wins by timestamp
```typescript
function mergeHook(local, server) {
  return local.updatedAt > server.updatedAt ? local : server;
}
```

**Category filters:** Union of both sets
```typescript
function mergeFilters(local, server) {
  return new Set([...local, ...server]);
}
```

**Preferences:** Last-write-wins by timestamp

### Sync Flow

1. **Collect dirty items** from IndexedDB
2. **Build sync payload** (same format as current `/api/sync` POST)
3. **Send to server** with versions for conflict detection
4. **Server responds** with current server state
5. **Merge conflicts** client-side using algorithms above
6. **Update IndexedDB** with merged results, clear dirty flags
7. **Update React state** if values changed
8. **Remove from sync queue** on success

### Retry Logic

- Failed syncs stay in `sync_queue`
- Exponential backoff: 5s → 10s → 30s → 60s → 300s
- Max 5 retries per item
- After max retries: mark as "failed", show in UI

## Vocabulary Updates

### Versioning Strategy

Add version metadata to vocabulary:
```typescript
interface VocabularyMetadata {
  version: number;        // timestamp or incrementing version
  wordCount: number;      // for validation
  lastUpdated: string;    // ISO timestamp
}
```

### Update Flow

**1. Bundled baseline (slova.js)**
- Loaded on first launch or when IndexedDB empty
- Includes version metadata in `data/words.ts`
- Always available offline

**2. Check for updates (when online)**
- Fetch `/api/words/metadata` (lightweight, returns just version)
- Compare with IndexedDB stored version
- If server newer: fetch full vocabulary

**3. Fetch and merge**
```typescript
// GET /api/words returns full vocabulary + metadata
const serverWords = await fetch('/api/words');

// Merge strategy:
// - New words: add to IndexedDB
// - Updated words: replace in IndexedDB (keep user's progress)
// - Deleted words: mark as archived (don't lose progress)

for (const word of serverWords.words) {
  await db.put('words', word);
}

await db.put('metadata', {
  key: 'vocabVersion',
  value: serverWords.metadata.version
});
```

**4. Editor workflow**
- Edit via `/edit` page (online only)
- Changes saved to server immediately
- Server increments vocabulary version
- Other devices fetch updates on next sync
- Editor's device gets immediate update from API response

### Update Frequency

- Check on app startup (if online)
- Check after successful sync (throttled: max once per hour)
- Manual "Check for updates" button in settings

## Online/Offline State Management

### Connection Detection

```typescript
// lib/connection-monitor.ts
export class ConnectionMonitor {
  private isOnline = navigator.onLine;
  private listeners = new Set<(online: boolean) => void>();
  private pingInterval?: number;
  private backoffMs = 5000;

  constructor() {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Verify actual connectivity (navigator.onLine can be unreliable)
    if (this.isOnline) {
      this.verifyConnectivity();
    }
  }

  private async verifyConnectivity() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      this.setOnline(true);
      this.backoffMs = 5000; // Reset backoff
    } catch {
      this.setOnline(false);
      // Retry with exponential backoff
      this.backoffMs = Math.min(this.backoffMs * 2, 60000);
      setTimeout(() => this.verifyConnectivity(), this.backoffMs);
    }
  }

  private handleOnline() {
    this.verifyConnectivity();
  }

  private handleOffline() {
    this.setOnline(false);
  }

  private setOnline(online: boolean) {
    if (this.isOnline !== online) {
      this.isOnline = online;
      this.listeners.forEach(listener => listener(online));
    }
  }

  subscribe(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);
    callback(this.isOnline); // Immediate call with current state
    return () => this.listeners.delete(callback);
  }

  getStatus(): boolean {
    return this.isOnline;
  }
}

export const connectionMonitor = new ConnectionMonitor();
```

### UI Indicators

**1. Status indicator (subtle)**
- Top bar: `●` green (online) or gray (offline)
- No intrusive banners

**2. Sync status**
- Icon showing state: `✓` synced, `↻` syncing, `!` failed
- Tap for details: "Last synced 2 mins ago" or "3 changes pending"

**3. Feature blocking**
- Wallet linking: Show "Online required" message
- Edit mode: Redirect with toast "Editor features require connection"

## Error Handling

### Edge Cases

**1. IndexedDB unavailable** (private browsing)
- Fallback to in-memory store (current session only)
- Show warning: "Private mode detected. Progress won't persist."
- Still attempt server sync if online

**2. IndexedDB quota exceeded**
- Clear old sync queue entries (completed + >7 days old)
- Remove oldest progress for mastered words (stage 10+)
- Show notification: "Storage almost full"

**3. Sync conflict unresolvable**
- Log error with details
- Keep local version
- Add to failed sync queue with special flag
- Show in settings: "Some changes couldn't sync - tap to retry"

**4. Server schema change**
- Version API responses: `{ apiVersion: 1, ... }`
- Client checks version compatibility
- If incompatible: prompt "App update available - please refresh"

**5. Clock skew** (device time wrong)
- Use server timestamps where possible
- For local timestamps: store both `localTime` and `serverTime`
- Conflict resolution uses relative time differences

**6. Multiple tabs** (same device)
- IndexedDB is shared across tabs ✓
- Use BroadcastChannel API to sync React state
- Changes in one tab immediately reflect in others

### Error States

```typescript
type SyncState =
  | { status: 'synced', lastSyncAt: number }
  | { status: 'syncing', progress?: number }
  | { status: 'offline', pendingChanges: number }
  | { status: 'error', message: string, retryAt?: number };
```

## Migration Strategy

### Phased Rollout

**Phase 1: Add IndexedDB layer (non-breaking)**
- Keep current API sync working
- Add IndexedDB as write-through cache
- All reads from IndexedDB, writes to both
- Test with feature flag

**Phase 2: Enable offline mode**
- Add sync manager
- Writes go to IndexedDB immediately, sync in background
- Queue operations when offline
- Server merge logic handles conflicts

**Phase 3: Optimize (later)**
- Remove redundant localStorage usage
- Add vocabulary delta updates
- Consider service worker for PWA

### Migration Code

```typescript
// On first load after update
async function migrateToIndexedDB() {
  const db = await openIndexedDB();
  const migrated = await db.get('metadata', 'migrated');

  if (!migrated) {
    try {
      // One-time fetch of all user data from server
      const serverData = await fetchUserData();

      // Store in IndexedDB with server state tracking
      await storeProgress(db, serverData.progress);
      await storeHooks(db, serverData.memory_hooks);
      await storeFilters(db, serverData.category_filters);
      await storePreferences(db, serverData.user);
      await storeWords(db, bundledWords);

      // Mark as migrated
      await db.put('metadata', { key: 'migrated', value: true });
    } catch (error) {
      console.error('Migration failed, will retry on next load:', error);
      // Don't mark as migrated - will retry
    }
  }
}
```

### Rollback Safety

- Server remains source of truth during migration
- If IndexedDB fails: fall back to current API-only behavior
- Feature flag: `ENABLE_OFFLINE_MODE` to disable if issues

## API Changes

### Minimal Server Changes

**1. `/api/sync` GET** - No changes needed
- Already returns all user data
- Add optional `dataVersion` to response

**2. `/api/sync` POST** - Add version info
```typescript
// Request (add versions for conflict detection)
{
  deviceId: string,
  userId?: string,
  progress?: Array<{
    word_id: string,
    stage_index: number,
    known_count: number,
    unknown_count: number,
    last_known_at: number | null,
    last_unknown_at: number | null,
    next_due_at: number | null,
    version: number,  // NEW: for conflict detection
  }>,
  // ... hooks, filters, preferences
}

// Response (include server versions)
{
  success: true,
  user: { id, role, ... },
  progress: {
    [wordId]: {
      // ... data
      version: number,  // NEW
    }
  },
  // ... hooks, filters
}
```

**3. `/api/words`** - Add metadata endpoint
```typescript
// NEW: GET /api/words/metadata
{
  version: 123456789,
  wordCount: 216,
  lastUpdated: "2026-02-12T10:30:00Z"
}

// Existing: GET /api/words (add metadata to response)
{
  words: [...],
  metadata: {
    version: 123456789,
    wordCount: 216,
    lastUpdated: "2026-02-12T10:30:00Z"
  }
}
```

**4. NEW: `/api/health`** - Connectivity check
- HEAD request returns 200 if server reachable
- Used by connection monitor

## File Structure

### New Files

```
lib/
├── db/
│   ├── indexed.ts              # IndexedDB setup & connection
│   ├── types.ts                # TypeScript types for stores
│   ├── stores/
│   │   ├── words.ts            # Word CRUD operations
│   │   ├── progress.ts         # Progress CRUD operations
│   │   ├── hooks.ts            # Memory hooks CRUD
│   │   ├── filters.ts          # Category filters CRUD
│   │   ├── metadata.ts         # App metadata CRUD
│   │   └── sync-queue.ts       # Sync queue operations
│   └── migration.ts            # Migration from server to IndexedDB
├── sync-manager.ts             # Sync orchestration
├── connection-monitor.ts       # Online/offline detection
├── offline-fallback.ts         # In-memory fallback store
└── conflict-resolution.ts      # Merge algorithms

hooks/
├── useOnlineStatus.ts          # React hook for connection state
└── useSyncStatus.ts            # React hook for sync state

components/
└── SyncStatusIndicator.tsx     # UI for sync status

app/api/
└── health/
    └── route.ts                # Health check endpoint
```

### Modified Files

```
hooks/useAppState.ts            # Read from IndexedDB, notify sync manager
lib/sync.ts                     # Add version tracking, conflict detection
lib/words.ts                    # Add version to vocabulary metadata
app/api/sync/route.ts           # Add version to responses
app/api/words/route.ts          # Add /metadata endpoint
components/SettingsPanel.tsx    # Add sync status display
data/words.ts                   # Add version metadata
```

## Testing Strategy

### Unit Tests

- IndexedDB operations (CRUD for each store)
- Conflict resolution algorithms
- Connection monitor state transitions
- Sync manager queue operations

### Integration Tests

- Full sync flow (online → offline → online)
- Multi-device conflict scenarios
- Vocabulary update flow
- Migration from current architecture

### Manual Testing Scenarios

1. **Offline learning**
   - Disconnect network
   - Mark words as known/unknown
   - Check progress persists across refresh
   - Reconnect and verify sync

2. **Multi-device conflict**
   - Progress same word on two devices offline
   - Sync both devices
   - Verify counters summed correctly

3. **Vocabulary update**
   - Editor adds new words
   - Other device fetches updates
   - Verify new words appear

4. **Edge cases**
   - Private browsing mode
   - Quota exceeded (fill storage)
   - Server unavailable during startup
   - Multiple tabs open

## Success Metrics

- **Startup time** - App interactive in <500ms (vs current ~2s with server wait)
- **Offline capability** - 100% of learning features work offline
- **Sync success rate** - >99% of syncs succeed (after retries)
- **Data consistency** - Zero progress loss in conflict scenarios
- **User feedback** - Survey: "App feels faster and more reliable"

## Future Enhancements

- **Service Worker** - True PWA with background sync
- **Delta sync** - Only send/receive changed data
- **Cloudflare migration** - D1/Durable Objects for edge compute
- **Conflict UI** - Let user choose resolution for ambiguous conflicts
- **Export/Import** - Backup progress to JSON file
- **Multi-language sync** - Separate progress for cz vs vi role

## Open Questions

None - design approved and ready for implementation.

## References

- Current architecture: CLAUDE.md
- IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- Background Sync: https://developer.chrome.com/docs/capabilities/periodic-background-sync
