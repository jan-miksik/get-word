import { describe, expect, it } from 'vitest';

import { buildPayloadFromOps } from '../local-first/payload-builder';
import type { OutboxOp, OutboxOperation } from '../local-first/outbox';

function makeOp(partial: OutboxOperation & Partial<OutboxOp>): OutboxOp {
  return {
    clientOpId: partial.clientOpId ?? crypto.randomUUID(),
    entity: partial.entity,
    opType: partial.opType,
    payload: partial.payload,
    clientCreatedAt: partial.clientCreatedAt ?? new Date(0).toISOString(),
    deviceId: partial.deviceId ?? null,
    attempts: partial.attempts ?? 0,
    lastError: partial.lastError,
    nextAttemptAt: partial.nextAttemptAt,
  } as OutboxOp;
}

describe('payload builder', () => {
  it('returns null for an empty op list', () => {
    expect(buildPayloadFromOps([])).toBeNull();
  });

  it('collects client_op_ids across every op', () => {
    const ops = [
      makeOp({
        clientOpId: 'a',
        entity: 'preference',
        opType: 'set',
        payload: { field: 'show_english', value: true },
      }),
      makeOp({
        clientOpId: 'b',
        entity: 'game_score',
        opType: 'max',
        payload: { score: 12 },
      }),
    ];
    const built = buildPayloadFromOps(ops);
    expect(built?.clientOpIds).toEqual(['a', 'b']);
    expect(built?.payload.client_op_ids).toEqual(['a', 'b']);
  });

  it('merges preference ops field-by-field', () => {
    const built = buildPayloadFromOps([
      makeOp({ entity: 'preference', opType: 'set', payload: { field: 'show_english', value: true } }),
      makeOp({ entity: 'preference', opType: 'set', payload: { field: 'memory_hooks_enabled', value: false } }),
      makeOp({
        entity: 'preference',
        opType: 'set',
        payload: { field: 'memory_hooks_intro_answered', value: true },
      }),
    ]);
    expect(built?.payload.show_english).toBe(true);
    expect(built?.payload.memory_hooks_enabled).toBe(false);
    expect(built?.payload.memory_hooks_intro_answered).toBe(true);
  });

  it('keeps a language-pair preference atomic in one outbox op', () => {
    const built = buildPayloadFromOps([
      makeOp({
        entity: 'preference',
        opType: 'set_language_pair',
        payload: {
          values: {
            language_from: 'cs',
            language_to: 'vi',
            onboarding_completed: true,
            language_pair_base_revision: 9,
          },
          baseRevision: 9,
        },
      }),
    ]);

    expect(built?.payload).toMatchObject({
      language_from: 'cs',
      language_to: 'vi',
      onboarding_completed: true,
      language_pair_base_revision: 9,
    });
    expect(built?.invalidClientOpIds).toEqual([]);
  });

  it('keeps the last value when the same preference field is set twice', () => {
    const built = buildPayloadFromOps([
      makeOp({ entity: 'preference', opType: 'set', payload: { field: 'show_english', value: false }, clientCreatedAt: '2026-01-01T00:00:00Z' }),
      makeOp({ entity: 'preference', opType: 'set', payload: { field: 'show_english', value: true }, clientCreatedAt: '2026-01-01T00:00:01Z' }),
    ]);
    expect(built?.payload.show_english).toBe(true);
  });

  it('takes the max game_score across ops', () => {
    const built = buildPayloadFromOps([
      makeOp({ entity: 'game_score', opType: 'max', payload: { score: 5 } }),
      makeOp({ entity: 'game_score', opType: 'max', payload: { score: 12 } }),
      makeOp({ entity: 'game_score', opType: 'max', payload: { score: 3 } }),
    ]);
    expect(built?.payload.game_score).toBe(12);
  });

  it('collapses category_filters to the most recent replace', () => {
    const built = buildPayloadFromOps([
      makeOp({ entity: 'category_filters', opType: 'replace', payload: { filters: ['a', 'b'] } }),
      makeOp({ entity: 'category_filters', opType: 'replace', payload: { filters: ['c'] } }),
    ]);
    expect(built?.payload.category_filters).toEqual(['c']);
  });

  it('merges memory_hook ops into a single record keyed by id', () => {
    const built = buildPayloadFromOps([
      makeOp({ entity: 'memory_hook', opType: 'set', payload: { id: 'w1', text: 'note one' } }),
      makeOp({ entity: 'memory_hook', opType: 'set', payload: { id: 'w2', text: null } }),
    ]);
    expect(built?.payload.memory_hooks).toEqual({ w1: 'note one', w2: null });
  });

  it('deduplicates progress ops by their key, keeping the last value', () => {
    const built = buildPayloadFromOps([
      makeOp({
        entity: 'progress',
        opType: 'upsert',
        payload: {
          word_id: 'w1',
          stage_index: 0,
          known_count: 0,
          unknown_count: 0,
          last_known_at: null,
          last_unknown_at: null,
          next_due_at: null,
        },
      }),
      makeOp({
        entity: 'progress',
        opType: 'upsert',
        payload: {
          word_id: 'w1',
          stage_index: 2,
          known_count: 1,
          unknown_count: 0,
          last_known_at: 1000,
          last_unknown_at: null,
          next_due_at: 9000,
        },
      }),
    ]);
    expect(built?.payload.progress).toHaveLength(1);
    expect(built?.payload.progress?.[0]).toMatchObject({ word_id: 'w1', stage_index: 2 });
  });

  it('collects review_event ops into the review_events array, keyed by client_event_id', () => {
    const built = buildPayloadFromOps([
      makeOp({
        entity: 'review_event',
        opType: 'event',
        payload: { client_event_id: 'x', word_id: 'w1', action: 'known', client_created_at: 100 },
      }),
      makeOp({
        entity: 'review_event',
        opType: 'event',
        payload: { client_event_id: 'x', word_id: 'w1', action: 'known', client_created_at: 100 },
      }),
      makeOp({ entity: 'game_score', opType: 'max', payload: { score: 7 } }),
    ]);
    expect(built?.payload.review_events).toEqual([
      { client_event_id: 'x', word_id: 'w1', action: 'known', client_created_at: 100 },
    ]);
    expect(built?.payload.game_score).toBe(7);
    expect(built?.clientOpIds).toHaveLength(3);
  });

  it('prefers word_list_item_id over word_id in review_event payloads', () => {
    const built = buildPayloadFromOps([
      makeOp({
        entity: 'review_event',
        opType: 'event',
        payload: {
          client_event_id: 'r',
          word_id: 'legacy',
          word_list_item_id: 'wli-1',
          action: 'unknown',
          client_created_at: 1,
        },
      }),
    ]);
    expect(built?.payload.review_events).toEqual([
      { client_event_id: 'r', word_list_item_id: 'wli-1', action: 'unknown', client_created_at: 1 },
    ]);
  });

  it('drops malformed review_event payloads', () => {
    const built = buildPayloadFromOps([
      makeOp({
        entity: 'review_event',
        opType: 'event',
        payload: { client_event_id: 'a', action: 'known', client_created_at: 0 },
      }),
      makeOp({
        entity: 'review_event',
        opType: 'event',
        payload: { client_event_id: 'b', word_id: 'w', client_created_at: 0 },
      } as unknown as OutboxOperation),
    ]);
    expect(built?.payload.review_events).toBeUndefined();
    expect(built?.invalidClientOpIds).toHaveLength(2);
    expect(built?.clientOpIds).toHaveLength(0);
  });
});

