import type { WordItemComment } from "@/lib/word-item-comment";
export type {
  SyncActivitySegment,
  SyncOperationResult,
  SyncMutationPayload,
  SyncProgressItem,
  SyncRequest,
  SyncReviewEventAction,
  SyncReviewEventItem,
  StudyGoalMutation,
} from '@/packages/contracts/src/sync';
export type { DeviceProfile } from '@/packages/contracts/src/device';
import type { SyncReviewEventItem } from '@/packages/contracts/src/sync';
import type { SyncOperationResult } from '@/packages/contracts/src/sync';

export interface SyncWordListItem {
  id: string;
  listId: string;
  languageFrom?: string;
  languageTo?: string;
  categoryId: string | null;
  canonicalWordId?: string | null;
  sourceItemId?: string | null;
  takeoverSourceItemId?: string | null;
  position: number;
  ignoreCase?: boolean;
  textKnown: string;
  textTarget: string | null;
  acceptedKnown?: string[];
  acceptedTarget?: string[];
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
  comment?: WordItemComment | null;
}

export interface SyncCategory {
  name: string;
  position: number;
}

export interface ProgressData {
  stageIndex: number;
  knownCount: number;
  unknownCount: number;
  introducedAt?: number;
  lastKnownAt?: number;
  lastUnknownAt?: number;
  nextDueAt?: number;
}

export interface SyncResponse {
  success: boolean;
  applied_review_event_ids?: string[];
  applied_client_op_ids?: string[];
  submitted_review_events?: SyncReviewEventItem[];
  op_errors?: Record<string, string>;
  op_results?: SyncOperationResult[];
  sync_revision?: number;
  /**
   * Marks a delta response from GET /api/sync?since=<cursor>. When true,
   * memory_hooks contains only updated keys and memory_hooks_deleted carries
   * tombstones to drop; word_list_items/categories/lists are omitted and the
   * client should keep its existing copies.
   */
  is_delta?: boolean;
  memory_hooks_deleted?: string[];
  /**
   * Signature of the user's word-list content (lists/items/categories). Only
   * present on full snapshots; the client echoes it as `contentRev` so the
   * server can skip re-hydrating unchanged lists.
   */
  content_revision?: string;
  /** True when a conditional GET confirmed nothing changed server-side. */
  unchanged?: boolean;
  user: {
    id: string;
    user_role?: "user" | "editor";
    show_english?: boolean;
    show_category_badges?: boolean;
    show_pronunciation?: boolean;
    memory_hooks_enabled?: boolean;
    memory_hooks_intro_answered?: boolean;
    memory_hook_disable_from_stage?: number;
    study_notes_enabled?: boolean;
    study_note_minimize_from_stage?: number;
    learning_fine_tune?: unknown;
    study_goal?: {
      active: unknown | null;
      pending: unknown | null;
      revision: number;
    };
    goal_reminder_enabled?: boolean;
    goal_reminder_local_minutes?: number | null;
    goal_intro_answered?: boolean;
    review_opt_in?: boolean;
    ai_review_opt_in?: boolean;
    settings_language?: string | null;
    settings_language_selected_at?: string | null;
    settings_language_revision?: number;
    language_from?: string | null;
    language_to?: string | null;
    onboarding_completed_at?: string | null;
    language_pair_revision?: number;
    wallet_address?: string | null;
    email?: string | null;
    auth_provider?: string | null;
    game_score?: number;
    category_order?: string[];
    /** Categories whose words lead the study stream. Server-owned. */
    pinned_category_ids?: string[];
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
      introducedAt?: string | null;
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
    isPersonal?: boolean;
    isOwnedPersonal?: boolean;
  }[];
}
