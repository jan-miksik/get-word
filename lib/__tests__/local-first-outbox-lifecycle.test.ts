import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

import {
  appendOp,
  claimReadyBatch,
  listOps,
  markFailed,
  resumeAuthRequiredOps,
} from '../local-first/outbox';

/**
 * A revision-bearing op carries the base revision it was created with, and each
 * one is sent as its own request. Two choices about the same thing queued back
 * to back therefore used to go out as two requests: the first bumped the server
 * revision and the second was rejected against a base that had gone stale. It
 * landed in `blocked`, which `retryBlockedOps` deliberately refuses, so the
 * learner's most recent choice sat unsent behind a manual recovery button while
 * the device went on displaying it.
 */
describe('outbox supersedes an unsent choice about the same thing', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  async function queueSettingsLanguage(value: string, baseRevision: number) {
    return appendOp({
      entity: 'preference',
      opType: 'set',
      payload: { field: 'settings_language', value, baseRevision },
      deviceId: 'device-1',
    });
  }

  it('keeps only the latest interface-language choice', async () => {
    const first = await queueSettingsLanguage('cs', 0);
    const second = await queueSettingsLanguage('uk', 0);

    const ops = await listOps();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.clientOpId).toBe(second?.clientOpId);
    expect(ops[0]?.clientOpId).not.toBe(first?.clientOpId);
    if (ops[0]?.entity !== 'preference') throw new Error('Expected preference op');
    expect(ops[0].payload.value).toBe('uk');
  });

  it('leaves a different revision domain alone', async () => {
    await queueSettingsLanguage('cs', 0);
    await appendOp({
      entity: 'preference',
      opType: 'set_language_pair',
      payload: {
        values: { language_from: 'cs', language_to: 'vi', onboarding_completed: true },
        baseRevision: 0,
      },
      deviceId: 'device-1',
    });

    const ops = await listOps();
    expect(ops).toHaveLength(2);
  });

  it('leaves unrelated writes alone', async () => {
    await appendOp({
      entity: 'game_score',
      opType: 'max',
      payload: { score: 10 },
      deviceId: 'device-1',
    });
    await queueSettingsLanguage('cs', 0);
    await queueSettingsLanguage('uk', 0);

    const ops = await listOps();
    expect(ops).toHaveLength(2);
    expect(ops.filter((op) => op.entity === 'game_score')).toHaveLength(1);
  });

  // The outcome of a request already on the wire is not ours to assume: the
  // server may well have applied it, so its record has to survive to be
  // reconciled against the acknowledgement.
  it('never supersedes an operation already claimed for a request', async () => {
    const claimedOp = await queueSettingsLanguage('cs', 0);
    const claimed = await claimReadyBatch(25);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.batchId).toBeTruthy();

    await queueSettingsLanguage('uk', 0);

    const ops = await listOps();
    expect(ops).toHaveLength(2);
    expect(ops.map((op) => op.clientOpId)).toContain(claimedOp?.clientOpId);
  });
});

describe('resuming writes paused by an expired session', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('starts the attempt tally over so the next hiccup cannot block the write', async () => {
    const queued = await appendOp({
      entity: 'game_score',
      opType: 'max',
      payload: { score: 10 },
      deviceId: 'device-1',
    });
    const id = queued!.clientOpId;

    // Three failed attempts while signed out — enough that one more unknown
    // failure would trip MAX_UNKNOWN_ATTEMPTS and block the op for good.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await markFailed([id], {
        kind: 'auth_required',
        reasonCode: 'AUTH_REQUIRED',
        message: 'signed out',
        httpStatus: 401,
      });
    }
    const blocked = (await listOps())[0];
    expect(blocked?.status).toBe('blocked');
    expect(blocked?.attempts).toBe(3);

    await resumeAuthRequiredOps();

    const resumed = (await listOps())[0];
    expect(resumed?.status).toBe('pending');
    expect(resumed?.attempts).toBe(0);
    expect(resumed?.diagnostic).toBeUndefined();
    expect(resumed?.nextAttemptAt).toBeUndefined();
  });

  it('leaves failures that signing in does not resolve alone', async () => {
    const queued = await appendOp({
      entity: 'game_score',
      opType: 'max',
      payload: { score: 10 },
      deviceId: 'device-1',
    });
    await markFailed([queued!.clientOpId], {
      kind: 'permanent',
      reasonCode: 'HTTP_400',
      message: 'rejected',
      httpStatus: 400,
    });

    await resumeAuthRequiredOps();

    const stored = (await listOps())[0];
    expect(stored?.status).toBe('blocked');
    expect(stored?.diagnostic?.kind).toBe('permanent');
  });
});
