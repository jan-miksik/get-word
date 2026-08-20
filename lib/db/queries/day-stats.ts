import { and, eq, sql } from 'drizzle-orm';

import { hasStudyGoal } from '@/packages/domain/goals/goal';
import { sessionItemCapFromWordGoal } from '@/packages/domain/goals/calibration';
import { db } from '../client';
import { userDayStats } from '../schema';
import { getLocalDayActivity } from './activity-stats';
import { getGoalVersionForDay } from './study-goals';

export async function recomputeUserDayStat(userId: string, dayKey: string, timezone: string): Promise<void> {
  const [goal, activity, reviewRows] = await Promise.all([
    getGoalVersionForDay(userId, dayKey),
    getLocalDayActivity(userId, timezone, dayKey, dayKey),
    db.execute(sql`
      SELECT count(DISTINCT coalesce(word_list_item_id::text, word_id))::int AS words,
             min(client_created_at) AS first_activity_at,
             max(client_created_at) AS last_activity_at
      FROM review_events
      WHERE user_id = ${userId}::uuid
        AND coalesce(local_day_key::text, (client_created_at AT TIME ZONE ${timezone})::date::text) = ${dayKey}
    `),
  ]);
  const currentActivity = activity[0];
  const review = (reviewRows as unknown as Record<string, unknown>[])[0] ?? {};
  const activeMs = currentActivity?.creditedMs ?? 0;
  const answeredWords = Number(review.words ?? 0);
  const enabled = hasStudyGoal(goal);
  // A day is earned by finishing the planned session, which is `sessionItems`
  // words long. The clock stays as the safety net for the learner who simply
  // has not got that many words to study yet: they put the time in, so the day
  // counts. `wordsPerDay` is no longer a threshold of its own — it always sat
  // above the session length, so it could only ever fire after the session was
  // already over.
  const sessionItems = goal ? sessionItemCapFromWordGoal(goal.wordsPerDay) : 0;
  const met = enabled && goal !== null && (
    answeredWords >= sessionItems || activeMs >= goal.minutesPerDay * 60_000
  );
  const firstActivityAt = review.first_activity_at ? new Date(String(review.first_activity_at)) : null;
  const lastActivityAt = review.last_activity_at ? new Date(String(review.last_activity_at)) : null;
  await db.insert(userDayStats).values({
    userId, dayKey, timezone, activeMs, answeredWords,
    goalVersionId: goal?.id ?? null,
    goalDaysPerWeek: goal?.daysPerWeek ?? null,
    goalMinutes: goal?.minutesPerDay ?? null,
    goalWords: goal?.wordsPerDay ?? null,
    met,
    firstActivityAt,
    lastActivityAt,
    computedAt: new Date(),
  }).onConflictDoUpdate({
    target: [userDayStats.userId, userDayStats.dayKey],
    set: {
      activeMs, answeredWords,
      // A day stat is its own historical snapshot. Later recomputes update
      // measurements only; goals and an earned completion never move backward.
      // The one exception is filling an empty snapshot when the learner creates
      // their first goal after today's placeholder row was already self-healed.
      timezone: sql`case when ${userDayStats.goalVersionId} is null and ${goal?.id ?? null}::uuid is not null then ${timezone} else ${userDayStats.timezone} end`,
      goalVersionId: sql`coalesce(${userDayStats.goalVersionId}, ${goal?.id ?? null}::uuid)`,
      goalDaysPerWeek: sql`coalesce(${userDayStats.goalDaysPerWeek}, ${goal?.daysPerWeek ?? null})`,
      goalMinutes: sql`coalesce(${userDayStats.goalMinutes}, ${goal?.minutesPerDay ?? null})`,
      goalWords: sql`coalesce(${userDayStats.goalWords}, ${goal?.wordsPerDay ?? null})`,
      met: sql`${userDayStats.met} OR ${met}`,
      firstActivityAt: sql`least(${userDayStats.firstActivityAt}, ${firstActivityAt})`,
      lastActivityAt: sql`greatest(${userDayStats.lastActivityAt}, ${lastActivityAt})`,
      computedAt: new Date(),
    },
  });
}

export async function getUserDayStats(userId: string, fromDay: string, toDay: string) {
  return db.select().from(userDayStats).where(and(
    eq(userDayStats.userId, userId),
    sql`${userDayStats.dayKey} >= ${fromDay}`,
    sql`${userDayStats.dayKey} <= ${toDay}`,
  )).orderBy(userDayStats.dayKey);
}
