'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { storeAddressRegisterPreference } from '@/features/shared/user-preferences/address-register';
import { hasRegisterDistinction } from '../registerLanguages';
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
  WordChatLanguageLevel,
  WordChatMessage,
  WordChatSalutationGender,
} from '../types';
import { hasGenderedSalutation } from '../preferences';

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
 * Which step to run again after a failure, as data rather than a stored
 * closure: a step can then name itself as its own retry without a
 * self-reference, and `retry` stays an ordinary callback over the steps it
 * dispatches to.
 */
type RetryTarget =
  | { kind: 'chat'; conversation: WordChatMessage[] }
  | { kind: 'propose'; conversation: WordChatMessage[] }
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
};

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
};

export function useWordChat({
  languageFrom,
  languageTo,
  baseListId,
  onCommitted,
  refreshAfterCommit,
}: UseWordChatOptions) {
  const { t, language: uiLanguage } = useI18n();

  const [step, setStep] = useState<WordChatStep>('chat');
  const [messages, setMessages] = useState<WordChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [addressRegister, setAddressRegister] =
    useState<WordChatAddressRegister | null>(null);
  const [salutationGender, setSalutationGender] =
    useState<WordChatSalutationGender | null>(null);
  const [languageLevel, setLanguageLevel] = useState<WordChatLanguageLevel | null>(null);
  const [loadedPreferencesKey, setLoadedPreferencesKey] = useState<string | null>(null);
  const [preferencesSaving, setPreferencesSaving] = useState(false);

  const [proposals, setProposals] = useState<ProposedItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [customItems, setCustomItems] = useState<{ kind: 'sentence' | 'word'; text: string }[]>([]);
  const [listName, setListName] = useState(() => personalListName(languageFrom, languageTo));
  const [categoryName, setCategoryName] = useState('');
  const [reviewLabel, setReviewLabel] = useState('');
  const [askVisibility, setAskVisibility] = useState(false);
  const [isPublic, setIsPublic] = useState<boolean | null>(null);

  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [refreshStatus, setRefreshStatus] =
    useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  // Which selection the rows in `reviewItems` were produced from. Going Back and
  // straight forward again must not pay for a second translation batch.
  const translatedSignatureRef = useRef<string | null>(null);
  const [warningsByKnown, setWarningsByKnown] = useState<Record<string, string[]>>({});
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
  const [busy, setBusy] = useState<null | 'chat' | 'propose' | 'translate' | 'commit'>(null);
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

  const chatLanguage = languageFrom || uiLanguage;
  const addressRegisterApplies = hasRegisterDistinction(chatLanguage);
  const salutationGenderApplies = hasGenderedSalutation(chatLanguage);
  const preferencesKey = `${baseListId ?? ''}\u0000${languageFrom}\u0000${languageTo}`;
  const preferencesLoaded = loadedPreferencesKey === preferencesKey;
  const currentLanguageLevel = preferencesLoaded ? languageLevel : null;
  const preferencesComplete = Boolean(
    currentLanguageLevel !== null &&
      (!addressRegisterApplies || addressRegister) &&
      (!salutationGenderApplies || salutationGender),
  );
  const effectiveAddressRegister: WordChatAddressRegister = addressRegister ?? 'formal';
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
    setAddressRegister(draft.addressRegister ?? null);
    setSalutationGender(draft.salutationGender ?? null);
    setLanguageLevel(draft.languageLevel ?? null);
    setProposals(withDraftIds(draft.proposals));
    setSelectedKeys(draft.selectedKeys);
    setCustomItems(draft.customItems);
    setListName(draft.listName || personalListName(languageFrom, languageTo));
    setCategoryName(draft.categoryName);
    setReviewLabel(draft.reviewLabel);
    setReviewItems(draft.reviewItems);
    setIsPublic(draft.isPublic);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [languageFrom, languageTo]);

  // Persist after every meaningful change. Cheap, and the alternative is losing
  // a paid-for proposal to an accidental reload.
  useEffect(() => {
    if (!languageFrom || !languageTo || step === 'done') return;
    if (messages.length === 0 && proposals.length === 0) return;
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
      reviewLabel,
      proposals,
      selectedKeys,
      customItems,
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
    reviewLabel,
    proposals,
    selectedKeys,
    customItems,
    reviewItems,
    isPublic,
  ]);

  // A restored draft lands straight on Review with hashes but no bytes — the
  // session that generated them is gone. Warm those too; already-cached clips
  // cost nothing to ask for.
  useEffect(() => {
    if (step !== 'review' || reviewItems.length === 0) return;
    void prefetchClips(reviewItems.map((row) => row.audioHash));
  }, [step, reviewItems]);

  // Load the brief once per open. No model call, so it costs nothing to ask, and
  // the answer decides whether the learner sees an opener or a follow-up.
  useEffect(() => {
    if (!languageFrom || !languageTo) return;
    const defaultListName = personalListName(languageFrom, languageTo);
    let cancelled = false;
    void fetchWordChatContext({ languageFrom, languageTo, baseListId })
      .then((context) => {
        if (cancelled) return;
        setHistory({
          hasHistory: context.has_history,
          goals: context.goals,
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
        }
        const savedLanguageLevel =
          context.language_level === 'A0' ||
          context.language_level === 'A1' ||
          context.language_level === 'A2' ||
          context.language_level === 'B1' ||
          context.language_level === 'B2'
            ? context.language_level
            : null;
        setLanguageLevel(savedLanguageLevel);
        setLimits((current) => ({
          ...current,
          monthlyUsed: context.monthly_used,
          monthlyLimit: context.monthly_limit,
        }));
        const existingListName = context.personal_list_name;
        if (existingListName) {
          setListName((current) =>
            current === defaultListName ? existingListName : current,
          );
        }
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
  }, [baseListId, languageFrom, languageTo, preferencesKey]);

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
      }));
    return [...fromProposals, ...customItems];
  }, [proposals, selectedKeys, customItems]);

  const selectedCount = selectedItems.length;
  const overSoftLimit = selectedCount > limits.softItemWarningThreshold;
  const atHardCap = selectedCount >= limits.maxItemsPerSession;
  const monthlyRemaining = Math.max(0, limits.monthlyLimit - limits.monthlyUsed);
  const selectionLimit = Math.min(limits.maxItemsPerSession, monthlyRemaining);
  const overMonthlyLimit = selectedCount > monthlyRemaining;
  const atSelectionLimit = selectedCount >= selectionLimit;

  const proposeMessages = useCallback(async (conversation: WordChatMessage[]) => {
    setBusy('propose');
    try {
      const response = await requestProposal({
        sessionId,
        languageFrom,
        languageTo,
        chatLanguage,
        languageLevel: effectiveLanguageLevel,
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
      setCategoryName(response.category_name);
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
      handleError(err, { kind: 'propose', conversation });
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
      const conversationWithReply: WordChatMessage[] = [
        ...conversation,
        { role: 'assistant', content: response.reply },
      ];
      setMessages(conversationWithReply);
      setSuggestions(response.suggestions);

      // The model has already decided it knows enough. Continue in the same
      // event-driven request chain instead of bouncing through an effect that
      // synchronously mutates state and can retrigger on unrelated renders.
      if (response.ready_to_propose && response.metadata_valid) {
        await proposeMessages(conversationWithReply);
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
    proposeMessages,
    recordDiagnostics,
    salutationGender,
    salutationGenderApplies,
    sessionId,
  ]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || !preferencesComplete) return;
      setError(null);
      const nextMessages: WordChatMessage[] = [
        ...completeTranscript(messages),
        { role: 'user', content: trimmed },
      ];
      setMessages(nextMessages);
      setSuggestions([]);
      await runChatTurn(nextMessages);
    },
    [busy, messages, preferencesComplete, runChatTurn],
  );

  const toggleSelected = useCallback(
    (item: ProposedItem) => {
      const key = proposalKey(item);
      setSelectedKeys((current) =>
        current.includes(key)
          ? current.filter((entry) => entry !== key)
          : current.length + customItems.length >= selectionLimit
            ? current
            : [...current, key],
      );
    },
    [customItems.length, selectionLimit],
  );

  const isSelected = useCallback(
    (item: ProposedItem) => selectedKeys.includes(proposalKey(item)),
    [selectedKeys],
  );

  const selectAll = useCallback(() => {
    const available = Math.max(0, selectionLimit - customItems.length);
    setSelectedKeys(proposals.filter((item) => item.text.trim()).slice(0, available).map(proposalKey));
  }, [customItems.length, proposals, selectionLimit]);

  const clearSelection = useCallback(() => {
    setSelectedKeys([]);
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
  }, []);

  const addCustomItem = useCallback(
    (text: string) => {
      const trimmed = text.trim().replace(/\s+/g, ' ');
      if (!trimmed || atSelectionLimit) return;
      // A multi-word entry is treated as a sentence only when it reads like one;
      // this classification guides proposal/translation semantics but is not
      // shown as a redundant badge in the selection UI.
      const kind: 'sentence' | 'word' = /\s/.test(trimmed) && trimmed.length > 20 ? 'sentence' : 'word';
      setCustomItems((current) =>
        current.some((entry) => entry.text.toLowerCase() === trimmed.toLowerCase())
          ? current
          : [...current, { kind, text: trimmed }],
      );
    },
    [atSelectionLimit],
  );

  const removeCustomItem = useCallback((text: string) => {
    setCustomItems((current) => current.filter((entry) => entry.text !== text));
  }, []);

  /**
   * Translate everything, then voice it, then show Review. One step from the
   * learner's side — two model-backed calls from ours.
   */
  const continueToReview = useCallback(async () => {
    if (busy || selectedItems.length === 0 || overMonthlyLimit) return;
    setError(null);

    // Nothing changed since the last translation: the rows are still valid, so
    // just show them again. Translation is the most expensive call in the flow
    // and a Back-then-Continue is a normal thing to do.
    const signature = JSON.stringify({
      languageFrom,
      languageTo,
      items: selectedItems.map((item) => [
        item.kind,
        item.text,
        'corpusItemId' in item ? item.corpusItemId : null,
      ]),
    });
    if (signature === translatedSignatureRef.current && reviewItems.length > 0) {
      setStep('review');
      return;
    }

    setBusy('translate');
    try {
      const translated = await translateSelection({
        sessionId,
        languageFrom,
        languageTo,
        items: selectedItems,
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

      const rows: ReviewItem[] = translated.items.map((row) => ({
        kind: row.kind,
        textKnown: row.text_known,
        textTarget: row.text_target,
        ...(row.corpus_item_id ? { corpusItemId: row.corpus_item_id } : {}),
        ...(row.takeover ? { takeover: row.takeover } : {}),
        audioStatus: row.audio_asset_id ? 'ready' : 'pending',
        audioAssetId: row.audio_asset_id,
        audioHash: row.audio_hash,
        knownAudioAssetId: row.known_audio_asset_id,
      }));
      setWarningsByKnown(
        Object.fromEntries(
          translated.items
            .filter((row) => row.warnings.length > 0)
            .map((row) => [row.text_known, row.warnings]),
        ),
      );
      setReviewItems(rows);
      translatedSignatureRef.current = signature;

      // Reused rows arrive already voiced, as a hash pointing at a clip we do
      // not have the bytes for. Start fetching them now, while the remaining
      // rows are still being generated, so Review opens with playable audio
      // instead of a proxy round trip per press.
      void prefetchClips(rows.map((row) => row.audioHash));

      setStep('review');

      // Audio is best-effort. Review should not wait for fresh TTS/storage: the
      // learner can already check translations while clips are generated in the
      // background. Reused corpus rows usually arrive voiced.
      const needsAudio = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => !row.audioAssetId);
      if (needsAudio.length > 0) {
        const audioRequests = needsAudio.map(({ row, index }) => ({
          key: String(index),
          text: row.textTarget,
          language: languageTo,
          textKnown: row.textKnown,
          textTarget: row.textTarget,
        }));
        void generateAudioWithRetries(
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
        });
      }
    } catch (err) {
      handleError(err, { kind: 'translate' });
    } finally {
      setBusy(null);
    }
  }, [
    busy,
    handleError,
    languageFrom,
    languageTo,
    modelOverrides.translation,
    noteSuccess,
    overMonthlyLimit,
    recordDiagnostics,
    reviewItems.length,
    selectedItems,
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
      setReviewItems((current) =>
        current.map((row, rowIndex) => {
          if (rowIndex !== index) return row;
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
          }
          return next;
        }),
      );
    },
    [],
  );

  const removeReviewItem = useCallback((index: number) => {
    setReviewItems((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }, []);

  const regenerateAudio = useCallback(
    async (index: number) => {
      const row = reviewItems[index];
      if (!row?.textTarget) return;
      setReviewItems((current) =>
        current.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, audioStatus: 'pending' } : entry,
        ),
      );
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
                  audioAssetId: clip.assetId,
                  audioHash: clip.contentHash,
                }
              : { ...entry, audioStatus: 'failed' }
            : entry,
        ),
      );
    },
    [languageTo, reviewItems],
  );

  const commit = useCallback(async () => {
    if (busy || reviewItems.length === 0) return;
    setError(null);
    setBusy('commit');
    try {
      const result = await commitSession({
        creationKey,
        sessionId,
        languageFrom,
        languageTo,
        baseListId: baseListId ?? undefined,
        listName,
        categoryName,
        reviewLabel,
        isPublic: isPublic === true,
        items: reviewItems,
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
    creationKey,
    handleError,
    isPublic,
    languageFrom,
    languageTo,
    listName,
    messages,
    noteSuccess,
    onCommitted,
    reviewItems,
    reviewLabel,
    refreshAfterCommit,
    sessionId,
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
    else if (target.kind === 'propose') await proposeMessages(target.conversation);
    else if (target.kind === 'translate') await continueToReview();
    else await commit();
  }, [commit, continueToReview, proposeMessages, runChatTurn]);

  const backToSelect = useCallback(() => {
    setStep('select');
    setError(null);
  }, []);

  const backToChat = useCallback(() => {
    activeChatAbortRef.current?.abort();
    activeChatAbortRef.current = null;
    activeAssistantIdRef.current = null;
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
    setStep('chat');
    setMessages([]);
    setSuggestions([]);
    setProposals([]);
    setSelectedKeys([]);
    setCustomItems([]);
    setListName(personalListName(languageFrom, languageTo));
    setCategoryName('');
    setReviewLabel('');
    setAskVisibility(false);
    setIsPublic(null);
    setReviewItems([]);
    setCommitResult(null);
    setRefreshStatus('idle');
    setWarningsByKnown({});
    setTranslationDiagnostics(null);
    setLimits(DEFAULT_LIMITS);
    setBusy(null);
    setError(null);
    setUnavailable(false);
    setCanRetry(false);
    retryTargetRef.current = null;
    failureCountRef.current = 0;
  }, [languageFrom, languageTo]);

  const savePreferences = useCallback(
    async (patch: WordChatPreferencePatch) => {
      if (patch.addressRegister) {
        setAddressRegister(patch.addressRegister);
        storeAddressRegisterPreference(patch.addressRegister);
      }
      if (patch.salutationGender) setSalutationGender(patch.salutationGender);
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
    proposals,
    selectedKeys,
    customItems,
    listName,
    setListName,
    categoryName,
    setCategoryName,
    askVisibility,
    isPublic,
    setIsPublic,
    reviewItems,
    warningsByKnown,
    translationDiagnostics,
    history,
    isEditor,
    modelSettings,
    modelOverrides,
    setModelOverrides,
    debugLog,
    limits,
    selectedCount,
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
    isSelected,
    selectAll,
    clearSelection,
    updateProposal,
    addCustomItem,
    removeCustomItem,
    continueToReview,
    updateReviewItem,
    removeReviewItem,
    regenerateAudio,
    commit,
    commitResult,
    refreshStatus,
    retryRefresh,
    backToChat,
    backToSelect,
    reset,
  };
}
