import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  unique,
  uniqueIndex,
  index,
  pgEnum,
  jsonb,
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

export const googleApiScopeEnum = pgEnum("google_api_scope", [
  "translate",
  "tts",
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
export const wordLists = pgTable(
  "word_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    languageFrom: text("language_from").notNull(),
    languageTo: text("language_to").notNull(),
    isPublic: boolean("is_public").notNull().default(false),
    isCommon: boolean("is_common").notNull().default(false),
    isRecommended: boolean("is_recommended").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("word_lists_owner_idx").on(table.ownerId),
    index("word_lists_public_idx").on(table.isPublic),
    index("word_lists_common_idx").on(table.isCommon),
    index("word_lists_recommended_idx").on(table.isRecommended),
    uniqueIndex("word_lists_recommended_pair_unique")
      .on(
        sql`(case when lower(${table.languageFrom}) in ('cz', 'cs') then 'cs' else lower(${table.languageFrom}) end)`,
        sql`(case when lower(${table.languageTo}) in ('cz', 'cs') then 'cs' else lower(${table.languageTo}) end)`,
      )
      .where(sql`${table.isRecommended} = true`),
  ],
);

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
  (table) => [
    index("word_categories_list_pos_idx").on(table.listId, table.position),
  ],
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
    knownAudioAssetId: uuid("known_audio_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    knownAudioStatus: audioStatusEnum("known_audio_status").notNull().default("none"),
    audioAssetId: uuid("audio_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    audioStatus: audioStatusEnum("audio_status").notNull().default("none"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("word_list_items_list_pos_idx").on(table.listId, table.position),
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
  memoryHooksEnabled: boolean("memory_hooks_enabled").default(true).notNull(),
  memoryHookDisableFromStage: integer("memory_hook_disable_from_stage").default(5).notNull(),
  settingsLanguage: text("settings_language"),
  settingsLanguageSelectedAt: timestamp("settings_language_selected_at"),
  languageFrom: text("language_from"),
  languageTo: text("language_to"),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  gameScore: integer("game_score").notNull().default(0),
  categoryOrder: text("category_order").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const uiTranslationCache = pgTable(
  "ui_translation_cache",
  {
    languageCode: text("language_code").primaryKey(),
    messages: jsonb("messages").$type<Record<string, string>>().notNull(),
    sourceHash: text("source_hash").notNull(),
    provider: text("provider").notNull().default("google"),
    status: text("status").notNull().default("autogenerated"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("ui_translation_cache_source_hash_idx").on(table.sourceHash)],
);

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
    stageIndex: integer("stage_index").notNull().default(0), // 0-7 spaced repetition
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
    unique("user_progress_user_word_list_item_unique").on(
      table.userId,
      table.wordListItemId,
    ),
  ],
);

export const userDevices = pgTable(
  "user_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => [unique("user_devices_user_device_unique").on(table.userId, table.deviceId)]
);

export const reviewActionEnum = pgEnum("review_action", [
  "known",
  "really_known",
  "unknown",
]);

export const reviewEvents = pgTable(
  "review_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientEventId: text("client_event_id").notNull(),
    deviceId: text("device_id"),
    sessionId: text("session_id"),
    wordId: text("word_id").references(() => words.id, { onDelete: "cascade" }),
    wordListItemId: uuid("word_list_item_id").references(
      () => wordListItems.id,
      { onDelete: "set null" },
    ),
    action: reviewActionEnum("action").notNull(),
    clientCreatedAt: timestamp("client_created_at").notNull(),
    serverCreatedAt: timestamp("server_created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("review_events_user_client_event_unique").on(
      table.userId,
      table.clientEventId,
    ),
    index("review_events_user_server_created_idx").on(
      table.userId,
      table.serverCreatedAt,
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
    wordId: text("word_id").references(() => words.id, { onDelete: "cascade" }),
    wordListItemId: uuid("word_list_item_id").references(
      () => wordListItems.id,
      { onDelete: "cascade" },
    ),
    hookText: text("hook_text").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("user_memory_hooks_user_id_word_id_unique").on(table.userId, table.wordId),
    unique("user_memory_hooks_user_id_word_list_item_id_unique").on(
      table.userId,
      table.wordListItemId,
    ),
  ],
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
    keyLabel: text("key_label"),
    status: text("status").notNull().default("connected"),
    lastValidatedAt: timestamp("last_validated_at"),
    connectedAt: timestamp("connected_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    keyLast4: text("key_last4"),
    connectionMethod: text("connection_method").notNull().default("manual"),
    translationModel: text("translation_model"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("user_api_keys_user_provider_unique").on(table.userId, table.provider)],
);

// OAuth endpoint rate limiting buckets.
export const oauthRateLimits = pgTable(
  "oauth_rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bucketKey: text("bucket_key").notNull(),
    bucketStart: timestamp("bucket_start").notNull(),
    requestCount: integer("request_count").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("oauth_rate_limits_bucket_unique").on(table.bucketKey, table.bucketStart),
    index("oauth_rate_limits_bucket_key_idx").on(table.bucketKey, table.bucketStart),
  ],
);

// Google API usage ledger. Units are source text characters for each scope.
export const googleApiUsage = pgTable(
  "google_api_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: googleApiScopeEnum("scope").notNull(),
    periodStart: timestamp("period_start").notNull(),
    units: integer("units").notNull().default(0),
    requestCount: integer("request_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("google_api_usage_user_scope_period_unique").on(
      table.userId,
      table.scope,
      table.periodStart,
    ),
    index("google_api_usage_scope_period_idx").on(table.scope, table.periodStart),
    index("google_api_usage_user_period_idx").on(table.userId, table.periodStart),
  ],
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
export type UiTranslationCache = typeof uiTranslationCache.$inferSelect;
export type NewUiTranslationCache = typeof uiTranslationCache.$inferInsert;
export type UserProgress = typeof userProgress.$inferSelect;
export type NewUserProgress = typeof userProgress.$inferInsert;
export type ReviewEvent = typeof reviewEvents.$inferSelect;
export type NewReviewEvent = typeof reviewEvents.$inferInsert;
export type UserDevice = typeof userDevices.$inferSelect;
export type NewUserDevice = typeof userDevices.$inferInsert;
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
export type OAuthRateLimit = typeof oauthRateLimits.$inferSelect;
export type NewOAuthRateLimit = typeof oauthRateLimits.$inferInsert;
export type GoogleApiUsage = typeof googleApiUsage.$inferSelect;
export type NewGoogleApiUsage = typeof googleApiUsage.$inferInsert;
export type UserListSubscription = typeof userListSubscriptions.$inferSelect;
export type NewUserListSubscription = typeof userListSubscriptions.$inferInsert;
