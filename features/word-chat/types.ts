/** A single chat turn. Transcripts are held client-side and never persisted. */
export type WordChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * One proposed study item, in the learner's KNOWN language only. Translation
 * happens later, in one batch, so learner-typed additions travel through the
 * same quality pipeline as model-proposed ones.
 *
 * `corpus` items reference an existing verified item by id rather than repeating
 * its text: asking a model to reproduce a source string verbatim (punctuation
 * included) is fragile, and an id also carries the reviewed translation and the
 * already-generated audio asset across for free.
 */
type ProposedItemBase = {
  kind: "sentence" | "word";
  /** The model's usefulness estimate for THIS learner, 0–1. Drives ranking later. */
  confidence: number;
};

export type ProposedItem = ProposedItemBase &
  (
    | { source: "corpus"; corpusItemId: string; verified: true; text: string }
    | { source: "generated"; text: string }
  );

export type ProposalResult = {
  /** AI-suggested, learner-editable. */
  categoryName: string;
  /**
   * Neutral topic label for the editor review queue. Generated separately from
   * `categoryName` because the learner may rename their category to something
   * personal ("Doctor visit with Anna") and editors must never see that.
   */
  reviewLabel: string;
  items: ProposedItem[];
};

export type ChatTurnResult = {
  reply: string;
  /** Short follow-up suggestions rendered as tappable chips. */
  suggestions: string[];
  /** True once the model has enough to propose; the UI surfaces the button. */
  readyToPropose: boolean;
};

/** A row as it exists during Review: translated, possibly with audio, all draft. */
export type ReviewItem = {
  kind: "sentence" | "word";
  textKnown: string;
  textTarget: string;
  corpusItemId?: string;
  /** Content-addressed audio already in the media pool, if any. */
  audioAssetId?: string | null;
  /**
   * Content hash of that asset. Commit stores the id; the Review step plays the
   * clip through `/api/audio/[hash]`, which only knows how to resolve hashes.
   */
  audioHash?: string | null;
  knownAudioAssetId?: string | null;
};

export type CommitRequest = {
  /**
   * Client-generated idempotency key, stable for the whole session. A reload, a
   * double-click, or a retry with the same key must produce one category and one
   * quota charge.
   */
  creationKey: string;
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  categoryName: string;
  reviewLabel?: string;
  /** Only asked on the first session; ignored once the personal list exists. */
  isPublic?: boolean;
  reviewOptIn?: boolean;
  items: ReviewItem[];
  /** Conversation used to regenerate the brief. Never stored. */
  messages?: WordChatMessage[];
};

export type CommitResult = {
  listId: string;
  categoryId: string;
  itemCount: number;
  /** True when this key had already been committed and nothing new was written. */
  alreadyCommitted: boolean;
  monthlyUsed: number;
  monthlyLimit: number;
};
