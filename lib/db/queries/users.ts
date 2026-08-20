import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "../client";
import type { Executor } from "./executor";
import { users, type User, type NewUser } from "../schema";
import {
  normalizeMemoryHookDisableFromStage,
  normalizeStudyNoteMinimizeFromStage,
} from "@/lib/words";
import {
  SyncRevisionConflictError,
  type SyncRevisionDomain,
} from '@/packages/domain/sync/revision';
import {
  normalizeFineTuneConfig,
} from '@/features/learning/fine-tune/config';
import type { FineTuneConfig } from '@/features/learning/fine-tune/types';

const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;

function normalizeSettingsLanguage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!LANGUAGE_CODE_PATTERN.test(trimmed)) return undefined;
  const [base, region] = trimmed.split("-");
  return region ? `${base.toLowerCase()}-${region.toUpperCase()}` : base.toLowerCase();
}

/**
 * A client-reported choice time, or null when the client did not send one.
 * Clamped to now: a device with a fast clock must not be able to park a value
 * in the future and win every later comparison.
 */
function toChoiceDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(Math.min(value, Date.now()));
}

/**
 * True when an incoming choice predates the one already stored, i.e. it is a
 * replay of an op that was queued before the current value was chosen. Equal
 * timestamps apply, so re-sending the same op stays idempotent, and a client
 * that reports no timestamp keeps the old newest-arrival-wins behaviour.
 */
function isStaleChoice(chosenAt: Date | null, storedAt: Date | null | undefined): boolean {
  if (!chosenAt || !storedAt) return false;
  return chosenAt.getTime() < storedAt.getTime();
}

// Get user by ID
export async function getUserById(id: string): Promise<User | null> {
  const results = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return results[0] || null;
}

// Get user by device ID
export async function getUserByDeviceId(deviceId: string): Promise<User | null> {
  const results = await db
    .select()
    .from(users)
    .where(eq(users.deviceId, deviceId))
    .limit(1);
  return results[0] || null;
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  const results = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return results[0] || null;
}

// Get user by Supabase Auth id
export async function getUserBySupabaseAuthId(
  supabaseAuthId: string
): Promise<User | null> {
  const results = await db
    .select()
    .from(users)
    .where(eq(users.supabaseAuthId, supabaseAuthId))
    .limit(1);
  return results[0] || null;
}

// Get or create user by device ID
export async function getOrCreateUserByDeviceId(
  deviceId: string
): Promise<User> {
  const existing = await getUserByDeviceId(deviceId);
  if (existing) return existing;

  const results = await db
    .insert(users)
    .values({ deviceId })
    .returning();
  return results[0];
}

// Create a new user
export async function createUser(user: NewUser): Promise<User> {
  const results = await db.insert(users).values(user).returning();
  return results[0];
}

