'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SyncResponse } from '@/lib/sync';
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
  normalizeMemoryHookDisableFromStage,
} from '@/lib/words';

export type Role = 'cz' | 'vi';
export type SettingsLanguage = string;

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
  const [role, setRoleState] = useState<Role>('vi');
  const [showAll, setShowAll] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showCategoryBadges, setShowCategoryBadges] = useState(false);
  const [showPronunciation, setShowPronunciation] = useState(false);
  const [memoryHooksEnabled, setMemoryHooksEnabled] = useState(true);
  const [memoryHooksIntroAnswered, setMemoryHooksIntroAnswered] = useState(false);
  const [memoryHookDisableFromStage, setMemoryHookDisableFromStageState] = useState<number>(
    DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE
  );
  const [settingsLanguage, setSettingsLanguageState] =
    useState<SettingsLanguage>(DEFAULT_SETTINGS_LANGUAGE);
  const [settingsLanguageSelectedAt, setSettingsLanguageSelectedAt] = useState<string | null>(null);
  const [learningLanguageFrom, setLearningLanguageFrom] = useState<string | null>(null);
  const [learningLanguageTo, setLearningLanguageTo] = useState<string | null>(null);
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null>(null);
  const [categoryOrder, setCategoryOrderState] = useState<string[]>([]);

  useEffect(() => {
    if (settingsLanguageSelectedAt) return;
    const detectedLanguage = normalizeSettingsLanguage(getDetectedSettingsLanguage());
    setSettingsLanguageState((current) => (current === detectedLanguage ? current : detectedLanguage));
  }, [settingsLanguageSelectedAt]);

  // Gate sync on hasReceivedServerSnapshot(): without it, a failed initial GET
  // (no session, offline) leaves the local defaults in place, and the next
  // authenticated request would overwrite the user's remote settings with
  // those defaults. The flag flips inside applyServerData once the server
  // payload has been applied, so by the time the user actually changes a
  // preference and re-runs the effect, the gate is open.
  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    if (!hasReceivedServerSnapshot()) return;
    void enqueuePreference('role', role);
  }, [role, isHydrated, isUpdatingFromServerRef]);

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
    setSettingsLanguageState(normalized);
    setSettingsLanguageSelectedAt(new Date().toISOString());
    postTabMessage({
      type: 'preferences_changed',
      patch: {
        settingsLanguage: normalized,
        settingsLanguageSelectedAt: new Date().toISOString(),
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
    if (user.role) setRoleState(user.role);
    setShowEnglish(false);
    setShowCategoryBadges(false);
    setShowPronunciation(false);
    setMemoryHooksEnabled(user.memory_hooks_enabled ?? true);
    setMemoryHooksIntroAnswered(user.memory_hooks_intro_answered ?? false);
    setMemoryHookDisableFromStageState(
      normalizeMemoryHookDisableFromStage(user.memory_hook_disable_from_stage)
    );
    setSettingsLanguageState(
      user.settings_language ? normalizeSettingsLanguage(user.settings_language) : detectedLanguage
    );
    setSettingsLanguageSelectedAt(simulateFirstOpen ? null : user.settings_language_selected_at ?? null);
    setLearningLanguageFrom(simulateLearningOnboarding ? null : user.language_from ?? null);
    setLearningLanguageTo(simulateLearningOnboarding ? null : user.language_to ?? null);
    setOnboardingCompletedAt(simulateLearningOnboarding ? null : user.onboarding_completed_at ?? null);
    const nextCategoryOrder = normalizeCategoryOrderValue(user.category_order);
    setCategoryOrderState((prev) =>
      areStringArraysEqual(prev, nextCategoryOrder) ? prev : nextCategoryOrder
    );
  }, []);

  useEffect(() => {
    return subscribeTabMessages((message) => {
      if (message.type !== 'preferences_changed') return;
      const patch = message.patch;
      if (patch.role === 'cz' || patch.role === 'vi') setRoleState(patch.role);
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
      if (Array.isArray(patch.categoryOrder)) {
        const nextCategoryOrder = normalizeCategoryOrderValue(patch.categoryOrder);
        setCategoryOrderState((prev) =>
          areStringArraysEqual(prev, nextCategoryOrder) ? prev : nextCategoryOrder
        );
      }
      if (typeof patch.settingsLanguage === 'string') {
        setSettingsLanguageState(normalizeSettingsLanguage(patch.settingsLanguage));
      }
      if (typeof patch.settingsLanguageSelectedAt === 'string' || patch.settingsLanguageSelectedAt === null) {
        setSettingsLanguageSelectedAt(patch.settingsLanguageSelectedAt);
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
    memoryHooksEnabled,
    setMemoryHooksEnabled: setMemoryHooksEnabledPreference,
    memoryHooksIntroAnswered,
    setMemoryHooksIntroAnswered: setMemoryHooksIntroAnsweredPreference,
    memoryHookDisableFromStage,
    setMemoryHookDisableFromStage,
    categoryOrder,
    setCategoryOrder,
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
