'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SyncResponse } from '@/features/sync/types';
import { hasReceivedServerSnapshot, syncUserData } from '@/lib/sync';
import { enqueueOp } from '@/lib/local-first/enqueue';
import type { SyncMutationPayload } from '@/features/sync/types';
import { postTabMessage, subscribeTabMessages } from '@/lib/tab-sync';
import {
  getDetectedSettingsLanguage,
  isSimulatedFirstOpenEnabled,
} from '@/lib/i18n/languages';
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
  LEARNING_LOCAL_PREFERENCE_KEYS,
  readProgressiveRevealPreference,
  readRevealModePreference,
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
const LEARNING_ONBOARDING_COMPLETED_SESSION_KEY = 'get-word-learning-onboarding-completed';
function normalizeSettingsLanguage(value: unknown): SettingsLanguage {
  if (typeof value !== 'string') return DEFAULT_SETTINGS_LANGUAGE;
  const trimmed = value.trim();
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(trimmed)) {
    return DEFAULT_SETTINGS_LANGUAGE;
  }
  const [base, region] = trimmed.split('-');
  return region ? `${base.toLowerCase()}-${region.toUpperCase()}` : base.toLowerCase();
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

function enqueuePreference(field: string, value: unknown): Promise<unknown> {
  return enqueueOp({
    entity: 'preference',
    opType: 'set',
    payload: { field, value },
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
    normalizeSettingsLanguage(getDetectedSettingsLanguage())
  );
  const [settingsLanguageSelectedAt, setSettingsLanguageSelectedAt] = useState<string | null>(null);
  const settingsLanguageSelectedAtRef = useRef<string | null>(null);
  useEffect(() => {
    settingsLanguageSelectedAtRef.current = settingsLanguageSelectedAt;
  }, [settingsLanguageSelectedAt]);
  const [learningLanguageFrom, setLearningLanguageFrom] = useState<string | null>(null);
  const [learningLanguageTo, setLearningLanguageTo] = useState<string | null>(null);
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null>(null);
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

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    void enqueuePreference('settings_language', settingsLanguage);
  }, [settingsLanguage, isHydrated, isUpdatingFromServerRef]);

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
    postTabMessage({
      type: 'preferences_changed',
      patch: {
        settingsLanguage: normalized,
        settingsLanguageSelectedAt: selectedAt,
      },
    });
  }, []);

  const setLearningLanguages = useCallback(async (languageFrom: string, languageTo: string) => {
    const normalizedFrom = normalizeSettingsLanguage(languageFrom);
    const normalizedTo = normalizeSettingsLanguage(languageTo);
    const completedAt = new Date().toISOString();
    if (hasReceivedServerSnapshot()) {
      await syncUserData({
        language_from: normalizedFrom,
        language_to: normalizedTo,
        onboarding_completed: true,
      });
    }

    setLearningLanguageFrom(normalizedFrom);
    setLearningLanguageTo(normalizedTo);
    setOnboardingCompletedAt(completedAt);
    markLearningOnboardingCompletedInSession();
    postTabMessage({
      type: 'preferences_changed',
      patch: {
        learningLanguageFrom: normalizedFrom,
        learningLanguageTo: normalizedTo,
        onboardingCompletedAt: completedAt,
      },
    });
  }, []);

  const applyServerPreferences = useCallback((user: SyncResponse['user']) => {
    const simulateFirstOpen = isSimulatedFirstOpenEnabled();
    const simulateLearningOnboarding =
      simulateFirstOpen && !hasCompletedLearningOnboardingInSession();
    const detectedLanguage = normalizeSettingsLanguage(getDetectedSettingsLanguage());
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
    setLearningLanguageFrom(simulateLearningOnboarding ? null : user.language_from ?? null);
    setLearningLanguageTo(simulateLearningOnboarding ? null : user.language_to ?? null);
    setOnboardingCompletedAt(simulateLearningOnboarding ? null : user.onboarding_completed_at ?? null);
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
      if (typeof patch.learningLanguageFrom === 'string' || patch.learningLanguageFrom === null) {
        setLearningLanguageFrom(patch.learningLanguageFrom);
      }
      if (typeof patch.learningLanguageTo === 'string' || patch.learningLanguageTo === null) {
        setLearningLanguageTo(patch.learningLanguageTo);
      }
      if (typeof patch.onboardingCompletedAt === 'string' || patch.onboardingCompletedAt === null) {
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
