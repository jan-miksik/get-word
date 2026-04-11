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
  audioStatus: string;
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
