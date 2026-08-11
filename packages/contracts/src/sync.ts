import { z } from 'zod';
import { DeviceProfileSchema } from './device';

const SyncReviewEventActionSchema = z.enum([
  'known',
  'really_known',
  'unknown',
]);

const finiteTimestamp = z.number().finite();

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
  status: z.enum(['applied', 'duplicate', 'blocked', 'conflict']),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

export type SyncReviewEventAction = z.infer<typeof SyncReviewEventActionSchema>;
export type SyncProgressItem = z.infer<typeof SyncProgressItemSchema>;
export type SyncReviewEventItem = z.infer<typeof SyncReviewEventItemSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;
export type SyncMutationPayload = z.infer<typeof SyncMutationPayloadSchema>;
export type SyncOperationResult = z.infer<typeof SyncOperationResultSchema>;
