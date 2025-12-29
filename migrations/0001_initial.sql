-- Users table: simple device-based identification
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  device_id TEXT UNIQUE NOT NULL,
  role TEXT CHECK(role IN ('cz', 'vi')) DEFAULT 'vi',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Progress table: tracks learning progress for each word
CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT NOT NULL,
  word_index INTEGER NOT NULL,
  stage_index INTEGER NOT NULL DEFAULT 0,
  known_count INTEGER NOT NULL DEFAULT 0,
  unknown_count INTEGER NOT NULL DEFAULT 0,
  last_known_at INTEGER,
  last_unknown_at INTEGER,
  next_due_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, word_index),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Memory hooks: user's custom notes for each word
CREATE TABLE IF NOT EXISTS memory_hooks (
  user_id TEXT NOT NULL,
  word_index INTEGER NOT NULL,
  hook_text TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, word_index),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Category filters: user's selected categories
CREATE TABLE IF NOT EXISTS category_filters (
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, category),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_progress_user_due ON progress(user_id, next_due_at);
CREATE INDEX IF NOT EXISTS idx_progress_user_stage ON progress(user_id, stage_index);
CREATE INDEX IF NOT EXISTS idx_memory_hooks_user ON memory_hooks(user_id);
CREATE INDEX IF NOT EXISTS idx_category_filters_user ON category_filters(user_id);