// Update user display preferences (show_english, show_category_badges, game_score)
export async function updateUserPreferences(
  userId: string,
  prefs: {
    show_english?: boolean;
    show_category_badges?: boolean;
    show_pronunciation?: boolean;
    memory_hooks_enabled?: boolean;
    memory_hooks_intro_answered?: boolean;
    memory_hook_disable_from_stage?: number;
    study_notes_enabled?: boolean;
    review_opt_in?: boolean;
    ai_review_opt_in?: boolean;
    study_note_minimize_from_stage?: number;
    learning_fine_tune?: unknown;
    goal_reminder_enabled?: boolean;
    goal_reminder_local_minutes?: number | null;
    goal_intro_answered?: boolean;
    settings_language?: string;
    language_from?: string | null;
    language_to?: string | null;
    onboarding_completed?: boolean;
    /** See SyncRequest: epoch ms of the client-side choice, for LWW. */
    settings_language_selected_at?: number;
    language_pair_selected_at?: number;
    settings_language_base_revision?: number;
    language_pair_base_revision?: number;
    game_score?: number;
    category_order?: string[];
  }
): Promise<User | null> {
  const updates: {
    showEnglish?: boolean;
    showCategoryBadges?: boolean;
    showPronunciation?: boolean;
    memoryHooksEnabled?: boolean;
    memoryHooksIntroAnswered?: boolean;
    memoryHookDisableFromStage?: number;
    studyNotesEnabled?: boolean;
    reviewOptIn?: boolean;
    aiReviewOptIn?: boolean;
    studyNoteMinimizeFromStage?: number;
    learningFineTune?: FineTuneConfig;
    goalReminderEnabled?: boolean;
    goalReminderLocalMinutes?: number | null;
    goalIntroAnswered?: boolean;
    settingsLanguage?: string;
    settingsLanguageSelectedAt?: Date;
    settingsLanguageRevision?: number | SQL;
    languageFrom?: string | null;
    languageTo?: string | null;
    onboardingCompletedAt?: Date | null;
    languagePairRevision?: number | SQL;
    gameScore?: number;
    categoryOrder?: string[];
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };
  if (prefs.show_english !== undefined) updates.showEnglish = prefs.show_english;
  if (prefs.show_category_badges !== undefined) updates.showCategoryBadges = prefs.show_category_badges;
  if (prefs.show_pronunciation !== undefined) updates.showPronunciation = prefs.show_pronunciation;
  if (prefs.memory_hooks_enabled !== undefined) updates.memoryHooksEnabled = prefs.memory_hooks_enabled;
  if (prefs.memory_hooks_intro_answered !== undefined) {
    updates.memoryHooksIntroAnswered = prefs.memory_hooks_intro_answered;
  }
  if (prefs.memory_hook_disable_from_stage !== undefined) {
    updates.memoryHookDisableFromStage = normalizeMemoryHookDisableFromStage(
      prefs.memory_hook_disable_from_stage
    );
  }
  if (prefs.study_notes_enabled !== undefined) {
    updates.studyNotesEnabled = prefs.study_notes_enabled;
  }
  if (prefs.review_opt_in !== undefined) updates.reviewOptIn = prefs.review_opt_in;
  if (prefs.ai_review_opt_in !== undefined) updates.aiReviewOptIn = prefs.ai_review_opt_in;
  if (prefs.study_note_minimize_from_stage !== undefined) {
    updates.studyNoteMinimizeFromStage = normalizeStudyNoteMinimizeFromStage(
      prefs.study_note_minimize_from_stage
    );
  }
  if (prefs.learning_fine_tune !== undefined) {
    // Normalising server-side too is the point: a hand-edited request must not
    // be able to persist something that later breaks a card render.
    updates.learningFineTune = normalizeFineTuneConfig(prefs.learning_fine_tune);
  }
  if (prefs.goal_reminder_enabled !== undefined) updates.goalReminderEnabled = prefs.goal_reminder_enabled;
  if (prefs.goal_reminder_local_minutes !== undefined) {
    updates.goalReminderLocalMinutes = prefs.goal_reminder_local_minutes;
  }
  if (prefs.goal_intro_answered !== undefined) updates.goalIntroAnswered = prefs.goal_intro_answered;
  const touchesSettingsLanguage = prefs.settings_language !== undefined;
  const touchesLanguagePair =
    prefs.language_from !== undefined ||
    prefs.language_to !== undefined ||
    prefs.onboarding_completed !== undefined;
  // Revision-aware clients never use their wall clock for arbitration. A row
  // read remains only for legacy clients that supplied a choice timestamp but
  // no base revision.
  const needsLegacyRead =
    (touchesSettingsLanguage &&
      prefs.settings_language_base_revision === undefined &&
      prefs.settings_language_selected_at !== undefined) ||
    (touchesLanguagePair &&
      prefs.language_pair_base_revision === undefined &&
      prefs.language_pair_selected_at !== undefined);
  const current = needsLegacyRead
    ? await getUserById(userId)
    : null;

  if (touchesSettingsLanguage) {
    const normalized = normalizeSettingsLanguage(prefs.settings_language);
    const chosenAt = toChoiceDate(prefs.settings_language_selected_at);
    const revisionAuthoritative = prefs.settings_language_base_revision !== undefined;
    if (
      normalized &&
      (revisionAuthoritative || !isStaleChoice(chosenAt, current?.settingsLanguageSelectedAt))
    ) {
      updates.settingsLanguage = normalized;
      updates.settingsLanguageSelectedAt = chosenAt ?? new Date();
      updates.settingsLanguageRevision = sql`${users.settingsLanguageRevision} + 1`;
    }
  }
  const pairChosenAt = toChoiceDate(prefs.language_pair_selected_at);
  // The pair is one decision: from, to and the completion stamp must win or
  // lose together, or a half-applied replay leaves a mismatched pair.
  const pairIsStale =
    touchesLanguagePair &&
    prefs.language_pair_base_revision === undefined &&
    isStaleChoice(pairChosenAt, current?.onboardingCompletedAt);
  if (!pairIsStale) {
    if (touchesLanguagePair) {
      updates.languagePairRevision = sql`${users.languagePairRevision} + 1`;
    }
    if (prefs.language_from !== undefined) {
      const normalized = normalizeSettingsLanguage(prefs.language_from);
      updates.languageFrom = normalized || null;
    }
    if (prefs.language_to !== undefined) {
      const normalized = normalizeSettingsLanguage(prefs.language_to);
      updates.languageTo = normalized || null;
    }
    if (prefs.onboarding_completed !== undefined) {
      updates.onboardingCompletedAt = prefs.onboarding_completed
        ? pairChosenAt ?? new Date()
        : null;
    }
  }
  if (prefs.game_score !== undefined) updates.gameScore = Math.max(0, Math.floor(prefs.game_score));
  if (prefs.category_order !== undefined) {
    const normalized = Array.isArray(prefs.category_order)
      ? prefs.category_order
          .map((c) => String(c).trim())
          .filter((c) => c.length > 0)
      : [];
    updates.categoryOrder = Array.from(new Set(normalized)).slice(0, 500);
  }
  if (Object.keys(updates).length === 1) return getUserById(userId);
  const revisionPredicates = [eq(users.id, userId)];
  // Which domain a zero-row result would mean. Without one of these the `where`
  // is the id alone, so no rows means the user is gone (a deletion racing an
  // in-flight sync) — not a stale revision. Reporting that as a conflict would
  // send the client a 409, which blocks every operation in the batch and, for
  // anything but a preference, leaves it with no recovery but discarding.
  let conflictDomain: SyncRevisionDomain | null = null;
  if (touchesSettingsLanguage && prefs.settings_language_base_revision !== undefined) {
    revisionPredicates.push(
      eq(users.settingsLanguageRevision, prefs.settings_language_base_revision),
    );
    conflictDomain = 'settings_language';
  }
  if (touchesLanguagePair && prefs.language_pair_base_revision !== undefined) {
    revisionPredicates.push(
      eq(users.languagePairRevision, prefs.language_pair_base_revision),
    );
    conflictDomain ??= 'language_pair';
  }
  const results = await db
    .update(users)
    .set(updates)
    .where(and(...revisionPredicates))
    .returning();
  if (results.length === 0) {
    if (conflictDomain) throw new SyncRevisionConflictError(conflictDomain);
    return null;
  }
  return results[0] || null;
}

