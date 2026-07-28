/** A single chat turn. Transcripts are held client-side and never persisted. */
export type WordChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** Client-only id used to attach streaming deltas to the right draft. */
  id?: string;
  /** Client-only marker: partial streamed assistant replies are not sent back. */
  incomplete?: boolean;
};

/** How the assistant addresses the learner in the chat itself. */
export type WordChatAddressRegister = "casual" | "formal";

/** Grammatical form to use when the chat language genders direct address. */
export type WordChatSalutationGender = "female" | "male" | "neutral";

/** Learner's current knowledge of the target language. */
export type WordChatLanguageLevel = "A0" | "A1" | "A2" | "B1" | "B2";

/**
 * One proposed study item, in the learner's KNOWN language only. Translation
 * happens later, in one batch, so learner-typed additions travel through the
 * same quality pipeline as model-proposed ones.
 *
 * The model always writes free text; `corpus` means the server recognized that
 * text as an item the app already holds and snapped it onto that row. The id
 * carries the existing translation and the already-generated audio asset across
 * for free, and `text` is the existing row's spelling, not the model's.
 */
type ProposedItemBase = {
  kind: "sentence" | "word";
  /** The model's usefulness estimate for THIS learner, 0–1. Drives ranking later. */
  confidence: number;
  /** Client-only stable id: generated rows remain selectable while their text is edited. */
  draftId?: string;
};

export type TakeoverReference = {
  sourceItemId: string;
  sourceListName: string;
};

export type ProposedItem = ProposedItemBase &
  (
    | {
        source: "corpus";
        corpusItemId: string;
        /**
         * True when the matched row came from a curated (recommended/common)
         * list, i.e. its translation was reviewed. False means it was reused
         * from an ordinary public list and has not been checked by anyone —
         * recorded rather than blocked, so the reuse rate and its quality can be
         * judged from real sessions.
         */
        verified: boolean;
        text: string;
        /**
         * A study-list match is only a candidate here. Translation may change
         * the target side, so the server confirms the takeover afterwards
         * using the full content key.
         */
        takeoverCandidate?: TakeoverReference;
      }
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
  /**
   * A reversible app action requested explicitly by the learner. The model may
   * suggest words for the current pair, but it may only populate this field
   * when the learner asks to change the known/target languages themselves.
   */
  languageChange: { from: string; to: string } | null;
};

/** A row as it exists during Review: translated, possibly with audio, all draft. */
export type ReviewItem = {
  kind: "sentence" | "word";
  textKnown: string;
  textTarget: string;
  corpusItemId?: string;
  /** Confirmed full-pair match. Commit still revalidates access and content. */
  takeover?: TakeoverReference;
  /**
   * Client-side lifecycle for the Review sound control. It keeps the layout
   * stable while fresh TTS finishes in the background and lets a failed
   * best-effort request stop animating honestly.
   */
  audioStatus?: "idle" | "pending" | "ready" | "failed";
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
  /** Language used for visible chat/brief labels. */
  chatLanguage?: string;
  /** Active non-personal study list, used only for deterministic source priority. */
  baseListId?: string;
  /** Optional custom name for the learner's personal word-chat list. */
  listName?: string;
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
  categoryId: string | null;
  itemCount: number;
  takeoverCount: number;
  upgradedTakeoverCount: number;
  /** True when this key had already been committed and nothing new was written. */
  alreadyCommitted: boolean;
  monthlyUsed: number;
  monthlyLimit: number;
};
