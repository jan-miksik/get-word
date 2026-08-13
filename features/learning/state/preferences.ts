'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SyncResponse } from '@/features/sync/contracts';
import { hasReceivedServerSnapshot } from '@/lib/sync';
import { enqueueOp } from '@/lib/local-first/enqueue';
import type { SyncMutationPayload } from '@/features/sync/contracts';
import { postTabMessage, subscribeTabMessages } from '@/lib/tab-sync';
import {
  COMMON_LANGUAGES,
  GOOGLE_TRANSLATE_LANGUAGES,
  getDetectedSettingsLanguage,
  isSimulatedFirstOpenEnabled,
  mergeLanguages,
  normalizeLanguageCode,
} from '@/lib/i18n/languages';
import { BUNDLED_UI_LANGUAGE_CODES } from '@/lib/i18n/messages';
import {
  readPreferredPublicLanguageSelectedAt,
  writePreferredPublicLanguage,
} from '@/lib/i18n/public-language';
import {
  DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE,
  DEFAULT_STUDY_NOTE_MINIMIZE_FROM_STAGE,
  normalizeMemoryHookDisableFromStage,
  normalizeStudyNoteMinimizeFromStage,
} from '@/lib/words';
import {
  isLearningRole,
  type LearningRole,
} from '@/features/learning/state/learningRole';
import {
  readPhotoLabPreference,
  storePhotoLabPreference,
} from '@/features/photo-lab/client/preferences';
import {
  clearPendingLearningLanguagePair,
  readPendingLearningLanguagePair,
  storeLearningLanguagePair,
  storePendingLearningLanguagePair,
  type PendingLearningLanguagePair,
} from '@/features/shared/languages/learningPairStorage';
import { queuePendingLearningLanguagePair } from '@/features/shared/languages/learningPairSync';
import {
  LEARNING_LOCAL_PREFERENCE_KEYS,
  readProgressiveRevealPreference,
  readRevealModePreference,
  readQuickAddPreference,
  readSwipeCardsPreference,
  readTiltGamePreference,
  readTypingAudioPromptPreference,
  readTypingCheckButtonPreference,
  readTypingMobileKeyboardAutoFocusPreference,
  readTypingModePreference,
  readTypingPlayAudioAfterCheckPreference,
  readTypingPrefillPunctuationPreference,
  readTypingWriteInPreference,
  storeLearningLocalPreference,
  type RevealMode,
  type TypingWriteIn,
} from './localPreferences';

export type Role = LearningRole;
export type SettingsLanguage = string;
export type { RevealMode, TypingWriteIn } from './localPreferences';

const DEFAULT_SETTINGS_LANGUAGE = 'en';
const BUNDLED_UI_LANGUAGE_CODE_SET = new Set(
  BUNDLED_UI_LANGUAGE_CODES.map(normalizeLanguageCode),
);
const BUNDLED_UI_LANGUAGES = mergeLanguages(COMMON_LANGUAGES, GOOGLE_TRANSLATE_LANGUAGES)
  .filter((item) => BUNDLED_UI_LANGUAGE_CODE_SET.has(normalizeLanguageCode(item.code)));
const LEARNING_ONBOARDING_COMPLETED_SESSION_KEY = 'get-word-learning-onboarding-completed';

/**
 * The *interface* language, which must have a bundled dictionary — anything
 * else has no messages to render and falls back to English.
 *
 * Not for learning languages: those are the content the learner chose to study
 * and are constrained by what the translation and audio providers support, not
 * by which UI dictionaries happen to ship. Use `normalizeLearningLanguage`.
 */
function normalizeSettingsLanguage(value: unknown): SettingsLanguage {
  const normalized = normalizeLanguageCode(value);
  return BUNDLED_UI_LANGUAGE_CODE_SET.has(normalized)
    ? normalized
    : DEFAULT_SETTINGS_LANGUAGE;
}

/** A learning-pair side: shape and legacy aliases only, never narrowed to the UI bundles. */
function normalizeLearningLanguage(value: unknown): string {
  return normalizeLanguageCode(value);
}

function hasCompletedLearningOnboardingInSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(LEARNING_ONBOARDING_COMPLETED_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markLearningOnboardingCompletedInSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(LEARNING_ONBOARDING_COMPLETED_SESSION_KEY, '1');
  } catch {
    // Storage can be unavailable in privacy modes; server state still persists.
  }
}

function normalizeCategoryOrderValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item).trim())
        .filter(Boolean)
    )
  );
}

function enqueuePreference(field: string, value: unknown, baseRevision?: number): Promise<unknown> {
  return enqueueOp({
    entity: 'preference',
    opType: 'set',
    payload: { field, value, baseRevision },
    legacyPayload: { [field]: value } as unknown as SyncMutationPayload,
  }).catch((e) => console.error(`[usePreferences] enqueue ${field}:`, e));
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export function usePreferences(
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [role, setRoleState] = useState<Role>('knownLanguage');
  const [showAll, setShowAll] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showCategoryBadges, setShowCategoryBadges] = useState(false);
  const [showPronunciation, setShowPronunciation] = useState(false);
  const [progressiveRevealEnabled, setProgressiveRevealEnabled] = useState(
    readProgressiveRevealPreference
  );
  const [revealMode, setRevealMode] = useState<RevealMode>(readRevealModePreference);
  const [swipeCardsEnabled, setSwipeCardsEnabled] = useState(readSwipeCardsPreference);
  const [tiltGameEnabled, setTiltGameEnabled] = useState(readTiltGamePreference);
  const [photoLabEnabled, setPhotoLabEnabled] = useState(readPhotoLabPreference);
  const [quickAddEnabled, setQuickAddEnabled] = useState(readQuickAddPreference);
  const [typingModeEnabled, setTypingModeEnabled] = useState(readTypingModePreference);
  const [typingWriteIn, setTypingWriteIn] = useState<TypingWriteIn>(readTypingWriteInPreference);
  const [typingAudioPromptEnabled, setTypingAudioPromptEnabled] = useState(
    readTypingAudioPromptPreference
  );
  const [typingPrefillPunctuation, setTypingPrefillPunctuation] = useState(
    readTypingPrefillPunctuationPreference
  );
  const [typingMobileKeyboardAutoFocus, setTypingMobileKeyboardAutoFocus] = useState(
    readTypingMobileKeyboardAutoFocusPreference
  );
  const [typingPlayAudioAfterCheck, setTypingPlayAudioAfterCheck] = useState(
    readTypingPlayAudioAfterCheckPreference
  );
  const [typingCheckButtonEnabled, setTypingCheckButtonEnabled] = useState(
    readTypingCheckButtonPreference
  );
  const [memoryHooksEnabled, setMemoryHooksEnabled] = useState(true);
  const [memoryHooksIntroAnswered, setMemoryHooksIntroAnswered] = useState(false);
  const [memoryHookDisableFromStage, setMemoryHookDisableFromStageState] = useState<number>(
    DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE
  );
  const [studyNotesEnabled, setStudyNotesEnabledState] = useState(true);
  const [studyNoteMinimizeFromStage, setStudyNoteMinimizeFromStageState] = useState<number>(
    DEFAULT_STUDY_NOTE_MINIMIZE_FROM_STAGE
  );
  const [settingsLanguage, setSettingsLanguageState] = useState<SettingsLanguage>(() =>
    normalizeSettingsLanguage(getDetectedSettingsLanguage(BUNDLED_UI_LANGUAGES))
  );
  // Seeded from the device mirror, not null. A reload used to forget when the
  // learner last picked their interface language, which made every incoming
  // server value newer by default — including a stale one whose replacement had
  // not synced yet, which is how a saved choice came back overwritten.
  const [settingsLanguageSelectedAt, setSettingsLanguageSelectedAt] = useState<string | null>(
    readPreferredPublicLanguageSelectedAt
  );
  const settingsLanguageSelectedAtRef = useRef<string | null>(null);
  const settingsLanguageRevisionRef = useRef(0);
  useEffect(() => {
    settingsLanguageSelectedAtRef.current = settingsLanguageSelectedAt;
  }, [settingsLanguageSelectedAt]);
  const [learningLanguageFrom, setLearningLanguageFrom] = useState<string | null>(null);
  const [learningLanguageTo, setLearningLanguageTo] = useState<string | null>(null);
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null>(null);
  // A language-pair save stays pending until a server snapshot confirms it.
  // Persisting that intent outside React is essential: Fast Refresh, a page
  // remount or a focus-triggered GET must not resurrect an older server value.
  const learningLanguageFromRef = useRef<string | null>(null);
  const learningLanguageToRef = useRef<string | null>(null);
  const learningPairRevisionMsRef = useRef(0);
  const learningPairServerRevisionRef = useRef(0);
  const pendingLearningPairRef = useRef<PendingLearningLanguagePair | null>(
    readPendingLearningLanguagePair(),
  );
  const [categoryOrder, setCategoryOrderState] = useState<string[]>([]);
  // Server-owned: written by a word-chat commit, never enqueued back as a
  // preference. The client only reads it to order the study stream.
  const [pinnedCategoryIds, setPinnedCategoryIdsState] = useState<string[]>([]);

  useEffect(() => {
    storeLearningLocalPreference(
      LEARNING_LOCAL_PREFERENCE_KEYS.progressiveReveal,
      progressiveRevealEnabled,
    );
  }, [progressiveRevealEnabled]);

  useEffect(() => {
    storeLearningLocalPreference(LEARNING_LOCAL_PREFERENCE_KEYS.revealMode, revealMode);
  }, [revealMode]);

  useEffect(() => {
    storeLearningLocalPreference(LEARNING_LOCAL_PREFERENCE_KEYS.swipeCards, swipeCardsEnabled);
  }, [swipeCardsEnabled]);

  useEffect(() => {
    storeLearningLocalPreference(LEARNING_LOCAL_PREFERENCE_KEYS.tiltGame, tiltGameEnabled);
  }, [tiltGameEnabled]);

  useEffect(() => {
    storePhotoLabPreference(photoLabEnabled);
  }, [photoLabEnabled]);

  useEffect(() => {
    storeLearningLocalPreference(LEARNING_LOCAL_PREFERENCE_KEYS.quickAdd, quickAddEnabled);
  }, [quickAddEnabled]);

  useEffect(() => {
    storeLearningLocalPreference(LEARNING_LOCAL_PREFERENCE_KEYS.typingMode, typingModeEnabled);
  }, [typingModeEnabled]);

  useEffect(() => {
    storeLearningLocalPreference(LEARNING_LOCAL_PREFERENCE_KEYS.typingWriteIn, typingWriteIn);
  }, [typingWriteIn]);

  useEffect(() => {
    storeLearningLocalPreference(
      LEARNING_LOCAL_PREFERENCE_KEYS.typingAudioPrompt,
      typingAudioPromptEnabled,
    );
  }, [typingAudioPromptEnabled]);

  useEffect(() => {
    storeLearningLocalPreference(
      LEARNING_LOCAL_PREFERENCE_KEYS.typingPrefillPunctuation,
      typingPrefillPunctuation,
    );
  }, [typingPrefillPunctuation]);

  useEffect(() => {
    storeLearningLocalPreference(
      LEARNING_LOCAL_PREFERENCE_KEYS.typingMobileKeyboardAutoFocus,
      typingMobileKeyboardAutoFocus,
    );
  }, [typingMobileKeyboardAutoFocus]);

  useEffect(() => {
    storeLearningLocalPreference(
      LEARNING_LOCAL_PREFERENCE_KEYS.typingPlayAudioAfterCheck,
      typingPlayAudioAfterCheck,
    );
  }, [typingPlayAudioAfterCheck]);

  useEffect(() => {
    storeLearningLocalPreference(
      LEARNING_LOCAL_PREFERENCE_KEYS.typingCheckButton,
      typingCheckButtonEnabled,
    );
  }, [typingCheckButtonEnabled]);

  // Gate sync on hasReceivedServerSnapshot(): without it, a failed initial GET
  // (no session, offline) leaves the local defaults in place, and the next
  // authenticated request would overwrite the user's remote settings with
  // those defaults. The flag flips inside applyServerData once the server
  // payload has been applied, so by the time the user actually changes a
  // preference and re-runs the effect, the gate is open.
  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    void enqueuePreference('show_english', showEnglish);
  }, [showEnglish, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    void enqueuePreference('show_category_badges', showCategoryBadges);
  }, [showCategoryBadges, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    void enqueuePreference('show_pronunciation', showPronunciation);
  }, [showPronunciation, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    void enqueuePreference('memory_hooks_enabled', memoryHooksEnabled);
  }, [memoryHooksEnabled, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    void enqueuePreference('memory_hooks_intro_answered', memoryHooksIntroAnswered);
  }, [memoryHooksIntroAnswered, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    void enqueuePreference(
      'memory_hook_disable_from_stage',
      normalizeMemoryHookDisableFromStage(memoryHookDisableFromStage)
    );
  }, [memoryHookDisableFromStage, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    void enqueuePreference('study_notes_enabled', studyNotesEnabled);
  }, [studyNotesEnabled, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    void enqueuePreference(
      'study_note_minimize_from_stage',
      normalizeStudyNoteMinimizeFromStage(studyNoteMinimizeFromStage)
    );
  }, [studyNoteMinimizeFromStage, isHydrated, isUpdatingFromServerRef]);

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    void enqueuePreference('category_order', categoryOrder);
  }, [categoryOrder, isHydrated, isUpdatingFromServerRef]);

  // No effect mirrors `settingsLanguage` to the server. The other preferences
  // above can afford to, because a dropped write only costs a display toggle;
  // this one is the whole interface. Those guards drop the enqueue outright
  // when a background refetch happens to be in flight, or when the boot never
  // reached the server (offline, slow network) — and nothing retries it, so the
  // choice was lost and the next boot restored the old server value. The
  // explicit enqueue in `setSettingsLanguage` is unconditional instead: it is a
  // deliberate user action, and the outbox is durable enough to hold it until
  // the network comes back.

  const setRole = useCallback((newRole: Role) => {
    setRoleState(newRole);
    postTabMessage({ type: 'preferences_changed', patch: { role: newRole } });
  }, []);
  const setShowEnglishPreference = useCallback(() => {
    setShowEnglish(false);
    postTabMessage({ type: 'preferences_changed', patch: { showEnglish: false } });
  }, []);
  const setShowCategoryBadgesPreference = useCallback(() => {
    setShowCategoryBadges(false);
    postTabMessage({ type: 'preferences_changed', patch: { showCategoryBadges: false } });
  }, []);
  const setShowPronunciationPreference = useCallback(() => {
    setShowPronunciation(false);
    postTabMessage({ type: 'preferences_changed', patch: { showPronunciation: false } });
  }, []);
  const setMemoryHooksEnabledPreference = useCallback((value: boolean) => {
    setMemoryHooksEnabled(value);
    postTabMessage({ type: 'preferences_changed', patch: { memoryHooksEnabled: value } });
  }, []);
  const setMemoryHooksIntroAnsweredPreference = useCallback((value: boolean) => {
    setMemoryHooksIntroAnswered(value);
    postTabMessage({
      type: 'preferences_changed',
      patch: { memoryHooksIntroAnswered: value },
    });
  }, []);
  const setMemoryHookDisableFromStage = useCallback((stage: number) => {
    const normalized = normalizeMemoryHookDisableFromStage(stage);
    setMemoryHookDisableFromStageState(normalized);
    postTabMessage({
      type: 'preferences_changed',
      patch: { memoryHookDisableFromStage: normalized },
    });
  }, []);
  const setStudyNotesEnabled = useCallback((value: boolean) => {
    setStudyNotesEnabledState(value);
    postTabMessage({ type: 'preferences_changed', patch: { studyNotesEnabled: value } });
  }, []);
  const setStudyNoteMinimizeFromStage = useCallback((stage: number) => {
    const normalized = normalizeStudyNoteMinimizeFromStage(stage);
    setStudyNoteMinimizeFromStageState(normalized);
    postTabMessage({
      type: 'preferences_changed',
      patch: { studyNoteMinimizeFromStage: normalized },
    });
  }, []);
  const setCategoryOrder = useCallback((order: string[] | ((prev: string[]) => string[])) => {
    setCategoryOrderState((prev) => {
      const rawNext = typeof order === 'function' ? order(prev) : order;
      const next = normalizeCategoryOrderValue(rawNext);
      if (areStringArraysEqual(prev, next)) return prev;
      postTabMessage({ type: 'preferences_changed', patch: { categoryOrder: next } });
      return next;
    });
  }, []);
  const setSettingsLanguage = useCallback((language: string) => {
    const normalized = normalizeSettingsLanguage(language);
    const selectedAt = new Date().toISOString();
    setSettingsLanguageState(normalized);
    setSettingsLanguageSelectedAt(selectedAt);
    // Both mirrors, so a reload knows the choice *and* when it was made before
    // any server snapshot arrives. Without the timestamp the boot comparison
    // starts from zero and the server always wins, even holding an older value.
    writePreferredPublicLanguage(normalized);
    postTabMessage({
      type: 'preferences_changed',
      patch: {
        settingsLanguage: normalized,
        settingsLanguageSelectedAt: selectedAt,
      },
    });
    void enqueuePreference(
      'settings_language',
      normalized,
      settingsLanguageRevisionRef.current,
    );
  }, []);

  const queueLearningLanguagePair = useCallback(
    async (pair: PendingLearningLanguagePair) => {
      await queuePendingLearningLanguagePair(pair);
      if (
        !readPendingLearningLanguagePair() &&
        pendingLearningPairRef.current?.from === pair.from &&
        pendingLearningPairRef.current.to === pair.to
      ) {
        pendingLearningPairRef.current = null;
        const confirmedAtMs = new Date(pair.changedAt).getTime();
        if (Number.isFinite(confirmedAtMs)) {
          learningPairRevisionMsRef.current = Math.max(
            learningPairRevisionMsRef.current,
            confirmedAtMs,
          );
        }
      }
    },
    [],
  );

  const setLearningLanguages = useCallback(
    async (languageFrom: string, languageTo: string) => {
      const pending: PendingLearningLanguagePair = {
        from: normalizeLearningLanguage(languageFrom),
        to: normalizeLearningLanguage(languageTo),
        changedAt: new Date().toISOString(),
        baseRevision: learningPairServerRevisionRef.current,
      };
      pendingLearningPairRef.current = pending;
      storePendingLearningLanguagePair(pending);
      learningLanguageFromRef.current = pending.from;
      learningLanguageToRef.current = pending.to;
      setLearningLanguageFrom(pending.from);
      setLearningLanguageTo(pending.to);
      storeLearningLanguagePair({ from: pending.from, to: pending.to });
      setOnboardingCompletedAt(pending.changedAt);
      markLearningOnboardingCompletedInSession();
      postTabMessage({
        type: 'preferences_changed',
        patch: {
          learningLanguageFrom: pending.from,
          learningLanguageTo: pending.to,
          onboardingCompletedAt: pending.changedAt,
          learningPairPending: true,
        },
      });
      await queueLearningLanguagePair(pending);
    },
    [queueLearningLanguagePair],
  );

  useEffect(() => {
    const pending = pendingLearningPairRef.current;
    if (!pending) return;
    learningLanguageFromRef.current = pending.from;
    learningLanguageToRef.current = pending.to;
    setLearningLanguageFrom(pending.from);
    setLearningLanguageTo(pending.to);
    setOnboardingCompletedAt(pending.changedAt);
    storeLearningLanguagePair({ from: pending.from, to: pending.to });
    void queueLearningLanguagePair(pending);
  }, [queueLearningLanguagePair]);

  const applyServerPreferences = useCallback((user: SyncResponse['user']) => {
    settingsLanguageRevisionRef.current = user.settings_language_revision ?? 0;
    learningPairServerRevisionRef.current = user.language_pair_revision ?? 0;
    const simulateFirstOpen = isSimulatedFirstOpenEnabled();
    const simulateLearningOnboarding =
      simulateFirstOpen && !hasCompletedLearningOnboardingInSession();
    const detectedLanguage = normalizeSettingsLanguage(
      getDetectedSettingsLanguage(BUNDLED_UI_LANGUAGES),
    );
    setShowEnglish(false);
    setShowCategoryBadges(false);
    setShowPronunciation(false);
    setMemoryHooksEnabled(user.memory_hooks_enabled ?? true);
    setMemoryHooksIntroAnswered(user.memory_hooks_intro_answered ?? false);
    setMemoryHookDisableFromStageState(
      normalizeMemoryHookDisableFromStage(user.memory_hook_disable_from_stage)
    );
    setStudyNotesEnabledState(user.study_notes_enabled ?? true);
    setStudyNoteMinimizeFromStageState(
      normalizeStudyNoteMinimizeFromStage(user.study_note_minimize_from_stage)
    );
    const serverSelectedAt = simulateFirstOpen ? null : user.settings_language_selected_at ?? null;
    const localSelectedAt = settingsLanguageSelectedAtRef.current;
    const serverSelectedAtMs = serverSelectedAt ? new Date(serverSelectedAt).getTime() : 0;
    const localSelectedAtMs = localSelectedAt ? new Date(localSelectedAt).getTime() : 0;
    if (serverSelectedAtMs >= localSelectedAtMs) {
      setSettingsLanguageState(
        user.settings_language ? normalizeSettingsLanguage(user.settings_language) : detectedLanguage
      );
      setSettingsLanguageSelectedAt(serverSelectedAt);
    }
    const incomingFrom = simulateLearningOnboarding ? null : user.language_from ?? null;
    const incomingTo = simulateLearningOnboarding ? null : user.language_to ?? null;
    const incomingCompletedAt =
      simulateLearningOnboarding ? null : user.onboarding_completed_at ?? null;
    const incomingRevisionMs = incomingCompletedAt
      ? new Date(incomingCompletedAt).getTime()
      : 0;
    const pendingPair = pendingLearningPairRef.current;
    const conflictsWithPendingPair = Boolean(
      pendingPair &&
        (incomingFrom !== pendingPair.from || incomingTo !== pendingPair.to),
    );
    const confirmsPendingPair = Boolean(
      pendingPair &&
        incomingFrom === pendingPair.from &&
        incomingTo === pendingPair.to,
    );
    // A snapshot the server stamped no earlier than our choice has already seen
    // it — either it is ours, or a newer pair replaced it from another device.
    // Either way the marker's work is done. Without this second exit it could
    // only ever clear on an exact value match, so a pair the server normalized
    // differently (or one a later choice elsewhere superseded) left the marker
    // behind for good, re-queued on every start, overwriting the newer choice.
    const supersedesPendingPair = Boolean(
      pendingPair &&
        incomingRevisionMs > 0 &&
        incomingRevisionMs >= new Date(pendingPair.changedAt).getTime(),
    );
    if (confirmsPendingPair || supersedesPendingPair) {
      pendingLearningPairRef.current = null;
      clearPendingLearningLanguagePair();
    }
    const changesConfirmedPair =
      incomingFrom !== learningLanguageFromRef.current ||
      incomingTo !== learningLanguageToRef.current;
    const predatesConfirmedPair =
      changesConfirmedPair &&
      learningPairRevisionMsRef.current > 0 &&
      (!Number.isFinite(incomingRevisionMs) ||
        incomingRevisionMs < learningPairRevisionMsRef.current);
    if (conflictsWithPendingPair && !supersedesPendingPair && pendingPair) {
      learningLanguageFromRef.current = pendingPair.from;
      learningLanguageToRef.current = pendingPair.to;
      setLearningLanguageFrom(pendingPair.from);
      setLearningLanguageTo(pendingPair.to);
      setOnboardingCompletedAt(pendingPair.changedAt);
      storeLearningLanguagePair({
        from: pendingPair.from,
        to: pendingPair.to,
      });
    } else if (!predatesConfirmedPair) {
      learningLanguageFromRef.current = incomingFrom;
      learningLanguageToRef.current = incomingTo;
      if (Number.isFinite(incomingRevisionMs)) {
        learningPairRevisionMsRef.current = Math.max(
          learningPairRevisionMsRef.current,
          incomingRevisionMs,
        );
      }
      setLearningLanguageFrom(incomingFrom);
      setLearningLanguageTo(incomingTo);
      setOnboardingCompletedAt(incomingCompletedAt);
      storeLearningLanguagePair({
        from: incomingFrom ?? undefined,
        to: incomingTo ?? undefined,
      });
    }
    const nextCategoryOrder = normalizeCategoryOrderValue(user.category_order);
    setCategoryOrderState((prev) =>
      areStringArraysEqual(prev, nextCategoryOrder) ? prev : nextCategoryOrder
    );
    const nextPinned = Array.isArray(user.pinned_category_ids)
      ? user.pinned_category_ids.filter((id): id is string => typeof id === 'string')
      : [];
    setPinnedCategoryIdsState((prev) =>
      areStringArraysEqual(prev, nextPinned) ? prev : nextPinned
    );
  }, []);

  useEffect(() => {
    return subscribeTabMessages((message) => {
      if (message.type !== 'preferences_changed') return;
      const patch = message.patch;
      if (isLearningRole(patch.role)) setRoleState(patch.role);
      if (typeof patch.showEnglish === 'boolean') setShowEnglish(false);
      if (typeof patch.showCategoryBadges === 'boolean') {
        setShowCategoryBadges(false);
      }
      if (typeof patch.showPronunciation === 'boolean') {
        setShowPronunciation(false);
      }
      if (typeof patch.memoryHooksEnabled === 'boolean') {
        setMemoryHooksEnabled(patch.memoryHooksEnabled);
      }
      if (typeof patch.memoryHooksIntroAnswered === 'boolean') {
        setMemoryHooksIntroAnswered(patch.memoryHooksIntroAnswered);
      }
      if (typeof patch.memoryHookDisableFromStage === 'number') {
        setMemoryHookDisableFromStageState(
          normalizeMemoryHookDisableFromStage(patch.memoryHookDisableFromStage)
        );
      }
      if (typeof patch.studyNotesEnabled === 'boolean') {
        setStudyNotesEnabledState(patch.studyNotesEnabled);
      }
      if (typeof patch.studyNoteMinimizeFromStage === 'number') {
        setStudyNoteMinimizeFromStageState(
          normalizeStudyNoteMinimizeFromStage(patch.studyNoteMinimizeFromStage)
        );
      }
      if (Array.isArray(patch.categoryOrder)) {
        const nextCategoryOrder = normalizeCategoryOrderValue(patch.categoryOrder);
        setCategoryOrderState((prev) =>
          areStringArraysEqual(prev, nextCategoryOrder) ? prev : nextCategoryOrder
        );
      }
      const patchSelectedAt =
        typeof patch.settingsLanguageSelectedAt === 'string' || patch.settingsLanguageSelectedAt === null
          ? patch.settingsLanguageSelectedAt
          : undefined;
      const localSelectedAt = settingsLanguageSelectedAtRef.current;
      const patchSelectedAtMs =
        patchSelectedAt && typeof patchSelectedAt === 'string' ? new Date(patchSelectedAt).getTime() : 0;
      const localSelectedAtMsForTab = localSelectedAt ? new Date(localSelectedAt).getTime() : 0;
      if (patchSelectedAt === undefined || patchSelectedAtMs >= localSelectedAtMsForTab) {
        if (typeof patch.settingsLanguage === 'string') {
          setSettingsLanguageState(normalizeSettingsLanguage(patch.settingsLanguage));
        }
        if (patchSelectedAt !== undefined) {
          setSettingsLanguageSelectedAt(patchSelectedAt);
        }
      }
      const patchFrom =
        typeof patch.learningLanguageFrom === 'string'
          ? patch.learningLanguageFrom
          : null;
      const patchTo =
        typeof patch.learningLanguageTo === 'string'
          ? patch.learningLanguageTo
          : null;
      const hasPairPatch =
        Object.hasOwn(patch, 'learningLanguageFrom') &&
        Object.hasOwn(patch, 'learningLanguageTo');
      const pendingFromOtherTab =
        patch.learningPairPending === true &&
        patchFrom &&
        patchTo &&
        typeof patch.onboardingCompletedAt === 'string'
          ? {
              from: patchFrom,
              to: patchTo,
              changedAt: patch.onboardingCompletedAt,
            }
          : null;
      if (pendingFromOtherTab) {
        pendingLearningPairRef.current = pendingFromOtherTab;
        storePendingLearningLanguagePair(pendingFromOtherTab);
      }
      const protectedPending = pendingLearningPairRef.current;
      const pairPatchConflicts =
        hasPairPatch &&
        protectedPending &&
        (patchFrom !== protectedPending.from || patchTo !== protectedPending.to);
      if (hasPairPatch && !pairPatchConflicts) {
        learningLanguageFromRef.current = patchFrom;
        learningLanguageToRef.current = patchTo;
        setLearningLanguageFrom(patchFrom);
        setLearningLanguageTo(patchTo);
        storeLearningLanguagePair({
          from: patchFrom ?? undefined,
          to: patchTo ?? undefined,
        });
      }
      if (
        (typeof patch.onboardingCompletedAt === 'string' ||
          patch.onboardingCompletedAt === null) &&
        !pairPatchConflicts
      ) {
        const patchRevisionMs = patch.onboardingCompletedAt
          ? new Date(patch.onboardingCompletedAt).getTime()
          : 0;
        if (Number.isFinite(patchRevisionMs)) {
          learningPairRevisionMsRef.current = Math.max(
            learningPairRevisionMsRef.current,
            patchRevisionMs,
          );
        }
        setOnboardingCompletedAt(patch.onboardingCompletedAt);
      }
    });
  }, []);

  return {
    role,
    setRole,
    showAll,
    setShowAll,
    showEnglish,
    setShowEnglish: setShowEnglishPreference,
    showCategoryBadges,
    setShowCategoryBadges: setShowCategoryBadgesPreference,
    showPronunciation,
    setShowPronunciation: setShowPronunciationPreference,
    progressiveRevealEnabled,
    setProgressiveRevealEnabled,
    revealMode,
    setRevealMode,
    swipeCardsEnabled,
    setSwipeCardsEnabled,
    tiltGameEnabled,
    setTiltGameEnabled,
    photoLabEnabled,
    setPhotoLabEnabled,
    quickAddEnabled,
    setQuickAddEnabled,
    typingModeEnabled,
    setTypingModeEnabled,
    typingWriteIn,
    setTypingWriteIn,
    typingAudioPromptEnabled,
    setTypingAudioPromptEnabled,
    typingPrefillPunctuation,
    setTypingPrefillPunctuation,
    typingMobileKeyboardAutoFocus,
    setTypingMobileKeyboardAutoFocus,
    typingPlayAudioAfterCheck,
    setTypingPlayAudioAfterCheck,
    typingCheckButtonEnabled,
    setTypingCheckButtonEnabled,
    memoryHooksEnabled,
    setMemoryHooksEnabled: setMemoryHooksEnabledPreference,
    memoryHooksIntroAnswered,
    setMemoryHooksIntroAnswered: setMemoryHooksIntroAnsweredPreference,
    memoryHookDisableFromStage,
    setMemoryHookDisableFromStage,
    studyNotesEnabled,
    setStudyNotesEnabled,
    studyNoteMinimizeFromStage,
    setStudyNoteMinimizeFromStage,
    categoryOrder,
    setCategoryOrder,
    pinnedCategoryIds,
    settingsLanguage,
    settingsLanguageSelectedAt,
    setSettingsLanguage,
    learningLanguageFrom,
    learningLanguageTo,
    onboardingCompletedAt,
    setLearningLanguages,
    applyServerPreferences,
  };
}
