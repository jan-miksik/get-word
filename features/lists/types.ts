export type WordList = {
  id: string;
  ownerId: string | null;
  name: string;
  description: string | null;
  languageFrom: string;
  languageTo: string;
  isPublic: boolean;
};

export type WordCategory = {
  id: string;
  listId: string;
  name: string;
  position: number;
  isSystem: boolean;
};

export type WordListItem = {
  id: string;
  listId: string;
  categoryId: string | null;
  position: number;
  textKnown: string;
  textTarget: string | null;
  translationStatus: string;
  knownAudioAssetId?: string | null;
  knownAudioStatus?: string;
  knownAudioUrl?: string | null;
  knownAudioArweaveUrl?: string | null;
  knownAudioArweaveUrls?: string[];
  knownAudioStorageRef?: string | null;
  audioAssetId?: string | null;
  audioStatus: string;
  audioUrl?: string | null;
  audioArweaveUrl?: string | null;
  audioArweaveUrls?: string[];
  audioStorageRef?: string | null;
  notes: string | null;
};

export type DiffResult = {
  added: string[];
  removed: { id: string; text_known: string; text_target: string | null }[];
  reordered: { id: string; text: string; from_pos: number; to_pos: number }[];
  unchanged: number;
  warning?: string;
};

export type ConfirmResult = {
  completed: boolean;
  needs_translation: boolean;
  pending_items?: {
    id: string;
    text_known: string;
    text_target: string | null;
    position: number;
  }[];
};

export type GoogleUsageScope = 'translate' | 'tts';

export type GoogleUsageAccountScope = {
  scope: GoogleUsageScope;
  used_units: number;
  request_count: number;
  account_limit: number;
  free_monthly_units: number;
  paused: boolean;
  limit_message?: string | null;
};

export type GoogleUsageGlobalScope = {
  scope: GoogleUsageScope;
  used_units: number;
  request_count: number;
  account_count: number;
  free_monthly_units: number;
};

export type GoogleUsageResponse = {
  period_start: string;
  inspected_user_id: string;
  account: GoogleUsageAccountScope[];
  global?: GoogleUsageGlobalScope[];
};
