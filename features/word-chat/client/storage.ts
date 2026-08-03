import type {
  ProposedItem,
  ReviewItem,
  WordChatAddressRegister,
  WordChatLanguageLevel,
  WordChatMessage,
  WordChatSalutationGender,
} from '../types';
import { proposalDifficultyIssue } from '../difficulty';
import { personalListName } from '../personal-list-name';

/**
 * Draft persistence for an in-progress word-chat session.
 *
 * A learner who reloads mid-Review has already paid for a proposal and a
 * translation batch; losing that costs them their work and us the model spend.
 *
 * Versioned and time-limited on purpose: a stale draft from a previous shape of
 * the flow must be discarded rather than half-restored, and an abandoned draft
 * should not resurface days later as a surprise.
 */

const STORAGE_PREFIX = 'get-word-word-chat-draft';
// v5: proposals added CEFR-specific quality guards. The loader selectively
// migrates valid v4 work instead of throwing every paid-for in-progress
// proposal away.
const SCHEMA_VERSION = 5;
const PREVIOUS_SCHEMA_VERSION = 4;
const TTL_MS = 24 * 60 * 60 * 1000;

type WordChatDraftStep = 'chat' | 'select' | 'review';

export type WordChatDraft = {
  version: number;
  savedAt: number;
  sessionId: string;
  creationKey: string;
  step: WordChatDraftStep;
  messages: WordChatMessage[];
  addressRegister: WordChatAddressRegister | null;
  salutationGender: WordChatSalutationGender | null;
  languageLevel: WordChatLanguageLevel | null;
  listName: string;
  categoryName: string;
  /** True only when the learner, rather than the proposal model, named it. */
  categoryNameEdited?: boolean;
  /** Specific AI-derived topic used by the next-session continuation chip. */
  topicLabel?: string;
  reviewLabel: string;
  proposals: ProposedItem[];
  selectedKeys: string[];
  customItems: { kind: 'sentence' | 'word'; text: string }[];
  reviewItems: ReviewItem[];
  isPublic: boolean | null;
};

function storageKey(languageFrom: string, languageTo: string) {
  return `${STORAGE_PREFIX}:${languageFrom}:${languageTo}`;
}

function draftId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function proposalStorageKey(item: ProposedItem): string {
  return item.source === 'corpus'
    ? `corpus:${item.corpusItemId}`
    : `gen:${item.draftId ?? item.text}`;
}

export function loadDraft(
  languageFrom: string,
  languageTo: string,
): WordChatDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(languageFrom, languageTo));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WordChatDraft;
    if (
      parsed?.version !== SCHEMA_VERSION &&
      parsed?.version !== PREVIOUS_SCHEMA_VERSION
    ) {
      return null;
    }
    if (!parsed.savedAt || Date.now() - parsed.savedAt > TTL_MS) {
      clearDraft(languageFrom, languageTo);
      return null;
    }
    if (
      parsed.version === PREVIOUS_SCHEMA_VERSION &&
      parsed.languageLevel &&
      proposalDifficultyIssue({
        level: parsed.languageLevel,
        languageFrom,
        items: parsed.proposals,
      })
    ) {
      clearDraft(languageFrom, languageTo);
      return null;
    }
    return parsed.version === SCHEMA_VERSION
      ? parsed
      : { ...parsed, version: SCHEMA_VERSION };
  } catch {
    return null;
  }
}

export function saveDraft(
  languageFrom: string,
  languageTo: string,
  draft: Omit<WordChatDraft, 'version' | 'savedAt'>,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey(languageFrom, languageTo),
      JSON.stringify({ ...draft, version: SCHEMA_VERSION, savedAt: Date.now() }),
    );
  } catch {
    // A full or blocked localStorage must not break the session in progress.
  }
}

export function clearDraft(languageFrom: string, languageTo: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(languageFrom, languageTo));
  } catch {
    // Ignore: nothing useful to do, and the TTL will expire it anyway.
  }
}

/**
 * Preserve an interrupted selection when another app surface changes the
 * shared language pair. The source-language text remains useful, but corpus
 * matches, translations and audio belong to the old direction and must not be
 * reused for the new one.
 */
export function migrateDraftToLanguagePair(
  sourceFrom: string,
  sourceTo: string,
  targetFrom: string,
  targetTo: string,
): boolean {
  if (
    !sourceFrom ||
    !sourceTo ||
    !targetFrom ||
    !targetTo ||
    (sourceFrom === targetFrom && sourceTo === targetTo)
  ) {
    return false;
  }
  const source = loadDraft(sourceFrom, sourceTo);
  if (!source || loadDraft(targetFrom, targetTo)) return false;

  const selected = new Set(source.selectedKeys);
  const migratedSelectedKeys: string[] = [];
  const migratedProposals: ProposedItem[] = source.proposals.map((item) => {
    const migrated: ProposedItem = {
      kind: item.kind,
      source: 'generated',
      text: item.text,
      confidence: item.confidence,
      draftId: item.draftId ?? draftId(),
    };
    if (selected.has(proposalStorageKey(item))) {
      migratedSelectedKeys.push(proposalStorageKey(migrated));
    }
    return migrated;
  });

  saveDraft(targetFrom, targetTo, {
    ...source,
    sessionId: draftId(),
    creationKey: draftId(),
    step:
      migratedProposals.length > 0 || source.customItems.length > 0
        ? 'select'
        : 'chat',
    listName: personalListName(targetFrom, targetTo),
    proposals: migratedProposals,
    selectedKeys: migratedSelectedKeys,
    reviewItems: [],
  });
  return true;
}
