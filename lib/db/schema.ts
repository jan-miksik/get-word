import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  unique,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Enums
export const translationStatusEnum = pgEnum("translation_status", [
  "manual",
  "pending",
  "translated",
  "failed",
]);

export const audioStatusEnum = pgEnum("audio_status", [
  "none",
  "pending",
  "ready",
  "failed",
]);

export const storageTypeEnum = pgEnum("storage_type", ["arweave", "r2"]);

export const mediaTypeEnum = pgEnum("media_type", ["audio"]);

export const ttsProviderEnum = pgEnum("tts_provider", [
  "google_tts",
  "elevenlabs",
]);

export const apiKeyProviderEnum = pgEnum("api_key_provider", [
  "openrouter",
  "elevenlabs",
]);

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

// Word lists - container for vocabulary sets
export const wordLists = pgTable("word_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  languageFrom: text("language_from").notNull(),
  languageTo: text("language_to").notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Word categories - sections within a list
export const wordCategories = pgTable(
  "word_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => wordLists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// Media assets - shared audio pool (content-addressed)
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentHash: text("content_hash").notNull(),
    storageType: storageTypeEnum("storage_type").notNull(),
    storageRef: text("storage_ref").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull().default("audio"),
    language: text("language").notNull(),
    textReference: text("text_reference").notNull(),
    provider: ttsProviderEnum("provider").notNull(),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("media_assets_content_hash_unique").on(table.contentHash)],
);

// Word list items - individual words within a category
export const wordListItems = pgTable(
  "word_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => wordLists.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .references(() => wordCategories.id, { onDelete: "set null" }),
    canonicalWordId: uuid("canonical_word_id"),
    position: integer("position").notNull().default(0),
    textKnown: text("text_known").notNull(),
    textTarget: text("text_target"),
    translationStatus: translationStatusEnum("translation_status")
      .notNull()
      .default("manual"),
    audioAssetId: uuid("audio_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    audioStatus: audioStatusEnum("audio_status").notNull().default("none"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("word_list_items_list_cat_pos_idx").on(
      table.listId,
      table.categoryId,
      table.position,
    ),
  ],
);

// Users table - supports device, email, and wallet auth
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: text("device_id").unique(), // Device-based auth
  email: text("email").unique(), // Email (when signed in with email/Google/social)
  walletAddress: text("wallet_address").unique(), // Web3 embedded wallet
  authProvider: text("auth_provider"), // "email" | "google" | "apple" | "wallet" etc.
  role: text("role").notNull().default("vi"), // "cz" or "vi"
  userRole: text("user_role").notNull().default("user"), // "user" or "editor"
  showEnglish: boolean("show_english").default(true).notNull(),
  showCategoryBadges: boolean("show_category_badges").default(false).notNull(),
  showPronunciation: boolean("show_pronunciation").default(false).notNull(),
  gameScore: integer("game_score").notNull().default(0),
  categoryOrder: text("category_order").array().notNull().default(sql`'{}'::text[]`),
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
      .references(() => words.id, { onDelete: "cascade" }),
    wordListItemId: uuid("word_list_item_id").references(
      () => wordListItems.id,
      { onDelete: "set null" },
    ),
    stageIndex: integer("stage_index").notNull().default(0), // 0-10 spaced repetition
    knownCount: integer("known_count").notNull().default(0),
    unknownCount: integer("unknown_count").notNull().default(0),
    lastKnownAt: timestamp("last_known_at"),
    lastUnknownAt: timestamp("last_unknown_at"),
    nextDueAt: timestamp("next_due_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.userId, table.wordId),
    index("user_progress_user_item_idx").on(
      table.userId,
      table.wordListItemId,
    ),
  ],
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

// User API keys - BYOK key storage (encrypted)
export const userApiKeys = pgTable(
  "user_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: apiKeyProviderEnum("provider").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("user_api_keys_user_provider_unique").on(table.userId, table.provider)],
);

// User list subscriptions - tracks which curated lists a user follows
export const userListSubscriptions = pgTable(
  "user_list_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listId: uuid("list_id")
      .notNull()
      .references(() => wordLists.id, { onDelete: "cascade" }),
    subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  },
  (table) => [
    unique("user_list_subscriptions_user_list_unique").on(
      table.userId,
      table.listId,
    ),
  ],
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
export type WordList = typeof wordLists.$inferSelect;
export type NewWordList = typeof wordLists.$inferInsert;
export type WordCategory = typeof wordCategories.$inferSelect;
export type NewWordCategory = typeof wordCategories.$inferInsert;
export type WordListItem = typeof wordListItems.$inferSelect;
export type NewWordListItem = typeof wordListItems.$inferInsert;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
export type UserApiKey = typeof userApiKeys.$inferSelect;
export type NewUserApiKey = typeof userApiKeys.$inferInsert;
export type UserListSubscription = typeof userListSubscriptions.$inferSelect;
export type NewUserListSubscription = typeof userListSubscriptions.$inferInsert;