// --- Merge logic for wallet linking ---

interface ProgressMergeItem {
  stageIndex: number
  knownCount: number
  unknownCount: number
  lastKnownAt: Date | null
  lastUnknownAt: Date | null
  nextDueAt: Date | null
}

export interface MergeInput {
  sourceProgress: Record<string, ProgressMergeItem>
  targetProgress: Record<string, ProgressMergeItem>
  sourceHooks: Record<string, string>
  targetHooks: Record<string, string>
  sourceFilters: string[]
  targetFilters: string[]
}

export interface MergeResult {
  mergedProgress: Record<string, ProgressMergeItem>
  mergedHooks: Record<string, string>
  mergedFilters: string[]
}

/** Pure function: merge two users' data. Highest stageIndex wins per word. */
export function mergeUserData(input: MergeInput): MergeResult {
  const { sourceProgress, targetProgress, sourceHooks, targetHooks, sourceFilters, targetFilters } = input

  // Merge progress: highest stageIndex wins
  const mergedProgress: Record<string, ProgressMergeItem> = { ...targetProgress }
  for (const [wordId, sourceItem] of Object.entries(sourceProgress)) {
    const targetItem = mergedProgress[wordId]
    if (!targetItem || sourceItem.stageIndex > targetItem.stageIndex) {
      mergedProgress[wordId] = sourceItem
    }
  }

  // Merge hooks: target wins on conflict, source fills gaps
  const mergedHooks: Record<string, string> = { ...sourceHooks, ...targetHooks }

  // Merge filters: union
  const mergedFilters = [...new Set([...targetFilters, ...sourceFilters])]

  return { mergedProgress, mergedHooks, mergedFilters }
}

// Update arbitrary user fields
export async function updateUserFields(
  userId: string,
  fields: Partial<Omit<User, 'id' | 'createdAt'>>
): Promise<User | null> {
  const results = await db
    .update(users)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return results[0] || null;
}

// Delete user. Accepts an optional executor so the account-deletion saga can run
// it inside its transaction (cascades to all user-owned personal-data tables).
export async function deleteUser(
  userId: string,
  executor: Executor = db,
): Promise<boolean> {
  const results = await executor
    .delete(users)
    .where(eq(users.id, userId))
    .returning();
  return results.length > 0;
}
