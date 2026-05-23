export type UserRole = "cz" | "vi";

export type SyncReviewEventAction = "known" | "really_known" | "unknown";

export interface SyncProgressItem {
  word_id?: string;
  word_list_item_id?: string;
  stage_index: number;
  known_count: number;
  unknown_count: number;
  last_known_at: number | null;
  last_unknown_at: number | null;
  next_due_at: number | null;
}

export interface SyncReviewEventItem {
  client_event_id: string;
  word_id?: string;
  word_list_item_id?: string;
  action: SyncReviewEventAction;
  client_created_at: number;
}

export interface SyncRequest {
  deviceId?: string;
  sessionId?: string;
  userId?: string;
  role?: UserRole;
  show_english?: boolean;
  show_category_badges?: boolean;
  show_pronunciation?: boolean;
  memory_hooks_enabled?: boolean;
  memory_hooks_intro_answered?: boolean;
  memory_hook_disable_from_stage?: number;
  settings_language?: string;
  language_from?: string | null;
  language_to?: string | null;
  onboarding_completed?: boolean;
  game_score?: number;
  category_order?: string[];
  progress?: SyncProgressItem[];
  review_events?: SyncReviewEventItem[];
  memory_hooks?: Record<string, string | null>;
  category_filters?: string[];
  /**
   * Stable identifiers for the outbox ops that produced this payload. Server
   * uses these for idempotent retry handling (processed_client_ops table).
   * When absent, server falls back to legacy non-idempotent behaviour.
   */
  client_op_ids?: string[];
}

export type SyncMutationPayload = Omit<
  SyncRequest,
  "deviceId" | "sessionId" | "userId"
>;

export interface SyncWordListItem {
  id: string;
  listId: string;
  languageFrom?: string;
  languageTo?: string;
  categoryId: string | null;
  canonicalWordId?: string | null;
  position: number;
  textKnown: string;
  textTarget: string | null;
  translationStatus: string;
  knownAudioAssetId: string | null;
  knownAudioStatus: string;
  knownAudioUrl?: string | null;
  knownAudioArweaveUrl?: string | null;
  knownAudioArweaveUrls?: string[];
  knownAudioStorageRef?: string | null;
  audioAssetId: string | null;
  audioStatus: string;
  audioUrl?: string | null;
  audioArweaveUrl?: string | null;
  audioArweaveUrls?: string[];
  audioStorageRef?: string | null;
  notes: string | null;
}

export interface SyncCategory {
  name: string;
  position: number;
}

export interface ProgressData {
  stageIndex: number;
  knownCount: number;
  unknownCount: number;
  lastKnownAt?: number;
  lastUnknownAt?: number;
  nextDueAt?: number;
}

export interface SyncResponse {
  success: boolean;
  applied_review_event_ids?: string[];
  applied_client_op_ids?: string[];
  op_errors?: Record<string, string>;
  sync_revision?: number;
  /**
   * Marks a delta response from GET /api/sync?since=<cursor>. When true,
   * memory_hooks contains only updated keys and memory_hooks_deleted carries
   * tombstones to drop; word_list_items/categories/lists are omitted and the
   * client should keep its existing copies.
   */
  is_delta?: boolean;
  memory_hooks_deleted?: string[];
  user: {
    id: string;
    role: UserRole;
    user_role?: "user" | "editor";
    show_english?: boolean;
    show_category_badges?: boolean;
    show_pronunciation?: boolean;
    memory_hooks_enabled?: boolean;
    memory_hooks_intro_answered?: boolean;
    memory_hook_disable_from_stage?: number;
    settings_language?: string | null;
    settings_language_selected_at?: string | null;
    language_from?: string | null;
    language_to?: string | null;
    onboarding_completed_at?: string | null;
    wallet_address?: string | null;
    email?: string | null;
    auth_provider?: string | null;
    game_score?: number;
    category_order?: string[];
  };
  progress: Record<
    string,
    {
      id: string;
      userId: string;
      wordId: string | null;
      wordListItemId: string | null;
      stageIndex: number;
      knownCount: number;
      unknownCount: number;
      lastKnownAt: string | null;
      lastUnknownAt: string | null;
      nextDueAt: string | null;
      createdAt: string;
      updatedAt: string;
    }
  >;
  memory_hooks: Record<string, string>;
  category_filters: string[];
  word_list_items?: SyncWordListItem[];
  categories?: Record<string, SyncCategory>;
  lists?: {
    id: string;
    name: string;
    languageFrom: string;
    languageTo: string;
    isRecommended?: boolean;
  }[];
}
