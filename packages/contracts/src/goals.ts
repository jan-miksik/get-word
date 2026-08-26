import { z } from 'zod';

const GoalVersionSchema = z.object({
  id: z.string(),
  effectiveFromDay: z.string(),
  enabled: z.boolean(),
  mode: z.enum(['words', 'minutes']),
  daysPerWeek: z.number().int(),
  weekdays: z.array(z.number().int().min(1).max(7)).nullable().default(null),
  minutesPerDay: z.number().int(),
  wordsPerDay: z.number().int(),
  newWordsPerDay: z.number().int().nullable(),
  preset: z.enum(['light', 'medium', 'intense', 'custom']),
  pacing: z.unknown(),
  createdAt: z.string().optional(),
});

export const GoalSummarySchema = z.object({
  today: z.string(),
  timezone: z.string(),
  goal: z.object({
    active: GoalVersionSchema.nullable(),
    pending: GoalVersionSchema.nullable(),
    revision: z.number().int(),
  }),
  reminder: z.object({
    enabled: z.boolean(),
    localMinutes: z.number().int().min(0).max(1439),
    onboardingAnswered: z.boolean().default(true),
  }),
  days: z.array(z.object({
    dayKey: z.string(), activeMs: z.number().int(), answeredWords: z.number().int(),
    goalDaysPerWeek: z.number().int().nullable(), goalMinutes: z.number().int().nullable(),
    goalWords: z.number().int().nullable(), goalMode: z.enum(['words', 'minutes']).nullable(),
    goalStatus: z.enum(['active', 'nothing_due']).default('active'),
    availableNewWords: z.number().int().nullable(), dueReviewCount: z.number().int().nullable(),
    resolvedNewTarget: z.number().int().nullable(), resolvedReviewTarget: z.number().int().nullable(),
    resolvedItemBudget: z.number().int().nullable(), resolvedMinutesBudget: z.number().int().nullable(),
    introducedWords: z.number().int(), reviewedWords: z.number().int(), met: z.boolean(),
    /**
     * Does the goal *prefer* this weekday? A preference, never a requirement —
     * the weekly target counts days, not which days. `null` when the goal names
     * no weekdays at all.
     */
    preferred: z.boolean().nullable().default(null),
    status: z.enum(['nothing_due', 'none', 'partial', 'met', 'exceeded']).default('none'),
  })),
  streakWeeks: z.number().int(),
  weeklyAdherenceStreak: z.number().int(),
  /** Backward-compatible alias retained for older deployed clients. */
  dailyStreakDays: z.number().int().default(0),
  /** Consecutive calendar days that met the goal — the strict number. */
  dailyStreak: z.number().int().default(0),
  /** Consecutive weeks that filled their day quota, whichever days those were. */
  weeklyStreak: z.number().int().default(0),
  /** Days kept in the current week, and how many the goal asks for. */
  currentWeek: z.object({
    keptDays: z.number().int(),
    target: z.number().int(),
  }).default({ keptDays: 0, target: 0 }),
  /** First partial weeks that ended below quota and are neutral, not failed. */
  neutralWeekStarts: z.array(z.string()).default([]),
  streakWeeksAtWindowStart: z.number().int(),
  graceCooldownRemainingAtWindowStart: z.number().int().min(0).max(7),
});

export type GoalSummary = z.infer<typeof GoalSummarySchema>;

const HttpsEndpointSchema = z.string().url().max(4096).refine(
  (value) => new URL(value).protocol === 'https:',
  'Push endpoint must use HTTPS',
);

/** The browser-generated subscription is a capability, not a client identity.
 * Keep only the two encrypted-payload keys the Web Push protocol requires. */
export const WebPushSubscriptionSchema = z.object({
  endpoint: HttpsEndpointSchema,
  keys: z.object({
    p256dh: z.string().min(16).max(1024),
    auth: z.string().min(8).max(512),
  }),
});

export const WebPushUnsubscribeSchema = z.object({ endpoint: HttpsEndpointSchema });
