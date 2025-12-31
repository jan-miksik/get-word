// Database utilities for Cloudflare D1
export interface D1Database {
  exec(query: string): Promise<D1Result>;
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: {
    duration: number;
    rows_read: number;
    rows_written: number;
    last_row_id: number;
    changed_db: boolean;
  };
}

export interface User {
  id: string;
  device_id: string;
  role: 'cz' | 'vi';
  created_at: number;
  updated_at: number;
}

export interface Progress {
  user_id: string;
  word_index: number;
  stage_index: number;
  known_count: number;
  unknown_count: number;
  last_known_at: number | null;
  last_unknown_at: number | null;
  next_due_at: number | null;
  updated_at: number;
}

export interface MemoryHook {
  user_id: string;
  word_index: number;
  hook_text: string;
  updated_at: number;
}

// Get or create user by device ID
export async function getOrCreateUser(
  db: D1Database,
  deviceId: string
): Promise<User> {
  // Try to get existing user
  const existing = await db
    .prepare('SELECT * FROM users WHERE device_id = ?')
    .bind(deviceId)
    .first<User>();

  if (existing) {
    return existing;
  }

  // Create new user
  const userId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  
  await db
    .prepare('INSERT INTO users (id, device_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, deviceId, 'vi', now, now)
    .run();

  return {
    id: userId,
    device_id: deviceId,
    role: 'vi',
    created_at: now,
    updated_at: now,
  };
}

// Update user role
export async function updateUserRole(
  db: D1Database,
  userId: string,
  role: 'cz' | 'vi'
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
    .bind(role, now, userId)
    .run();
}

// Get all progress for a user
export async function getUserProgress(
  db: D1Database,
  userId: string
): Promise<Record<number, Progress>> {
  const results = await db
    .prepare('SELECT * FROM progress WHERE user_id = ?')
    .bind(userId)
    .all<Progress>();

  const progressMap: Record<number, Progress> = {};
  for (const row of results.results) {
    progressMap[row.word_index] = row;
  }
  return progressMap;
}

// Upsert progress for a word
export async function upsertProgress(
  db: D1Database,
  progress: Omit<Progress, 'updated_at'>
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`
      INSERT INTO progress (
        user_id, word_index, stage_index, known_count, unknown_count,
        last_known_at, last_unknown_at, next_due_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, word_index) DO UPDATE SET
        stage_index = excluded.stage_index,
        known_count = excluded.known_count,
        unknown_count = excluded.unknown_count,
        last_known_at = excluded.last_known_at,
        last_unknown_at = excluded.last_unknown_at,
        next_due_at = excluded.next_due_at,
        updated_at = excluded.updated_at
    `)
    .bind(
      progress.user_id,
      progress.word_index,
      progress.stage_index,
      progress.known_count,
      progress.unknown_count,
      progress.last_known_at,
      progress.last_unknown_at,
      progress.next_due_at,
      now
    )
    .run();
}

// Batch upsert progress
export async function batchUpsertProgress(
  db: D1Database,
  progressList: Omit<Progress, 'updated_at'>[]
): Promise<void> {
  // Cloudflare D1 limits the number of prepared statements per `db.batch()` call.
  // Keep this <= the D1 limit to avoid "too many statements" errors.
  const BATCH_SIZE = 100;

  if (progressList.length === 0) return;

  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < progressList.length; i += BATCH_SIZE) {
    const chunk = progressList.slice(i, i + BATCH_SIZE);
    const statements = chunk.map((progress) =>
      db
        .prepare(`
          INSERT INTO progress (
            user_id, word_index, stage_index, known_count, unknown_count,
            last_known_at, last_unknown_at, next_due_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, word_index) DO UPDATE SET
            stage_index = excluded.stage_index,
            known_count = excluded.known_count,
            unknown_count = excluded.unknown_count,
            last_known_at = excluded.last_known_at,
            last_unknown_at = excluded.last_unknown_at,
            next_due_at = excluded.next_due_at,
            updated_at = excluded.updated_at
        `)
        .bind(
          progress.user_id,
          progress.word_index,
          progress.stage_index,
          progress.known_count,
          progress.unknown_count,
          progress.last_known_at,
          progress.last_unknown_at,
          progress.next_due_at,
          now
        )
    );

    await db.batch(statements);
  }
}

// Get all memory hooks for a user
export async function getUserMemoryHooks(
  db: D1Database,
  userId: string
): Promise<Record<number, string>> {
  const results = await db
    .prepare('SELECT word_index, hook_text FROM memory_hooks WHERE user_id = ?')
    .bind(userId)
    .all<{ word_index: number; hook_text: string }>();

  const hooksMap: Record<number, string> = {};
  for (const row of results.results) {
    hooksMap[row.word_index] = row.hook_text;
  }
  return hooksMap;
}

// Upsert memory hook
export async function upsertMemoryHook(
  db: D1Database,
  userId: string,
  wordIndex: number,
  hookText: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`
      INSERT INTO memory_hooks (user_id, word_index, hook_text, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, word_index) DO UPDATE SET
        hook_text = excluded.hook_text,
        updated_at = excluded.updated_at
    `)
    .bind(userId, wordIndex, hookText, now)
    .run();
}

// Delete memory hook
export async function deleteMemoryHook(
  db: D1Database,
  userId: string,
  wordIndex: number
): Promise<void> {
  await db
    .prepare('DELETE FROM memory_hooks WHERE user_id = ? AND word_index = ?')
    .bind(userId, wordIndex)
    .run();
}

// Get category filters for a user
export async function getUserCategoryFilters(
  db: D1Database,
  userId: string
): Promise<string[]> {
  const results = await db
    .prepare('SELECT category FROM category_filters WHERE user_id = ?')
    .bind(userId)
    .all<{ category: string }>();

  return results.results.map((row) => row.category);
}

// Set category filters for a user
export async function setUserCategoryFilters(
  db: D1Database,
  userId: string,
  categories: string[]
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  
  // Cloudflare D1 limits the number of prepared statements per `db.batch()` call (~100).
  // Execute DELETE first, then split INSERTs into chunks to avoid exceeding the limit.
  const deleteStmt = db
    .prepare('DELETE FROM category_filters WHERE user_id = ?')
    .bind(userId);
  
  await deleteStmt.run();

  // Split INSERTs into chunks at or below D1 batch limit
  const BATCH_SIZE = 100;
  
  for (let i = 0; i < categories.length; i += BATCH_SIZE) {
    const chunk = categories.slice(i, i + BATCH_SIZE);
    const insertStmts = chunk.map((category) =>
      db
        .prepare('INSERT INTO category_filters (user_id, category, updated_at) VALUES (?, ?, ?)')
        .bind(userId, category, now)
    );

    try {
      await db.batch(insertStmts);
    } catch (error) {
      // Log error and propagate to caller
      console.error(`Error inserting category filters batch (chunk ${Math.floor(i / BATCH_SIZE) + 1}):`, error);
      throw error;
    }
  }
}

