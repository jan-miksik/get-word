import { z } from 'zod';

const GoalVersionSchema = z.object({
  id: z.string(),
  effectiveFromDay: z.string(),
  enabled: z.boolean(),
  daysPerWeek: z.number().int(),
  minutesPerDay: z.number().int(),
  wordsPerDay: z.number().int(),
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
  reminder: z.object({ enabled: z.boolean(), localMinutes: z.number().int().min(0).max(1439) }),
  days: z.array(z.object({
    dayKey: z.string(), activeMs: z.number().int(), answeredWords: z.number().int(),
    goalDaysPerWeek: z.number().int().nullable(), goalMinutes: z.number().int().nullable(),
    goalWords: z.number().int().nullable(), met: z.boolean(),
  })),
  streakWeeks: z.number().int(),
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
