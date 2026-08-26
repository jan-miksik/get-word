'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import {
  readAddressRegisterPreference,
  storeAddressRegisterPreference,
} from '@/features/shared/user-preferences/address-register';
import {
  readSalutationGenderPreference,
  storeSalutationGenderPreference,
} from '@/features/shared/user-preferences/salutation-gender';
import { limitKeepingPrimaries } from '../addressFormPairs';
import {
  WordChatApiError,
  commitSession,
  fetchWordChatContext,
  generateAudio,
  requestProposal,
  saveWordChatPreferences,
  sendChatMessageStream,
  translateSelection,
} from '../client/api';
import { forgetClip, prefetchClips, storeClipBytes } from '../client/clip-playback';
import { clearDraft, loadDraft, saveDraft } from '../client/storage';
import type { CallDiagnostics } from '../client/api';
import { personalListName } from '../personal-list-name';
import type {
  CommitResult,
  ProposedItem,
  ReviewItem,
  TakeoverReference,
  WordChatAddressRegister,
  WordChatContentMode,
  WordChatLanguageLevel,
  WordChatMessage,
  WordChatSalutationGender,
} from '../types';
import { hasGenderedSalutation, readLanguageLevel } from '../preferences';

export type WordChatStep = 'chat' | 'select' | 'review' | 'done';

export type WordChatLimits = {
  maxItemsPerSession: number;
  softItemWarningThreshold: number;
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyResetAt: string | null;
};

/**
 * What earlier sessions left behind. Drives the opener: a learner who has done
 * this before gets picked up where they left off instead of the onboarding
 * greeting. Null until the context call answers (or when it fails — the generic
 * opener is a fine fallback).
 */
export type WordChatHistory = {
  hasHistory: boolean;
  goals: string[];
  situations: string[];
  coveredTopics: string[];
  missingTopics: string[];
};

export type WordChatPreferencePatch = {
  addressRegister?: WordChatAddressRegister;
  salutationGender?: WordChatSalutationGender;
  languageLevel?: WordChatLanguageLevel;
};

/** Model routing an editor can override from the debug panel. */
export type WordChatModelSettings = {
  defaults: { chat: string; proposal: string; translation: string };
  selectable: { id: string; inputPricePerMillion: number; outputPricePerMillion: number }[];
};

/** One entry in the debug panel's live log. */
export type WordChatDebugEntry = CallDiagnostics & { at: number };

export type TranslationDiagnostics = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

/**
 * How many failed attempts in a row before the chat gives up and offers the
 * ready-made list instead. One provider hiccup is not an outage; three in a row
 * probably is, and by then the learner has waited long enough.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * How long Save waits for clips that are still being generated. Generous on
 * purpose — a batch of a dozen rows plus its retries is slower than it sounds —
 * but bounded, so a wedged request degrades to "saved without audio" instead of
 * a button that never finishes.
 */
const AUDIO_WAIT_TIMEOUT_MS = 60_000;

/**
 * The review label a manually typed batch is committed under. Not learner-facing
 * (it is a workbench label on the session), so it stays English — and because it
 * is persisted in the draft, it is also what tells a restored session that it was
 * a manual one.
 */
const MANUAL_REVIEW_LABEL = 'Manual entry';

/**
 * Which step to run again after a failure, as data rather than a stored
 * closure: a step can then name itself as its own retry without a
 * self-reference, and `retry` stays an ordinary callback over the steps it
 * dispatches to.
 */
type RetryTarget =
  | { kind: 'chat'; conversation: WordChatMessage[] }
  | { kind: 'propose'; conversation: WordChatMessage[]; contentMode: WordChatContentMode }
  | { kind: 'translate' }
  | { kind: 'commit' };

const DEFAULT_LIMITS: WordChatLimits = {
  maxItemsPerSession: 30,
  softItemWarningThreshold: 15,
  monthlyUsed: 0,
  monthlyLimit: 60,
  monthlyResetAt: null,
};

/** Stable identity for a proposal row, so selection survives reordering. */
function proposalKey(item: ProposedItem): string {
  return item.source === 'corpus' ? `corpus:${item.corpusItemId}` : `gen:${item.draftId ?? item.text}`;
}

/**
 * A multi-word entry is treated as a sentence only when it reads like one; this
 * classification guides proposal/translation semantics but is not shown as a
 * redundant badge in the selection UI.
 */
function classifyCustomItem(text: string): 'sentence' | 'word' {
  return /\s/.test(text) && text.length > 20 ? 'sentence' : 'word';
}

/**
 * Identity of a finished pair, case-insensitively. Used to keep the same word
 * from landing twice when it arrives from two directions — picked off a photo
 * and typed by hand — and to match a Review row back to the photo pair it came
 * from.
 */
function pairKey(item: { textKnown: string; textTarget: string }): string {
  return `${item.textKnown.trim().toLocaleLowerCase()}\u0000${item.textTarget
    .trim()
    .toLocaleLowerCase()}`;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function withDraftIds(items: ProposedItem[]): ProposedItem[] {
  return items.map((item) => (item.draftId ? item : { ...item, draftId: newId() }));
}

function completeTranscript(messages: WordChatMessage[]): WordChatMessage[] {
  return messages
    .filter((message) => !message.incomplete)
    .map((message) => ({ role: message.role, content: message.content }));
}

/** Both identifiers of one generated clip: the id is saved, the hash is played. */
type GeneratedClip = { assetId: string; contentHash: string | null };

type SelectedTranslationItem = {
  kind: 'sentence' | 'word';
  text: string;
  corpusItemId?: string;
  takeoverCandidate?: TakeoverReference;
  audioDisabled?: boolean;
};

/**
 * Joins a translated row back to the item it was submitted as.
 *
 * The server keys its results on the text it received but may return a polished
 * variant of it — capitalisation, collapsed spacing, a sentence's final period.
 * Polishing never rewords, so ignoring exactly those three is enough to match
 * the pair reliably without depending on the response's ordering.
 */
function audioMatchKey(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '');
}

async function generateAudioWithRetries(
  items: { key: string; text: string; language: string }[],
  maxAttempts = 3,
): Promise<Map<string, GeneratedClip>> {
  const assets = new Map<string, GeneratedClip>();
  let pending = [...items];

  for (let attempt = 0; attempt < maxAttempts && pending.length > 0; attempt += 1) {
    const response = await generateAudio({ items: pending }).catch(() => null);
    if (!response) continue;

    const finishedKeys = new Set<string>();
    for (const result of response.results) {
      if (result.status === 'ok' && result.asset_id) {
        assets.set(result.key, {
          assetId: result.asset_id,
          contentHash: result.content_hash,
        });
        // Keep the bytes we were just handed: playing them beats waiting for an
        // Arweave gateway to start serving a clip uploaded seconds ago.
        if (result.content_hash && result.audio_base64) {
          storeClipBytes(result.content_hash, result.audio_base64);
        }
        finishedKeys.add(result.key);
      } else if (result.status === 'skipped') {
        // `skipped` is normally quota exhaustion. Retrying it only burns another
        // request and cannot create a clip.
        finishedKeys.add(result.key);
      }
    }
    if (response.quota_exhausted) break;
    // Explicit errors and keys omitted from a partial response are transient:
    // keep both pending for the next attempt.
    pending = pending.filter((item) => !finishedKeys.has(item.key));
  }

  return assets;
}