describe('activity segments', () => {
  function segmentOp(overrides: Record<string, unknown> = {}, clientOpId?: string) {
    return makeOp({
      clientOpId,
      entity: 'activity_segment',
      opType: 'event',
      payload: {
        client_segment_id: 'seg-1',
        session_id: 'session-1',
        surface: 'study',
        started_at: 1_000,
        ended_at: 61_000,
        active_ms: 60_000,
        interactions: 12,
        ...overrides,
      },
    } as unknown as OutboxOperation);
  }

  it('collapses a redelivered segment id to a single entry', () => {
    const built = buildPayloadFromOps([
      segmentOp({}, 'op-a'),
      segmentOp({ active_ms: 60_000 }, 'op-b'),
    ]);

    expect(built?.payload.activity_segments).toHaveLength(1);
    // Both ops are still acknowledged so neither lingers in the outbox.
    expect(built?.clientOpIds).toEqual(['op-a', 'op-b']);
  });

  it('rejects a segment that ends before it starts', () => {
    const built = buildPayloadFromOps([segmentOp({ started_at: 9_000, ended_at: 1_000 })]);

    expect(built?.payload.activity_segments).toBeUndefined();
    expect(built?.invalidClientOpIds).toHaveLength(1);
  });

  it('discards segments measured under a different account', () => {
    const built = buildPayloadFromOps(
      [
        segmentOp({ owner: 'user-1' }, 'mine'),
        segmentOp({ client_segment_id: 'seg-2', owner: 'user-2' }, 'theirs'),
      ],
      { owner: 'user-1' }
    );

    expect(built?.payload.activity_segments).toHaveLength(1);
    expect(built?.clientOpIds).toEqual(['mine']);
    // Dropped quietly rather than flagged for recovery — nothing is malformed.
    expect(built?.discardedClientOpIds).toEqual(['theirs']);
    expect(built?.invalidClientOpIds).toHaveLength(0);
  });

  it('sends unowned segments so pre-existing ops are not stranded', () => {
    const built = buildPayloadFromOps([segmentOp()], { owner: 'user-1' });

    expect(built?.payload.activity_segments).toHaveLength(1);
    expect(built?.discardedClientOpIds).toHaveLength(0);
  });
});
