import { and, desc, eq, gt, lte } from 'drizzle-orm';

import {
  clampGoalDays,
  clampGoalMinutes,
  type StudyGoalState,
  type StudyGoalVersion,
  type StudyPacing,
} from '@/packages/domain/goals/goal';
import { calculateWordGoal } from '@/packages/domain/goals/calibration';
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
  return {
    id: row.id,
    effectiveFromDay: row.effectiveFromDay,
    enabled: row.enabled,
    daysPerWeek: row.goalDaysPerWeek,
    minutesPerDay: row.goalMinutesPerDay,
    wordsPerDay: row.goalWordsPerDay,
    preset: row.goalPreset as StudyGoalVersion['preset'],
    pacing: row.pacing as StudyPacing,
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
    const goalMinutes = clampGoalMinutes(mutation.goal_minutes_per_day);
    const goal = calculateWordGoal(goalMinutes, pacing);
    const values = {
      userId,
      effectiveFromDay,
      enabled: mutation.enabled,
      goalDaysPerWeek: clampGoalDays(mutation.goal_days_per_week),
      goalMinutesPerDay: goalMinutes,
      goalWordsPerDay: goal.goalWords,
      goalPreset: mutation.goal_preset,
      pacing,
      updatedAt: new Date(),
    };
    await tx.insert(userStudyGoalVersions).values(values)
      .onConflictDoUpdate({
        target: [userStudyGoalVersions.userId, userStudyGoalVersions.effectiveFromDay],
        set: {
          enabled: values.enabled,
          goalDaysPerWeek: values.goalDaysPerWeek,
          goalMinutesPerDay: values.goalMinutesPerDay,
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