export type UseWordChatOptions = {
  languageFrom: string;
  languageTo: string;
  baseListId?: string | null;
  /** Applies an explicit language-pair change requested inside the conversation. */
  onLanguagePairChange?: (pair: { from: string; to: string }) => void | Promise<void>;
  /** Called after a successful commit so the caller can refresh and navigate. */
  onCommitted: (result: {
    listId: string;
    categoryId: string | null;
    itemCount: number;
    takeoverCount: number;
    upgradedTakeoverCount: number;
  }) => void;
  /** In-app only: refresh the learning snapshot after the commit is known saved. */
  refreshAfterCommit?: () => Promise<void>;
  /**
   * Whether this screen is the one the learner is looking at. The in-app
   * "Add words" surface stays mounted behind the study stream, so this is what
   * separates "opened again" from "still here" — the brief is re-read on every
   * return, and never while the screen is parked.
   */
  active?: boolean;
  /**
   * Which way in the learner arrives.
   *
   * `manual` opens straight on the entry step with an empty selection — typing
   * your own words is the plain, free, always-available way to add them, and the
   * conversation is the option you reach for when you want ideas. `chat` is the
   * onboarding route, where the conversation is the point.
   */
  entryStep?: 'chat' | 'manual';
};

export function useWordChat({
  languageFrom,
  languageTo,
  baseListId,
  onLanguagePairChange,
  onCommitted,
  refreshAfterCommit,
  active = true,
  entryStep = 'chat',
}: UseWordChatOptions) {
  const { t, language: uiLanguage } = useI18n();

  const [step, setStep] = useState<WordChatStep>(
    entryStep === 'manual' ? 'select' : 'chat',
  );
  const [messages, setMessages] = useState<WordChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Both address form and salutation gender belong to the learner, not to one
  // chat, so a new session opens with the last choice already selected — seeded
  // from the local cache immediately and reconciled with the server once the
  // context call answers.
  const [addressRegister, setAddressRegister] = useState<WordChatAddressRegister | null>(
    () => readAddressRegisterPreference(),
  );
  const [salutationGender, setSalutationGender] = useState<WordChatSalutationGender | null>(
    () => readSalutationGenderPreference(),
  );
  const [languageLevel, setLanguageLevel] = useState<WordChatLanguageLevel | null>(null);
  const [loadedPreferencesKey, setLoadedPreferencesKey] = useState<string | null>(null);
  const [preferencesSaving, setPreferencesSaving] = useState(false);

  const [proposals, setProposals] = useState<ProposedItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [audioDisabledKeys, setAudioDisabledKeys] = useState<string[]>([]);
  const [customItems, setCustomItems] = useState<{ kind: 'sentence' | 'word'; text: string }[]>([]);
  const [listName, setListName] = useState(() => personalListName(languageFrom, languageTo));
  const [categoryName, setCategoryNameState] = useState(() =>
    entryStep === 'manual' ? t('wordChat.manualCategoryName') : '',
  );
  const categoryNameEditedRef = useRef(false);
  const setCategoryName = useCallback((value: string) => {
    categoryNameEditedRef.current = true;
    setCategoryNameState(value);
  }, []);
  // Separate from the editable category: this stays a concrete description of
  // the conversation even if the learner later renames the category.
  const [topicLabel, setTopicLabel] = useState('');
  const [reviewLabel, setReviewLabel] = useState(() =>
    entryStep === 'manual' ? MANUAL_REVIEW_LABEL : '',
  );
  const [proposedVisibilityAsk, setAskVisibility] = useState(false);
  // Private is the safe default and the one most personal lists want, so it is
  // pre-selected rather than left blank — the learner opts into public, they do
  // not have to answer to get past the step.
  const [isPublic, setIsPublic] = useState<boolean | null>(false);
  const [hasPersonalList, setHasPersonalList] = useState<boolean | null>(null);
  // The already-saved personal list for this pair, when one exists — its id and
  // current visibility are what the share dialog needs. Null until the context
  // call answers, and null throughout for a learner who has none yet.
  const [existingList, setExistingList] = useState<{ id: string; isPublic: boolean } | null>(
    null,
  );
  // Manual entry has no proposal response to carry the server's answer, so the
  // visibility question follows the brief instead: it is asked only once we know
  // there is no personal list yet. Unknown (the brief failed to load) means not
  // asking, and an unanswered list is saved private.
  const [manualEntry, setManualEntry] = useState(entryStep === 'manual');
  // Publishing is editor-only until lists are reviewed before they go public
  // (see `canPublishPublicList`), so for everyone else the question has one
  // possible answer and is not asked at all.
  const [canPublishPublicLists, setCanPublishPublicLists] = useState(false);
  const askVisibility =
    canPublishPublicLists && (manualEntry ? hasPersonalList === false : proposedVisibilityAsk);

  /**
   * Pairs that arrive already translated — today, the words picked off a photo.
   * They share the basket and the Check step with typed and proposed words, but
   * they must never be sent to the translator: the lab has already produced
   * both sides and voiced them, and re-translating would spend the learner's
   * monthly allowance on work that is done.
   */
  const [pretranslatedItems, setPretranslatedItems] = useState<ReviewItem[]>([]);
  const [reviewItems, setReviewItemsState] = useState<ReviewItem[]>([]);
  // A synchronous mirror of `reviewItems`. Saving waits for the audio jobs to
  // finish and then has to read the rows they just wrote; a `useState` value is
  // still the pre-await one at that point, so the commit would post the rows
  // without their fresh `audioAssetId`s and save silent words.
  const reviewItemsRef = useRef<ReviewItem[]>([]);
  const setReviewItems = useCallback(
    (update: ReviewItem[] | ((current: ReviewItem[]) => ReviewItem[])) => {
      const next =
        typeof update === 'function' ? update(reviewItemsRef.current) : update;
      reviewItemsRef.current = next;
      setReviewItemsState(next);
    },
    [],
  );

  // Audio generation started in the background, so Review can open while clips
  // are still being made. Saving awaits whatever is in flight — a row committed
  // before its clip lands is stored without audio and needs a manual repair
  // pass later.
  const audioJobsRef = useRef(new Set<Promise<unknown>>());
  const trackAudioJob = useCallback(<T,>(job: Promise<T>): Promise<T> => {
    const jobs = audioJobsRef.current;
    jobs.add(job);
    void job.catch(() => undefined).finally(() => {
      jobs.delete(job);
    });
    return job;
  }, []);
  /**
   * Resolves once no audio job is running. Jobs can queue further jobs (a retry
   * batch), so the set is drained rather than awaited once. The cap keeps a
   * wedged request from holding the save button hostage forever; passing it
   * falls back to the old behaviour of committing what is voiced so far.
   */
  const waitForAudioJobs = useCallback(async () => {
    const deadline = Date.now() + AUDIO_WAIT_TIMEOUT_MS;
    while (audioJobsRef.current.size > 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.all([...audioJobsRef.current].map((job) => job.catch(() => undefined))),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, remaining);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  }, []);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [refreshStatus, setRefreshStatus] =
    useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  // Which selection the rows in `reviewItems` were produced from. Going Back and
  // straight forward again must not pay for a second translation batch.
  const translatedSignatureRef = useRef<string | null>(null);
  // Keyed by `${textKnown}\u0000${textTarget}`: the two rows of an address-form
  // pair share their source text, so a text-keyed map would show one row's
  // warnings on both.
  const [warningsByPair, setWarningsByPair] = useState<Record<string, string[]>>({});
  const [translationDiagnostics, setTranslationDiagnostics] =
    useState<TranslationDiagnostics | null>(null);

  const [history, setHistory] = useState<WordChatHistory | null>(null);
  const [isEditor, setIsEditor] = useState(false);
  const [modelSettings, setModelSettings] = useState<WordChatModelSettings | null>(null);
  const [modelOverrides, setModelOverrides] = useState<{
    chat: string | null;
    proposal: string | null;
    translation: string | null;
  }>({ chat: null, proposal: null, translation: null });
  const [debugLog, setDebugLog] = useState<WordChatDebugEntry[]>([]);
  const [limits, setLimits] = useState<WordChatLimits>(DEFAULT_LIMITS);
  const [busy, setBusy] = useState<null | 'chat' | 'propose' | 'translate' | 'audio' | 'commit'>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  // What to run again if the learner presses Retry, and how many attempts have
  // failed back to back. Refs, not state: neither belongs in a dependency list,
  // and the count must survive the re-render each failure causes.
  const retryTargetRef = useRef<RetryTarget | null>(null);
  const failureCountRef = useRef(0);
  const activeChatAbortRef = useRef<AbortController | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);

  // One session id and one creation key for the whole flow, held in state (with
  // a lazy initializer) so they are generated once and are honest dependencies.
  // The creation key is what makes commit idempotent, so it must NOT change on a
  // re-render or a retry — only `reset` mints a new one.
  const [sessionId, setSessionId] = useState(newId);
  const [creationKey, setCreationKey] = useState(newId);

  // The interface language, not the study pair's source language. Every other
  // word on this screen — the opener, the chips, the buttons — is rendered from
  // the i18n catalog, so a reply written in `languageFrom` was the one foreign
  // thing on an otherwise Czech (or Ukrainian, or Vietnamese) page whenever the
  // two differed. The learner picked the interface language explicitly; the
  // study pair's source side is a property of the list, not a statement about
  // what they read comfortably.
  const chatLanguage = uiLanguage || languageFrom;
  // The app addresses everyone informally, everywhere, so the chat no longer
  // asks — neither in its opening questions nor in its settings. The stored
  // preference and the server field stay in place; nothing reads them for the
  // chat's own tone any more.
  const addressRegisterApplies = false;
  const salutationGenderApplies = hasGenderedSalutation(chatLanguage);
  const preferencesKey = `${baseListId ?? ''}\u0000${languageFrom}\u0000${languageTo}`;
  const preferencesLoaded = loadedPreferencesKey === preferencesKey;
  const currentLanguageLevel = preferencesLoaded ? languageLevel : null;
  const preferencesComplete = Boolean(
    currentLanguageLevel !== null &&
      (!addressRegisterApplies || addressRegister) &&
      (!salutationGenderApplies || salutationGender),
  );
  const effectiveAddressRegister: WordChatAddressRegister = 'casual';
  const effectiveLanguageLevel: WordChatLanguageLevel = currentLanguageLevel ?? 'A0';

  // Restore an interrupted session once, on mount.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !languageFrom || !languageTo) return;
    restoredRef.current = true;
    const draft = loadDraft(languageFrom, languageTo);
    if (!draft) return;
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time restore from
       localStorage. Reading it in a lazy state initializer instead would make
       the server and client render different markup and break hydration. */
    setSessionId(draft.sessionId);
    setCreationKey(draft.creationKey);
    setStep(draft.step);
    setMessages(completeTranscript(draft.messages));
    // A draft saved before the learner answered must not un-answer it: these
    // two belong to the learner, not to one interrupted session, so the stored
    // preference wins over the draft's blank.
    setAddressRegister(draft.addressRegister ?? readAddressRegisterPreference());
    setSalutationGender(draft.salutationGender ?? readSalutationGenderPreference());
    setLanguageLevel(draft.languageLevel ?? null);
    setProposals(withDraftIds(draft.proposals));
    setSelectedKeys(draft.selectedKeys);
    setCustomItems(draft.customItems);
    setListName(draft.listName || personalListName(languageFrom, languageTo));
    setCategoryNameState(draft.categoryName);
    categoryNameEditedRef.current = draft.categoryNameEdited === true;
    setTopicLabel(draft.topicLabel ?? '');
    setReviewLabel(draft.reviewLabel);
    setManualEntry(draft.reviewLabel === MANUAL_REVIEW_LABEL);
    setReviewItems(draft.reviewItems);
    setPretranslatedItems(draft.pretranslatedItems ?? []);
    setIsPublic(draft.isPublic);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [languageFrom, languageTo, setReviewItems]);

  // Persist after every meaningful change. Cheap, and the alternative is losing
  // a paid-for proposal — or a dozen hand-typed words — to an accidental reload.
  useEffect(() => {
    if (!languageFrom || !languageTo || step === 'done') return;
    if (messages.length === 0 && proposals.length === 0 && customItems.length === 0) return;
    saveDraft(languageFrom, languageTo, {
      sessionId,
      creationKey,
      step,
      messages: completeTranscript(messages),
      addressRegister,
      salutationGender,
      languageLevel: currentLanguageLevel,
      listName,
      categoryName,
      categoryNameEdited: categoryNameEditedRef.current,
      topicLabel,
      reviewLabel,
      proposals,
      selectedKeys,
      customItems,
      pretranslatedItems,
      reviewItems,
      isPublic,
    });
  }, [
    creationKey,
    sessionId,
    languageFrom,
    languageTo,
    step,
    messages,
    addressRegister,
    salutationGender,
    currentLanguageLevel,
    listName,
    categoryName,
    topicLabel,
    reviewLabel,
    proposals,
    selectedKeys,
    customItems,
    pretranslatedItems,
    reviewItems,
    isPublic,
  ]);

  /**
   * A pair change remounts the flow so requests cannot accidentally mix two
   * language directions. Persist the current draft synchronously first and,
   * when the destination pair has no draft of its own, seed it with the
   * learner's conversation and selected source-language text. Corpus
   * references and completed translations are pair-specific, so those are
   * deliberately downgraded/cleared while the actual selection is preserved.
   */
  const stageDraftForLanguagePair = useCallback(
    (
      pair: { from: string; to: string },
      conversation: WordChatMessage[] = messages,
    ) => {
      if (!languageFrom || !languageTo || step === 'done') return;
      const hasWork =
        conversation.length > 0 ||
        proposals.length > 0 ||
        customItems.length > 0 ||
        pretranslatedItems.length > 0 ||
        reviewItems.length > 0;
      if (!hasWork) return;

      const currentMessages = completeTranscript(conversation);
      saveDraft(languageFrom, languageTo, {
        sessionId,
        creationKey,
        step,
        messages: currentMessages,
        addressRegister,
        salutationGender,
        languageLevel: currentLanguageLevel,
        listName,
        categoryName,
        categoryNameEdited: categoryNameEditedRef.current,
        topicLabel,
        reviewLabel,
        proposals,
        selectedKeys,
        customItems,
        pretranslatedItems,
        reviewItems,
        isPublic,
      });

      // Never overwrite another interrupted session for the destination pair.
      if (loadDraft(pair.from, pair.to)) return;

      const selected = new Set(selectedKeys);
      const migratedSelectedKeys: string[] = [];
      const migratedProposals: ProposedItem[] = proposals.map((item) => {
        const migrated: ProposedItem = {
          kind: item.kind,
          source: 'generated',
          text: item.text,
          confidence: item.confidence,
          draftId: item.draftId ?? newId(),
        };
        if (selected.has(proposalKey(item))) {
          migratedSelectedKeys.push(proposalKey(migrated));
        }
        return migrated;
      });

      saveDraft(pair.from, pair.to, {
        sessionId: newId(),
        creationKey: newId(),
        step:
          migratedProposals.length > 0 || customItems.length > 0
            ? 'select'
            : 'chat',
        messages: currentMessages,
        addressRegister,
        salutationGender,
        languageLevel: currentLanguageLevel,
        listName: personalListName(pair.from, pair.to),
        categoryName,
        categoryNameEdited: categoryNameEditedRef.current,
        topicLabel,
        reviewLabel,
        proposals: migratedProposals,
        selectedKeys: migratedSelectedKeys,
        customItems,
        // These rows carry a translation and a clip for the old target language.
        pretranslatedItems: [],
        // These rows contain translations and audio for the previous target.
        reviewItems: [],
        isPublic,
      });
    },
    [
      addressRegister,
      categoryName,
      topicLabel,
      creationKey,
      currentLanguageLevel,
      customItems,
      isPublic,
      languageFrom,
      languageTo,
      listName,
      messages,
      pretranslatedItems,
      proposals,
      reviewItems,
      reviewLabel,
      salutationGender,
      selectedKeys,
      sessionId,
      step,
    ],
  );

  const changeLanguagePair = useCallback(
    async (
      pair: { from: string; to: string },
      conversation: WordChatMessage[] = messages,
    ) => {
      if (
        !onLanguagePairChange ||
        (pair.from === languageFrom && pair.to === languageTo)
      ) {
        return;
      }
      stageDraftForLanguagePair(pair, conversation);
      await onLanguagePairChange(pair);
    },
    [
      languageFrom,
      languageTo,
      messages,
      onLanguagePairChange,
      stageDraftForLanguagePair,
    ],
  );

  // A restored draft lands straight on Review with hashes but no bytes — the
  // session that generated them is gone. Warm those too; already-cached clips
  // cost nothing to ask for.
  useEffect(() => {
    if (step !== 'review' || reviewItems.length === 0) return;
    void prefetchClips(reviewItems.map((row) => row.audioHash));
  }, [step, reviewItems]);

  // Load the brief on every open. No model call, so it costs nothing to ask, and
  // the answer decides whether the learner sees an opener or a follow-up.
  //
  // "Open" is not "mount": the in-app screen stays mounted for the session, so a
  // brief read once would still be the one from before the last batch was saved
  // — and the follow-up chip would keep offering a topic already on the list.
  useEffect(() => {
    if (!active) return;
    if (!languageFrom || !languageTo) return;
    const defaultListName = personalListName(languageFrom, languageTo);
    let cancelled = false;
    void fetchWordChatContext({ languageFrom, languageTo, baseListId })
      .then((context) => {
        if (cancelled) return;
        setHistory({
          hasHistory: context.has_history,
          goals: context.goals,
          situations: context.situations ?? [],
          coveredTopics: context.covered_topics,
          missingTopics: context.missing_topics,
        });
        if (
          context.address_register === 'casual' ||
          context.address_register === 'formal'
        ) {
          setAddressRegister(context.address_register);
          storeAddressRegisterPreference(context.address_register);
        }
        if (
          context.salutation_gender === 'female' ||
          context.salutation_gender === 'male' ||
          context.salutation_gender === 'neutral'
        ) {
          setSalutationGender(context.salutation_gender);
          storeSalutationGenderPreference(context.salutation_gender);
        }
        setLanguageLevel(readLanguageLevel(context.language_level));
        setLimits((current) => ({
          ...current,
          monthlyUsed: context.monthly_used,
          monthlyLimit: context.monthly_limit,
        }));
        const existingListName = context.personal_list_name;
        setHasPersonalList(Boolean(existingListName));
        setExistingList(
          context.personal_list_id
            ? {
                id: context.personal_list_id,
                isPublic: context.personal_list_is_public === true,
              }
            : null,
        );
        if (existingListName) {
          setListName((current) =>
            current === defaultListName ? existingListName : current,
          );
        }
        setCanPublishPublicLists(context.can_publish_public_lists === true);
        setIsEditor(context.is_editor === true);
        setModelSettings(
          context.models
            ? {
                defaults: context.models.defaults,
                selectable: context.models.selectable.map((model) => ({
                  id: model.id,
                  inputPricePerMillion: model.input_price_per_million,
                  outputPricePerMillion: model.output_price_per_million,
                })),
              }
            : null,
        );
      })
      .catch(() => {
        // Context is an optimization, never a gate on starting the chat.
      })
      .finally(() => {
        if (!cancelled) setLoadedPreferencesKey(preferencesKey);
      });
    return () => {
      cancelled = true;
    };
  }, [active, baseListId, languageFrom, languageTo, preferencesKey]);

  // The panel is a log, not a summary: keep every call in order so an editor can
  // see the sequence, not just the total.
  const recordDiagnostics = useCallback((diagnostics: CallDiagnostics | null) => {
    if (!diagnostics) return;
    setDebugLog((current) => [...current, { ...diagnostics, at: Date.now() }]);
  }, []);

  /** A step finished. Forget the retry and start the failure count over. */
  const noteSuccess = useCallback(() => {
    failureCountRef.current = 0;
    retryTargetRef.current = null;
    setCanRetry(false);
  }, []);

  /**
   * A step failed.
   *
   * `target` is the step that failed, ready to run again — the learner's
   * message, selection and paid-for proposal all survive, which is the whole
   * point: a transient provider failure used to throw the session away and
   * offer a ready-made list instead.
   */
  const handleError = useCallback(
    (err: unknown, target?: RetryTarget) => {
      const apiError = err instanceof WordChatApiError ? err : null;
      const terminal = apiError?.isUnavailable === true;
      failureCountRef.current += 1;

      // The server answers in English; the learner is not reading English. Only
      // limit messages (which carry numbers we do not have here) are passed on
      // as-is.
      setError(
        apiError?.isLimitReached
          ? apiError.message
          : terminal
            ? t('wordChat.errorUnavailable')
            : t('wordChat.errorTemporary'),
      );

      const retryable = Boolean(target) && !terminal && !apiError?.isLimitReached;
      retryTargetRef.current = retryable ? (target ?? null) : null;
      setCanRetry(retryable);

      if (terminal || failureCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
        setUnavailable(true);
      }
    },
    [t],
  );

  useEffect(() => {
    return () => {
      activeChatAbortRef.current?.abort();
    };
  }, []);

  const selectedItems = useMemo<SelectedTranslationItem[]>(() => {
    const keys = new Set(selectedKeys);
    const fromProposals = proposals
      .filter((item) => keys.has(proposalKey(item)))
      .filter((item) => item.text.trim().length > 0)
      .map((item) => ({
        kind: item.kind,
        text: item.text.trim().replace(/\s+/g, ' '),
        ...(item.source === 'corpus' ? { corpusItemId: item.corpusItemId } : {}),
        ...(item.source === 'corpus' && item.takeoverCandidate
          ? { takeoverCandidate: item.takeoverCandidate }
          : {}),
        audioDisabled: audioDisabledKeys.includes(proposalKey(item)),
      }));
    return [
      ...fromProposals,
      ...customItems.map((item) => ({
        ...item,
        audioDisabled: audioDisabledKeys.includes(`custom:${item.text}`),
      })),
    ];
  }, [audioDisabledKeys, proposals, selectedKeys, customItems]);

  const translatedSelectionCount = selectedItems.length;
  const selectedCount = translatedSelectionCount + pretranslatedItems.length;
  const overSoftLimit = selectedCount > limits.softItemWarningThreshold;
  const atHardCap = selectedCount >= limits.maxItemsPerSession;
  const monthlyRemaining = Math.max(0, limits.monthlyLimit - limits.monthlyUsed);
  const translationSelectionLimit = Math.min(
    monthlyRemaining,
    Math.max(0, limits.maxItemsPerSession - pretranslatedItems.length),
  );
  const remainingSelections = Math.max(
    0,
    translationSelectionLimit - translatedSelectionCount,
  );
  const overMonthlyLimit = translatedSelectionCount > monthlyRemaining;
  const atSelectionLimit = remainingSelections === 0;

  const proposeMessages = useCallback(async (
    conversation: WordChatMessage[],
    contentMode: WordChatContentMode,
  ) => {
    setBusy('propose');
    try {
      const response = await requestProposal({
        sessionId,
        languageFrom,
        languageTo,
        chatLanguage,
        languageLevel: effectiveLanguageLevel,
        contentMode,
        messages: conversation,
        baseListId,
        model: modelOverrides.proposal,
      });
      noteSuccess();
      recordDiagnostics(response.diagnostics);
      translatedSignatureRef.current = null;
      setProposals(withDraftIds(response.items));
      // Suggestions start neutral. The learner can select individual items or
      // use the explicit select-all action without the UI deciding for them.
      setSelectedKeys([]);
      setAudioDisabledKeys([]);
      // A name explicitly entered in settings wins. Blank and legacy generic
      // fallbacks are replaced by the concrete title generated from this chat.
      if (!categoryNameEditedRef.current) setCategoryNameState(response.category_name);
      setTopicLabel(response.topic_label);
      setReviewLabel(response.review_label);
      setAskVisibility(response.ask_visibility);
      setLimits({
        maxItemsPerSession: response.limits.max_items_per_session,
        softItemWarningThreshold: response.limits.soft_item_warning_threshold,
        monthlyUsed: response.limits.monthly_used,
        monthlyLimit: response.limits.monthly_limit,
        monthlyResetAt: response.limits.monthly_reset_at,
      });
      setStep('select');
    } catch (err) {
      handleError(err, { kind: 'propose', conversation, contentMode });
    } finally {
      // The proposal can run on its own (a retry) or inside a chat turn, so it
      // has to release the spinner itself rather than rely on its caller.
      setBusy(null);
    }
  }, [
    chatLanguage,
    effectiveLanguageLevel,
    baseListId,
    handleError,
    languageFrom,
    languageTo,
    modelOverrides.proposal,
    noteSuccess,
    recordDiagnostics,
    sessionId,
  ]);

  /**
   * One chat turn over an already-complete conversation. Split out from
   * `sendMessage` so a retry re-sends the same turn: the learner's message is
   * already in the transcript, and appending it again would ask the model to
   * answer it twice.
   */
  const runChatTurn = useCallback(async (conversation: WordChatMessage[]) => {
    activeChatAbortRef.current?.abort();
    const controller = new AbortController();
    activeChatAbortRef.current = controller;
    const assistantId = newId();
    activeAssistantIdRef.current = assistantId;
    setBusy('chat');
    setMessages([
      ...conversation,
      { role: 'assistant', content: '', id: assistantId, incomplete: true },
    ]);
    let pendingDelta = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushDelta = () => {
      flushTimer = null;
      if (!pendingDelta || controller.signal.aborted) return;
      const text = pendingDelta;
      pendingDelta = '';
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId && message.incomplete
            ? { ...message, content: `${message.content}${text}` }
            : message,
        ),
      );
    };
    try {
      const response = await sendChatMessageStream({
        sessionId,
        languageFrom,
        languageTo,
        chatLanguage,
        addressRegister: effectiveAddressRegister,
        salutationGender: salutationGenderApplies ? salutationGender : null,
        languageLevel: effectiveLanguageLevel,
        messages: conversation,
        model: modelOverrides.chat,
        signal: controller.signal,
      }, {
        onDelta: (text) => {
          pendingDelta += text;
          if (!flushTimer) flushTimer = setTimeout(flushDelta, 32);
        },
      });
      if (flushTimer) clearTimeout(flushTimer);
      flushDelta();
      noteSuccess();
      recordDiagnostics(response.diagnostics);
      // Same id as the streamed placeholder: the reply keeps its React identity
      // when the parsed text replaces the deltas, so the bubble is updated in
      // place instead of being remounted with the full answer at once.
      const conversationWithReply: WordChatMessage[] = [
        ...conversation,
        // Keep the streamed identity alive for this render. The server may
        // deliver a validated reply in one final chunk; marking it complete in
        // the same React batch made the bubble mount as static text and skip
        // StreamedText's reveal animation entirely.
        { role: 'assistant', content: response.reply, id: assistantId, incomplete: true },
      ];
      setMessages(conversationWithReply);
      const markReplyComplete = () => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, incomplete: undefined } : message,
          ),
        );
      };
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(markReplyComplete);
      } else {
        window.setTimeout(markReplyComplete, 0);
      }
      setSuggestions(response.suggestions);

      if (
        response.language_change &&
        response.metadata_valid &&
        onLanguagePairChange
      ) {
        try {
          await changeLanguagePair(response.language_change, conversationWithReply);
        } catch {
          setError(t('wordChat.languageChangeFailed'));
        }
        return;
      }

      // The model has already decided it knows enough. Continue in the same
      // event-driven request chain instead of bouncing through an effect that
      // synchronously mutates state and can retrigger on unrelated renders.
      if (response.ready_to_propose && response.metadata_valid) {
        if (response.content_mode) {
          await proposeMessages(conversationWithReply, response.content_mode);
        }
      }
    } catch (err) {
      if (flushTimer) clearTimeout(flushTimer);
      flushDelta();
      if (err instanceof WordChatApiError && err.code === 'WORD_CHAT_ABORTED') return;
      handleError(err, { kind: 'chat', conversation });
    } finally {
      if (flushTimer) clearTimeout(flushTimer);
      if (activeAssistantIdRef.current === assistantId) {
        activeAssistantIdRef.current = null;
        activeChatAbortRef.current = null;
      }
      setBusy(null);
    }
  }, [
    chatLanguage,
    effectiveAddressRegister,
    effectiveLanguageLevel,
    handleError,
    languageFrom,
    languageTo,
    modelOverrides.chat,
    noteSuccess,
    changeLanguagePair,
    onLanguagePairChange,
    proposeMessages,
    recordDiagnostics,
    salutationGender,
    salutationGenderApplies,
    sessionId,
    t,
  ]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || !preferencesComplete) return false;
      setError(null);
      const nextMessages: WordChatMessage[] = [
        ...completeTranscript(messages),
        { role: 'user', content: trimmed },
      ];
      setMessages(nextMessages);
      setSuggestions([]);
      await runChatTurn(nextMessages);
      return true;
    },
    [busy, messages, preferencesComplete, runChatTurn],
  );

  const toggleSelected = useCallback(
    (item: ProposedItem) => {
      const key = proposalKey(item);
      setSelectedKeys((current) =>
        current.includes(key)
          ? current.filter((entry) => entry !== key)
          : current.length + customItems.length >= translationSelectionLimit
            ? current
            : [...current, key],
      );
    },
    [customItems.length, translationSelectionLimit],
  );

  const isSelected = useCallback(
    (item: ProposedItem) => selectedKeys.includes(proposalKey(item)),
    [selectedKeys],
  );

  const selectAll = useCallback(() => {
    const available = Math.max(0, translationSelectionLimit - customItems.length);
    setSelectedKeys(proposals.filter((item) => item.text.trim()).slice(0, available).map(proposalKey));
  }, [customItems.length, proposals, translationSelectionLimit]);

  const clearSelection = useCallback(() => {
    setSelectedKeys([]);
  }, []);

  const toggleAudioDisabled = useCallback((key: string) => {
    setAudioDisabledKeys((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
    );
  }, []);

  const updateProposal = useCallback((item: ProposedItem, text: string) => {
    const oldKey = proposalKey(item);
    const draftId = item.draftId ?? newId();
    const nextText = text.slice(0, 200);
    const nextKind: 'sentence' | 'word' =
      /\s/.test(nextText.trim()) && nextText.trim().length > 20 ? 'sentence' : item.kind;
    const nextItem: ProposedItem = {
      kind: nextKind,
      source: 'generated',
      text: nextText,
      confidence: item.confidence,
      draftId,
    };
    const nextKey = proposalKey(nextItem);

    setProposals((current) =>
      current.map((entry) => (proposalKey(entry) === oldKey ? nextItem : entry)),
    );
    setSelectedKeys((current) =>
      current.includes(oldKey)
        ? current.map((entry) => (entry === oldKey ? nextKey : entry))
        : current,
    );
    setAudioDisabledKeys((current) =>
      current.includes(oldKey)
        ? current.map((entry) => (entry === oldKey ? nextKey : entry))
        : current,
    );
  }, []);

  const addCustomItem = useCallback(
    (text: string) => {
      const trimmed = text.trim().replace(/\s+/g, ' ');
      if (!trimmed || atSelectionLimit) return;
      setCustomItems((current) =>
        current.some((entry) => entry.text.toLowerCase() === trimmed.toLowerCase())
          ? current
          : [...current, { kind: classifyCustomItem(trimmed), text: trimmed }],
      );
    },
    [atSelectionLimit],
  );

  /**
   * Words picked off a photo, dropped into the same basket as typed ones.
   *
   * They come with both sides and a clip already, so they skip the translator
   * and wait for the Check step with everything else.
   */
  const addPretranslatedItems = useCallback(
    (incoming: { textKnown: string; textTarget: string; audioHash?: string | null }[]) => {
      setPretranslatedItems((current) => {
        const seen = new Set(current.map(pairKey));
        const next = [...current];
        for (const item of incoming) {
          if (next.length + selectedItems.length >= limits.maxItemsPerSession) break;
          const textKnown = item.textKnown.trim().replace(/\s+/g, ' ');
          const textTarget = item.textTarget.trim().replace(/\s+/g, ' ');
          if (!textKnown || !textTarget) continue;
          const key = pairKey({ textKnown, textTarget });
          if (seen.has(key)) continue;
          seen.add(key);
          next.push({
            kind: classifyCustomItem(textKnown),
            textKnown,
            textTarget,
            // The lab voiced the target side already; the clip is addressed by
            // its content hash, which Save resolves to the stored asset.
            audioHash: item.audioHash ?? null,
            audioAssetId: null,
            audioStatus: item.audioHash ? 'ready' : 'idle',
          });
        }
        return next.length === current.length ? current : next;
      });
    },
    [limits.maxItemsPerSession, selectedItems.length],
  );

  const removePretranslatedItem = useCallback((key: string) => {
    setPretranslatedItems((current) => current.filter((item) => pairKey(item) !== key));
  }, []);

  const removeCustomItem = useCallback((text: string) => {
    setCustomItems((current) => current.filter((entry) => entry.text !== text));
    setAudioDisabledKeys((current) => current.filter((entry) => entry !== `custom:${text}`));
  }, []);

  const startManualEntry = useCallback(() => {
    activeChatAbortRef.current?.abort();
    activeChatAbortRef.current = null;
    activeAssistantIdRef.current = null;
    translatedSignatureRef.current = null;
    setBusy(null);
    setError(null);
    setUnavailable(false);
    setCanRetry(false);
    retryTargetRef.current = null;
    setProposals([]);
    setSelectedKeys([]);
    setAudioDisabledKeys([]);
    if (!categoryName.trim()) setCategoryNameState(t('wordChat.manualCategoryName'));
    setReviewLabel(MANUAL_REVIEW_LABEL);
    setTopicLabel('');
    setManualEntry(true);
    setStep('select');
  }, [categoryName, t]);

  /**
   * Translate everything, then voice it, then show Review. One step from the
   * learner's side — two model-backed calls from ours.
   */
  const continueToReview = useCallback(async (pendingTexts: string[] = []) => {
    // Words still sitting in the entry field count as typed. They are merged
    // here rather than pushed through `addCustomItem` first, because a state
    // update would not have landed by the time this call reads the selection —
    // and nobody should have to press + before Translate for a word that is
    // already on screen.
    const seen = new Set(selectedItems.map((item) => item.text.toLowerCase()));
    const room = Math.max(0, translationSelectionLimit - selectedItems.length);
    const extras: SelectedTranslationItem[] = [];
    for (const raw of pendingTexts) {
      if (extras.length >= room) break;
      const text = raw.trim().replace(/\s+/g, ' ');
      if (!text || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      extras.push({ kind: classifyCustomItem(text), text });
    }
    const itemsToTranslate = [...selectedItems, ...extras];

    if (busy) return;
    if (itemsToTranslate.length === 0 && pretranslatedItems.length === 0) return;
    if (itemsToTranslate.length > monthlyRemaining) return;
    // Rows the learner picked off a photo arrive with both sides written and a
    // clip recorded. They join the Check step as they are — never a second time,
    // and never through the translator.
    const mergePretranslated = (rows: ReviewItem[]): ReviewItem[] => {
      const present = new Set(rows.map(pairKey));
      return [...rows, ...pretranslatedItems.filter((item) => !present.has(pairKey(item)))];
    };

    // A batch that is only photo words has nothing to translate: it is already
    // a finished set of rows, so it goes straight to the Check step.
    if (itemsToTranslate.length === 0) {
      setError(null);
      setReviewItems((current) => mergePretranslated(current));
      setStep('review');
      return;
    }
    // Recorded only once the round is actually going ahead, so a refused one
    // does not leave half-added rows behind.
    if (extras.length > 0) setCustomItems((current) => [...current, ...extras]);
    setError(null);

    // Nothing changed since the last translation: the rows are still valid, so
    // just show them again. Translation is the most expensive call in the flow
    // and a Back-then-Continue is a normal thing to do.
    const signature = JSON.stringify({
      languageFrom,
      languageTo,
      items: itemsToTranslate.map((item) => [
        item.kind,
        item.text,
        'corpusItemId' in item ? item.corpusItemId : null,
        item.audioDisabled === true,
      ]),
    });
    if (signature === translatedSignatureRef.current && reviewItems.length > 0) {
      // Only the photo pairs that are not on the table yet are added; rows the
      // learner already edited or deleted in Check are left exactly as they are.
      setReviewItems((current) => mergePretranslated(current));
      setStep('review');
      return;
    }

    setBusy('translate');
    try {
      const translated = await translateSelection({
        sessionId,
        languageFrom,
        languageTo,
        items: itemsToTranslate,
        model: modelOverrides.translation,
      });
      noteSuccess();
      recordDiagnostics(translated.diagnostics);
      setTranslationDiagnostics({
        model: translated.translation_diagnostics.model,
        inputTokens: translated.translation_diagnostics.input_tokens,
        outputTokens: translated.translation_diagnostics.output_tokens,
        estimatedCostUsd: translated.translation_diagnostics.estimated_cost_usd,
      });

      // Matched by text, never by position: the server drops anything that
      // failed to translate, so the returned rows are a subsequence of what was
      // sent and the indexes no longer line up.
      const mutedKnownTexts = new Set(
        itemsToTranslate
          .filter((item) => item.audioDisabled === true)
          .map((item) => audioMatchKey(item.text)),
      );
      // A row that offers the other form of address becomes TWO review rows.
      // They share a transient group key so the server can re-validate the pair
      // and, only if both survive, mint a persistent group id for them.
      const expanded: ReviewItem[] = [];
      translated.items.forEach((row, sourceIndex) => {
        const audioDisabled = mutedKnownTexts.has(audioMatchKey(row.text_known));
        const primary: ReviewItem = {
          kind: row.kind,
          textKnown: row.text_known,
          textTarget: row.text_target,
          ...(row.corpus_item_id ? { corpusItemId: row.corpus_item_id } : {}),
          ...(row.takeover ? { takeover: row.takeover } : {}),
          audioStatus: row.audio_asset_id ? 'ready' : audioDisabled ? 'idle' : 'pending',
          audioAssetId: row.audio_asset_id,
          audioHash: row.audio_hash,
          knownAudioAssetId: row.known_audio_asset_id,
          audioDisabled,
          ...(row.address_form ? { addressForm: { form: row.address_form } } : {}),
        };

        if (!row.address_alternative) {
          expanded.push(primary);
          return;
        }

        const variantGroupKey = `${sourceIndex}:address`;
        expanded.push({ ...primary, variantGroupKey });
        // The twin says something different, so it cannot borrow the primary's
        // clip, its corpus origin, or its takeover claim — those belong to the
        // exact pair they came from. It gets its own audio from scratch.
        expanded.push({
          kind: row.kind,
          textKnown: row.text_known,
          textTarget: row.address_alternative.text_target,
          audioStatus: audioDisabled ? 'idle' : 'pending',
          audioAssetId: null,
          audioHash: null,
          knownAudioAssetId: row.known_audio_asset_id,
          audioDisabled,
          addressForm: { form: row.address_alternative.address_form },
          variantGroupKey,
        });
      });

      // Only an estimate of what will fit: the server re-applies this over the
      // real monthly balance at commit and is the one that decides.
      const rows = limitKeepingPrimaries(
        expanded,
        Math.min(limits.maxItemsPerSession, monthlyRemaining),
      );

      // Keyed by pair, not by source text: the two rows of a pair share their
      // source text, so a text-keyed map would give both the same warnings.
      setWarningsByPair(
        Object.fromEntries(
          translated.items
            .filter((row) => row.warnings.length > 0)
            .map((row) => [`${row.text_known}\u0000${row.text_target}`, row.warnings]),
        ),
      );
      setReviewItems(mergePretranslated(rows));
      translatedSignatureRef.current = signature;

      // Reused rows arrive already voiced, as a hash pointing at a clip we do
      // not have the bytes for. Start fetching them now, while the remaining
      // rows are still being generated, so Review opens with playable audio
      // instead of a proxy round trip per press.
      void prefetchClips(rows.map((row) => row.audioHash));

      setStep('review');

      // Review does not wait for fresh TTS/storage: the learner can already
      // check translations while clips are generated in the background. Saving
      // does wait (see `commit`), so a row cannot be committed silent. Reused
      // corpus rows usually arrive voiced.
      const needsAudio = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => !row.audioAssetId && !row.audioDisabled);
      if (needsAudio.length > 0) {
        const audioRequests = needsAudio.map(({ row, index }) => ({
          key: String(index),
          text: row.textTarget,
          language: languageTo,
          textKnown: row.textKnown,
          textTarget: row.textTarget,
        }));
        // The tracked job covers the row update too, not just the request:
        // Save reads the rows the moment the job settles, and a promise that
        // resolves one tick before the clips are written in is a promise that
        // resolves too early.
        void trackAudioJob(
          generateAudioWithRetries(
            audioRequests.map(({ key, text, language }) => ({
              key,
              text,
              language,
            })),
          ).then((assets) => {
            setReviewItems((current) =>
              current.map((row) => {
                const request = audioRequests.find(
                  (entry) =>
                    entry.textKnown === row.textKnown && entry.textTarget === row.textTarget,
                );
                const clip = request ? assets.get(request.key) : undefined;
                if (!request || row.audioAssetId) return row;
                return clip
                  ? {
                      ...row,
                      audioStatus: 'ready',
                      audioAssetId: clip.assetId,
                      audioHash: clip.contentHash,
                    }
                  : { ...row, audioStatus: 'failed' };
              }),
            );
          }),
        );
      }
    } catch (err) {
      handleError(err, { kind: 'translate' });
    } finally {
      setBusy(null);
    }
  }, [
    busy,
    handleError,
    setReviewItems,
    trackAudioJob,
    languageFrom,
    languageTo,
    modelOverrides.translation,
    monthlyRemaining,
    noteSuccess,
    pretranslatedItems,
    recordDiagnostics,
    reviewItems.length,
    selectedItems,
    translationSelectionLimit,
    limits.maxItemsPerSession,
    sessionId,
  ]);

  /**
   * Editing the target text invalidates that row's audio — the clip no longer
   * says what the row says. Editing the source leaves it alone.
   *
   * Either edit drops `corpusItemId`. The row was a copy of an existing item;
   * once the learner changes a side of the pair it is their own text, and the
   * link would record a provenance that is no longer true.
   */
  const updateReviewItem = useCallback(
    (index: number, patch: Partial<Pick<ReviewItem, 'textKnown' | 'textTarget'>>) => {
      const original = reviewItemsRef.current[index];
      const editedPairKey =
        original &&
        ((patch.textTarget !== undefined && patch.textTarget !== original.textTarget) ||
          (patch.textKnown !== undefined && patch.textKnown !== original.textKnown))
          ? original.variantGroupKey
          : undefined;
      setReviewItems((current) =>
        current.map((row, rowIndex) => {
          if (rowIndex !== index) {
            if (!editedPairKey || row.variantGroupKey !== editedPairKey) return row;
            const unpaired = { ...row };
            delete unpaired.variantGroupKey;
            return unpaired;
          }
          const targetChanged =
            patch.textTarget !== undefined && patch.textTarget !== row.textTarget;
          const knownChanged =
            patch.textKnown !== undefined && patch.textKnown !== row.textKnown;
          if (targetChanged) forgetClip(row.audioHash);
          const next = {
            ...row,
            ...patch,
            ...(targetChanged
              ? { audioStatus: 'idle' as const, audioAssetId: null, audioHash: null }
              : {}),
          };
          if (targetChanged || knownChanged) {
            delete next.corpusItemId;
            delete next.takeover;
            // The model certified the form and the twin for the old wording,
            // not arbitrary text typed afterwards. The untouched sibling keeps
            // its own truthful label but no longer claims this row as its pair.
            delete next.addressForm;
            delete next.variantGroupKey;
          }
          return next;
        }),
      );
      if (original) {
        setPretranslatedItems((items) =>
          items.map((item) => {
            if (pairKey(item) !== pairKey(original)) return item;
            const targetChanged =
              patch.textTarget !== undefined && patch.textTarget !== item.textTarget;
            return {
              ...item,
              ...patch,
              ...(targetChanged
                ? { audioStatus: 'idle' as const, audioAssetId: null, audioHash: null }
                : {}),
            };
          }),
        );
      }
    },
    [setReviewItems],
  );

  const removeReviewItem = useCallback(
    (index: number) => {
      setReviewItems((current) => {
        const removed = current[index];
        // A photo pair dropped here is dropped from the basket too, or stepping
        // back and continuing would quietly bring it back.
        if (removed) setPretranslatedItems((items) => items.filter((item) => pairKey(item) !== pairKey(removed)));
        return current
          .filter((_, rowIndex) => rowIndex !== index)
          .map((row) => {
            if (!removed?.variantGroupKey || row.variantGroupKey !== removed.variantGroupKey) {
              return row;
            }
            const unpaired = { ...row };
            delete unpaired.variantGroupKey;
            return unpaired;
          });
      });
    },
    [setReviewItems],
  );

  const regenerateAudio = useCallback(
    async (index: number) => {
      const row = reviewItemsRef.current[index];
      if (!row?.textTarget) return;
      setReviewItems((current) =>
        current.map((entry, entryIndex) =>
          entryIndex === index
            ? { ...entry, audioStatus: 'pending', audioDisabled: false }
            : entry,
        ),
      );
      // Tracked like the batch job: an edited row usually means the learner is
      // about to press Save, and that press has to wait for this clip.
      await trackAudioJob(
        (async () => {
          const assets = await generateAudioWithRetries([
            { key: String(index), text: row.textTarget, language: languageTo },
          ]);
          const clip = assets.get(String(index));
          setReviewItems((current) =>
            current.map((entry, entryIndex) =>
              entryIndex === index
                ? clip
                  ? {
                      ...entry,
                      audioStatus: 'ready',
                      audioDisabled: false,
                      audioAssetId: clip.assetId,
                      audioHash: clip.contentHash,
                    }
                  : { ...entry, audioStatus: 'failed', audioDisabled: false }
                : entry,
            ),
          );
        })(),
      );
    },
    [languageTo, setReviewItems, trackAudioJob],
  );

  const commit = useCallback(async () => {
    if (busy || reviewItemsRef.current.length === 0) return;
    setError(null);
    // Clips still being generated are part of the word: committing now would
    // store the rows with a null asset id, and the learner would have to come
    // back later to generate audio for words that were already on their way to
    // having it.
    if (audioJobsRef.current.size > 0) {
      setBusy('audio');
      await waitForAudioJobs();
    }
    setBusy('commit');
    try {
      // A list created by a batch that is only photo words keeps Photo Lab's
      // conservative answer to a question it never asked the learner: those
      // pairs stay out of the editor review queue. Any typed or proposed word
      // in the batch means the word chat's own flow asked, so it opts in as
      // before. An existing list keeps whatever it was created with.
      const rows = reviewItemsRef.current;
      const photoKeys = new Set(pretranslatedItems.map(pairKey));
      const photoOnlyBatch = rows.length > 0 && rows.every((row) => photoKeys.has(pairKey(row)));
      const result = await commitSession({
        creationKey,
        sessionId,
        reviewOptIn: !photoOnlyBatch,
        languageFrom,
        languageTo,
        chatLanguage,
        baseListId: baseListId ?? undefined,
        listName,
        categoryName,
        topicLabel,
        reviewLabel,
        isPublic: isPublic === true,
        items: rows,
        messages: completeTranscript(messages),
      });
      noteSuccess();
      clearDraft(languageFrom, languageTo);
      const savedResult: CommitResult = {
        listId: result.list_id,
        categoryId: result.category_id,
        itemCount: result.item_count,
        takeoverCount: result.takeover_count ?? 0,
        upgradedTakeoverCount: result.upgraded_takeover_count ?? 0,
        alreadyCommitted: result.already_committed,
        monthlyUsed: result.monthly_used,
        monthlyLimit: result.monthly_limit,
      };
      setCommitResult(savedResult);
      setStep('done');
      onCommitted({
        listId: result.list_id,
        categoryId: result.category_id,
        itemCount: result.item_count,
        takeoverCount: result.takeover_count ?? 0,
        upgradedTakeoverCount: result.upgraded_takeover_count ?? 0,
      });
      if (refreshAfterCommit) {
        setRefreshStatus('pending');
        try {
          await refreshAfterCommit();
          setRefreshStatus('success');
        } catch {
          setRefreshStatus('error');
        }
      } else {
        setRefreshStatus('success');
      }
    } catch (err) {
      // Commit is idempotent through `creationKey`, so retrying a failed save
      // cannot produce a second list.
      handleError(err, { kind: 'commit' });
    } finally {
      setBusy(null);
    }
  }, [
    busy,
    baseListId,
    categoryName,
    topicLabel,
    chatLanguage,
    creationKey,
    handleError,
    isPublic,
    languageFrom,
    languageTo,
    listName,
    messages,
    noteSuccess,
    onCommitted,
    pretranslatedItems,
    reviewLabel,
    refreshAfterCommit,
    sessionId,
    waitForAudioJobs,
  ]);

  const retryRefresh = useCallback(async () => {
    if (!refreshAfterCommit || refreshStatus === 'pending') return;
    setRefreshStatus('pending');
    try {
      await refreshAfterCommit();
      setRefreshStatus('success');
    } catch {
      setRefreshStatus('error');
    }
  }, [refreshAfterCommit, refreshStatus]);

  /** Keep the header share control in sync after it changes the saved list. */
  const updateExistingList = useCallback((updated: { id: string; isPublic: boolean }) => {
    setExistingList((current) =>
      current?.id === updated.id ? { ...current, isPublic: updated.isPublic } : current,
    );
  }, []);

  /**
   * Run the failed step again, from wherever the learner already was. Nothing
   * is rebuilt: the same conversation, the same selection, the same rows.
   */
  const retry = useCallback(async () => {
    const target = retryTargetRef.current;
    if (!target) return;
    setError(null);
    setUnavailable(false);
    setCanRetry(false);
    if (target.kind === 'chat') await runChatTurn(target.conversation);
    else if (target.kind === 'propose') await proposeMessages(target.conversation, target.contentMode);
    else if (target.kind === 'translate') await continueToReview();
    else await commit();
  }, [commit, continueToReview, proposeMessages, runChatTurn]);

  const backToSelect = useCallback(() => {
    setStep('select');
    setError(null);
  }, []);

  /**
   * Open the conversation — as a step forward from manual entry, or as a step
   * back from a proposal the learner is done with. Either way the chat takes
   * over the visibility question again, so the manual answer stops applying.
   */
  const openChat = useCallback(() => {
    activeChatAbortRef.current?.abort();
    activeChatAbortRef.current = null;
    activeAssistantIdRef.current = null;
    setManualEntry(false);
    setStep('chat');
    setBusy(null);
    setError(null);
    setUnavailable(false);
    setCanRetry(false);
    retryTargetRef.current = null;
  }, []);

  const reset = useCallback(() => {
    clearDraft(languageFrom, languageTo);
    activeChatAbortRef.current?.abort();
    activeChatAbortRef.current = null;
    activeAssistantIdRef.current = null;
    setSessionId(newId());
    setCreationKey(newId());
    translatedSignatureRef.current = null;
    // Back to whichever door the learner came in by, not always the chat.
    setStep(entryStep === 'manual' ? 'select' : 'chat');
    setManualEntry(entryStep === 'manual');
    setMessages([]);
    setSuggestions([]);
    setProposals([]);
    setSelectedKeys([]);
    setAudioDisabledKeys([]);
    setCustomItems([]);
    setPretranslatedItems([]);
    setListName(personalListName(languageFrom, languageTo));
    categoryNameEditedRef.current = false;
    setCategoryNameState(entryStep === 'manual' ? t('wordChat.manualCategoryName') : '');
    setTopicLabel('');
    setReviewLabel(entryStep === 'manual' ? MANUAL_REVIEW_LABEL : '');
    setAskVisibility(false);
    setIsPublic(false);
    setReviewItems([]);
    setCommitResult(null);
    setRefreshStatus('idle');
    setWarningsByPair({});
    setTranslationDiagnostics(null);
    setLimits(DEFAULT_LIMITS);
    setBusy(null);
    setError(null);
    setUnavailable(false);
    setCanRetry(false);
    retryTargetRef.current = null;
    failureCountRef.current = 0;
  }, [entryStep, languageFrom, languageTo, setReviewItems, t]);

  const savePreferences = useCallback(
    async (patch: WordChatPreferencePatch) => {
      if (patch.addressRegister) {
        setAddressRegister(patch.addressRegister);
        storeAddressRegisterPreference(patch.addressRegister);
      }
      if (patch.salutationGender) {
        setSalutationGender(patch.salutationGender);
        storeSalutationGenderPreference(patch.salutationGender);
      }
      if (patch.languageLevel) setLanguageLevel(patch.languageLevel);
      setPreferencesSaving(true);
      setError(null);
      try {
        await saveWordChatPreferences({
          ...patch,
          languageFrom,
          languageTo,
          baseListId,
        });
      } catch {
        setError(t('wordChat.errorTemporary'));
      } finally {
        setPreferencesSaving(false);
      }
    },
    [baseListId, languageFrom, languageTo, t],
  );

  return {
    step,
    messages,
    suggestions,
    addressRegister,
    salutationGender,
    languageLevel: currentLanguageLevel,
    preferencesComplete,
    preferencesLoading: !preferencesLoaded,
    preferencesSaving,
    addressRegisterApplies,
    salutationGenderApplies,
    savePreferences,
    changeLanguagePair,
    proposals,
    selectedKeys,
    audioDisabledKeys,
    customItems,
    listName,
    setListName,
    categoryName,
    setCategoryName,
    topicLabel,
    askVisibility,
    isPublic,
    setIsPublic,
    existingList,
    updateExistingList,
    reviewItems,
    warningsByPair,
    translationDiagnostics,
    history,
    isEditor,
    modelSettings,
    modelOverrides,
    setModelOverrides,
    debugLog,
    limits,
    selectedCount,
    translatedSelectionCount,
    remainingSelections,
    overSoftLimit,
    atHardCap,
    monthlyRemaining,
    overMonthlyLimit,
    atSelectionLimit,
    busy,
    error,
    unavailable,
    canRetry,
    retry,
    sendMessage,
    toggleSelected,
    toggleAudioDisabled,
    isSelected,
    selectAll,
    clearSelection,
    updateProposal,
    addCustomItem,
    removeCustomItem,
    pretranslatedItems,
    addPretranslatedItems,
    removePretranslatedItem,
    startManualEntry,
    continueToReview,
    updateReviewItem,
    removeReviewItem,
    regenerateAudio,
    commit,
    commitResult,
    refreshStatus,
    retryRefresh,
    openChat,
    backToSelect,
    reset,
    /** The entry step is the manual one and nothing is behind it yet. */
    manualEntry,
    canReturnToChat: entryStep === 'chat' || messages.length > 0,
  };
}
