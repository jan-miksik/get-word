import { z } from 'zod';
import { ACTIVITY_SURFACES, MAX_SEGMENT_MS } from './activity';
import { DeviceProfileSchema } from './device';

const SyncReviewEventActionSchema = z.enum([
  'known',
  'really_known',
  'unknown',
]);

const finiteTimestamp = z.number().finite();

const IanaTimezoneSchema = z.string().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}, 'Invalid IANA timezone');

const LocalDayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Invalid local day');

const SyncProgressItemSchema = z.object({
  word_id: z.string().optional(),
  word_list_item_id: z.string().optional(),
  stage_index: z.number().int(),
  known_count: z.number().int(),
  unknown_count: z.number().int(),
  last_known_at: finiteTimestamp.nullable(),
  last_unknown_at: finiteTimestamp.nullable(),
  next_due_at: finiteTimestamp.nullable(),
  // Legacy compatibility metadata. New conflict domains use server-issued
  // revisions; client wall-clock values are never the sole authority.
  client_updated_at: finiteTimestamp.optional(),
});

const SyncReviewEventItemSchema = z.object({
  client_event_id: z.string().min(1),
  word_id: z.string().optional(),
  word_list_item_id: z.string().optional(),
  action: SyncReviewEventActionSchema,
  client_created_at: finiteTimestamp,
  local_day_key: LocalDayKeySchema.optional(),
});

/**
 * Forward-compatible without masking malformed input. A plain `.catch('other')`
 * would swallow every validation failure, so a client sending `surface: 12345`
 * would silently produce a valid row — unacceptable when the client is
 * explicitly untrusted. An unknown *string* degrades to 'other' (a newer client
 * added a surface); a non-string is still a validation error.
 */
const ActivitySurfaceSchema = z
  .string()
  .max(32)
  .transform((value) =>
    (ACTIVITY_SURFACES as readonly string[]).includes(value) ? value : 'other',
  );

const SyncActivitySegmentSchema = z.object({
  client_segment_id: z.string().min(1).max(64),
  session_id: z.string().min(1).max(64),
  surface: ActivitySurfaceSchema,
  started_at: finiteTimestamp,
  ended_at: finiteTimestamp,
  // Clamped, not rejected — the same treatment `surface` gets above, and what
  // `normalizeActivitySegment` already does server-side. A segment that measured
  // itself a few milliseconds past the cap is a client-side fault in a
  // measurement-only field; rejecting it would fail the entire batch, and that
  // batch also carries the user's progress.
  active_ms: z
    .number()
    .int()
    .nonnegative()
    .transform((value) => Math.min(value, MAX_SEGMENT_MS)),
  interactions: z.number().int().nonnegative().max(100_000).optional(),
  local_day_key: LocalDayKeySchema.optional(),
  timezone_at_creation: IanaTimezoneSchema.optional(),
});

const GoalMinigameFrequencySchema = z.union([
  z.literal('off'),
  z.object({ min: z.number().int().min(1).max(30), max: z.number().int().min(1).max(30) }),
]);

const StudyGoalMutationSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['words', 'minutes']).default('minutes'),
  goal_days_per_week: z.number().int().min(1).max(7),
  goal_minutes_per_day: z.number().int().min(1).max(240).optional(),
  goal_new_words_per_day: z.number().int().min(1).max(30).optional(),
  goal_preset: z.enum(['light', 'medium', 'intense', 'custom']),
  reveal_mode: z.enum(['scratch', 'press']),
  minigame_frequency: GoalMinigameFrequencySchema,
  timezone: IanaTimezoneSchema.optional(),
  learning_fine_tune: z.unknown(),
}).superRefine((value, context) => {
  if (value.mode === 'minutes' && value.goal_minutes_per_day === undefined) {
    context.addIssue({ code: 'custom', path: ['goal_minutes_per_day'], message: 'Minutes goal requires minutes' });
  }
  if (value.mode === 'words' && value.goal_new_words_per_day === undefined) {
    context.addIssue({ code: 'custom', path: ['goal_new_words_per_day'], message: 'Words goal requires new words' });
  }
});

