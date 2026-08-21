import { and, desc, eq, gt, lte } from 'drizzle-orm';

import {
  clampGoalDays,
  clampGoalMinutes,
  clampGoalWords,
  type GoalMode,
  type StudyGoalState,
  type StudyGoalVersion,
  type StudyPacing,
} from '@/packages/domain/goals/goal';
import { resolveGoalTargets } from '@/packages/domain/goals/calibration';
import type { StudyGoalMutation } from '@/packages/contracts/src/sync';
import { SyncRevisionConflictError } from '@/packages/domain/sync/revision';
import { normalizeFineTuneConfig } from '@/features/learning/fine-tune/config';
import { normalizeIanaTimezone } from '@/lib/local-day';
import { db } from '../client';
import { userStudyGoalVersions, users } from '../schema';

function dayKeyInTimezone(timezone: string, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
    const year = part('year');
    const month = part('month');
    const day = part('day');
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Invalid zone is not allowed to make a preference write fail.
  }
  return now.toISOString().slice(0, 10);
}

function tomorrowInTimezone(timezone: string, now = new Date()): string {
  const today = dayKeyInTimezone(timezone, now);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function toVersion(row: typeof userStudyGoalVersions.$inferSelect): StudyGoalVersion {
  const mode: GoalMode = row.goalMode === 'words' ? 'words' : 'minutes';
  const pacing = row.pacing as StudyPacing;
  const canonicalMinutes = row.goalMinutesPerDay ?? 10;
  const canonicalNewWords = mode === 'words' ? (row.goalNewWordsPerDay ?? row.goalWordsPerDay ?? 1) : null;
  const resolved = resolveGoalTargets({
    mode,
    minutesPerDay: canonicalMinutes,
    wordsPerDay: row.goalWordsPerDay ?? canonicalNewWords ?? 1,
    newWordsPerDay: canonicalNewWords,
    pacing,
  });
  return {
    id: row.id,
    effectiveFromDay: row.effectiveFromDay,
    enabled: row.enabled,
    mode,
    daysPerWeek: row.goalDaysPerWeek,
    minutesPerDay: resolved.minutesPerDay,
    wordsPerDay: resolved.wordsPerDay,
    newWordsPerDay: canonicalNewWords,
    preset: row.goalPreset as StudyGoalVersion['preset'],
    pacing,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getStudyGoalState(
  userId: string,
  timezone = 'UTC',
  now = new Date(),
): Promise<StudyGoalState> {
  const today = dayKeyInTimezone(timezone, now);
  const [activeRows, pendingRows, userRows] = await Promise.all([
    db.select().from(userStudyGoalVersions)
      .where(and(eq(userStudyGoalVersions.userId, userId), lte(userStudyGoalVersions.effectiveFromDay, today)))
      .orderBy(desc(userStudyGoalVersions.effectiveFromDay)).limit(1),
    db.select().from(userStudyGoalVersions)
      .where(and(eq(userStudyGoalVersions.userId, userId), gt(userStudyGoalVersions.effectiveFromDay, today)))
      .orderBy(userStudyGoalVersions.effectiveFromDay).limit(1),
    db.select({ goalRevision: users.goalRevision }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  return {
    active: activeRows[0] ? toVersion(activeRows[0]) : null,
    pending: pendingRows[0] ? toVersion(pendingRows[0]) : null,
    revision: userRows[0]?.goalRevision ?? 0,
  };
}

/** The version that was effective for an immutable local day. */
export async function getGoalVersionForDay(userId: string, dayKey: string): Promise<StudyGoalVersion | null> {
  const rows = await db.select().from(userStudyGoalVersions)
    .where(and(eq(userStudyGoalVersions.userId, userId), lte(userStudyGoalVersions.effectiveFromDay, dayKey)))
    .orderBy(desc(userStudyGoalVersions.effectiveFromDay)).limit(1);
  return rows[0] ? toVersion(rows[0]) : null;
}

/** Ordered history used to evaluate historical streaks against the version
 * actually in force on each local day, rather than today's settings. */
export async function getStudyGoalVersions(userId: string): Promise<StudyGoalVersion[]> {
  const rows = await db.select().from(userStudyGoalVersions)
    .where(eq(userStudyGoalVersions.userId, userId))
    .orderBy(userStudyGoalVersions.effectiveFromDay);
  return rows.map(toVersion);
}

export async function saveStudyGoal(
  userId: string,
  mutation: StudyGoalMutation,
  baseRevision: number | undefined,
  timezone = 'UTC',
): Promise<StudyGoalState> {
  const safeTimezone = normalizeIanaTimezone(timezone);
  return db.transaction(async (tx) => {
    const [user] = await tx.select({ goalRevision: users.goalRevision })
      .from(users).where(eq(users.id, userId)).limit(1);
    const currentRevision = user?.goalRevision ?? 0;
    if (baseRevision !== undefined && baseRevision !== currentRevision) {
      throw new SyncRevisionConflictError('study_goal');
    }
    const [latest] = await tx.select({ id: userStudyGoalVersions.id })
      .from(userStudyGoalVersions).where(eq(userStudyGoalVersions.userId, userId))
      .orderBy(desc(userStudyGoalVersions.effectiveFromDay)).limit(1);
    const effectiveFromDay = latest ? tomorrowInTimezone(safeTimezone) : dayKeyInTimezone(safeTimezone);
    const pacing: StudyPacing = {
      revealMode: mutation.reveal_mode,
      minigameFrequency: mutation.minigame_frequency,
      fineTune: normalizeFineTuneConfig(mutation.learning_fine_tune),
    };
    const mode: GoalMode = mutation.mode;
    const goalMinutes = mode === 'minutes'
      ? clampGoalMinutes(mutation.goal_minutes_per_day ?? 10)
      : null;
    const goalNewWords = mode === 'words'
      ? clampGoalWords(mutation.goal_new_words_per_day ?? 1)
      : null;
    const goal = resolveGoalTargets({
      mode,
      minutesPerDay: goalMinutes ?? 10,
      wordsPerDay: goalNewWords ?? 1,
      newWordsPerDay: goalNewWords,
      pacing,
    });
    const values = {
      userId,
      effectiveFromDay,
      enabled: mutation.enabled,
      goalMode: mode,
      goalDaysPerWeek: clampGoalDays(mutation.goal_days_per_week),
      goalMinutesPerDay: goalMinutes,
      goalNewWordsPerDay: goalNewWords,
      // Legacy display/history field. New business logic only uses the
      // canonical mode-specific field above.
      goalWordsPerDay: mode === 'minutes' ? goal.wordsPerDay : null,
      goalPreset: mutation.goal_preset,
      pacing,
      updatedAt: new Date(),
    };
    await tx.insert(userStudyGoalVersions).values(values)
      .onConflictDoUpdate({
        target: [userStudyGoalVersions.userId, userStudyGoalVersions.effectiveFromDay],
        set: {
          enabled: values.enabled,
          goalMode: values.goalMode,
          goalDaysPerWeek: values.goalDaysPerWeek,
          goalMinutesPerDay: values.goalMinutesPerDay,
          goalNewWordsPerDay: values.goalNewWordsPerDay,
          goalWordsPerDay: values.goalWordsPerDay,
          goalPreset: values.goalPreset,
          pacing: values.pacing,
          updatedAt: values.updatedAt,
        },
      });
    await tx.update(users).set({
      learningFineTune: pacing.fineTune,
      goalRevision: currentRevision + 1,
      studyPacingSeededAt: new Date(),
      timezone: safeTimezone,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
    const activeRows = await tx.select().from(userStudyGoalVersions)
      .where(and(eq(userStudyGoalVersions.userId, userId), lte(userStudyGoalVersions.effectiveFromDay, dayKeyInTimezone(safeTimezone))))
      .orderBy(desc(userStudyGoalVersions.effectiveFromDay)).limit(1);
    const pendingRows = await tx.select().from(userStudyGoalVersions)
      .where(and(eq(userStudyGoalVersions.userId, userId), gt(userStudyGoalVersions.effectiveFromDay, dayKeyInTimezone(safeTimezone))))
      .orderBy(userStudyGoalVersions.effectiveFromDay).limit(1);
    return {
      active: activeRows[0] ? toVersion(activeRows[0]) : null,
      pending: pendingRows[0] ? toVersion(pendingRows[0]) : null,
      revision: currentRevision + 1,
    };
  });
}
