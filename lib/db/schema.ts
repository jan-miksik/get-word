import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  unique,
} from "drizzle-orm/pg-core";

// Words table - stores all vocabulary
export const words = pgTable("words", {
  id: text("id").primaryKey(), // e.g., "w000", "w001"
  category: text("category").array().notNull(), // ["basic", "phrase"]
  cz: text("cz").notNull(), // Czech translation
  en: text("en").notNull(), // English translation
  vi: text("vi").notNull(), // Vietnamese translation
  czPron: text("cz_pron"), // Czech pronunciation
  viPron: text("vi_pron"), // Vietnamese pronunciation
  czAudio: text("cz_audio"), // Audio file path
  viAudio: text("vi_audio"), // Audio file path
  czHint: text("cz_hint"), // Memory hint for Czech
  viHint: text("vi_hint"), // Memory hint for Vietnamese
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Users table - supports device, email, and wallet auth
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: text("device_id").unique(), // Device-based auth
  email: text("email").unique(), // Email auth (future)
  walletAddress: text("wallet_address").unique(), // Web3 auth (future)
  role: text("role").notNull().default("vi"), // "cz" or "vi"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User progress - tracks spaced repetition for each word
export const userProgress = pgTable(
  "user_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wordId: text("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    stageIndex: integer("stage_index").notNull().default(0), // 0-10 spaced repetition
    knownCount: integer("known_count").notNull().default(0),
    unknownCount: integer("unknown_count").notNull().default(0),
    lastKnownAt: timestamp("last_known_at"),
    lastUnknownAt: timestamp("last_unknown_at"),
    nextDueAt: timestamp("next_due_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.wordId)]
);

// User memory hooks - custom notes for words
export const userMemoryHooks = pgTable(
  "user_memory_hooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wordId: text("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    hookText: text("hook_text").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.wordId)]
);

// User category filters - selected categories for learning
export const userCategoryFilters = pgTable(
  "user_category_filters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.category)]
);

// Type exports for use in queries
export type Word = typeof words.$inferSelect;
export type NewWord = typeof words.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserProgress = typeof userProgress.$inferSelect;
export type NewUserProgress = typeof userProgress.$inferInsert;
export type UserMemoryHook = typeof userMemoryHooks.$inferSelect;
export type NewUserMemoryHook = typeof userMemoryHooks.$inferInsert;
export type UserCategoryFilter = typeof userCategoryFilters.$inferSelect;
export type NewUserCategoryFilter = typeof userCategoryFilters.$inferInsert;