const SyncMutationPayloadSchema = z.object({
  show_english: z.boolean().optional(),
  show_category_badges: z.boolean().optional(),
  show_pronunciation: z.boolean().optional(),
  memory_hooks_enabled: z.boolean().optional(),
  memory_hooks_intro_answered: z.boolean().optional(),
  memory_hook_disable_from_stage: z.number().int().optional(),
  study_notes_enabled: z.boolean().optional(),
  study_note_minimize_from_stage: z.number().int().optional(),
  // Shape is validated by normalizeFineTuneConfig on both sides; the schema
  // only has to let the object through.
  learning_fine_tune: z.unknown().optional(),
  study_goal: StudyGoalMutationSchema.optional(),
  study_goal_base_revision: z.number().int().nonnegative().optional(),
  goal_reminder_enabled: z.boolean().optional(),
  goal_reminder_local_minutes: z.number().int().min(0).max(1439).nullable().optional(),
  goal_intro_answered: z.boolean().optional(),
  // Quality-review consents. Two separate switches on purpose: an editor
  // reading the pair and a third-party LLM receiving it are different asks.
  review_opt_in: z.boolean().optional(),
  ai_review_opt_in: z.boolean().optional(),
  settings_language: z.string().optional(),
  language_from: z.string().nullable().optional(),
  language_to: z.string().nullable().optional(),
  onboarding_completed: z.boolean().optional(),
  // Accepted for older/newer clients while the server-revision protocol is
  // rolled out. They remain metadata, not an authoritative conflict clock.
  settings_language_selected_at: finiteTimestamp.optional(),
  language_pair_selected_at: finiteTimestamp.optional(),
  settings_language_base_revision: z.number().int().nonnegative().optional(),
  language_pair_base_revision: z.number().int().nonnegative().optional(),
  game_score: z.number().finite().optional(),
  category_order: z.array(z.string()).optional(),
  progress: z.array(SyncProgressItemSchema).optional(),
  review_events: z.array(SyncReviewEventItemSchema).optional(),
  activity_segments: z.array(SyncActivitySegmentSchema).max(200).optional(),
  memory_hooks: z.record(z.string(), z.string().nullable()).optional(),
  category_filters: z.array(z.string()).optional(),
  // Legacy clients could include null/empty entries. Preserve the route's
  // historical filter-instead-of-reject behavior for this additive ack hint.
  client_op_ids: z.array(z.unknown()).transform((values) =>
    values.filter((value): value is string => typeof value === 'string' && value.length > 0)
  ).optional(),
}).passthrough();

export const SyncRequestSchema = SyncMutationPayloadSchema.extend({
  deviceId: z.string().optional(),
  deviceProfile: DeviceProfileSchema.optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
});

export const SyncOperationResultSchema = z.object({
  clientOpId: z.string().min(1),
  // 'retry' is the server saying it accepted the request but could not store
  // this particular operation — a transient database fault, or a table whose
  // migration has not been applied yet. Unlike 'blocked' it is not the client's
  // fault and needs no user recovery: the op stays in the outbox and goes out
  // again on the normal backoff.
  status: z.enum(['applied', 'duplicate', 'blocked', 'conflict', 'retry']),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

export type SyncReviewEventAction = z.infer<typeof SyncReviewEventActionSchema>;
export type SyncProgressItem = z.infer<typeof SyncProgressItemSchema>;
export type SyncReviewEventItem = z.infer<typeof SyncReviewEventItemSchema>;
export type SyncActivitySegment = z.infer<typeof SyncActivitySegmentSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;
export type SyncMutationPayload = z.infer<typeof SyncMutationPayloadSchema>;
export type SyncOperationResult = z.infer<typeof SyncOperationResultSchema>;
export type StudyGoalMutation = z.infer<typeof StudyGoalMutationSchema>;
