import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface QueuedOp {
  entity: string;
  opType: string;
  payload: Record<string, unknown> & { owner?: string | null };
  clientOpId: string;
  deviceId: string | null;
}

const appendOp = vi.fn(async (op: QueuedOp): Promise<QueuedOp | null> => op);
const scheduleDrain = vi.fn();
const flushOutboxNow = vi.fn(async () => undefined);
let syncOwner: string | null = null;

vi.mock('@/lib/local-first/outbox', () => ({
  appendOp: (op: QueuedOp) => appendOp(op),
}));
vi.mock('@/lib/local-first/drainer', () => ({
  scheduleDrain: () => scheduleDrain(),
  flushOutboxNow: () => flushOutboxNow(),
}));
vi.mock('@/lib/local-first/availability', () => ({
  isLocalFirstAvailableSync: () => true,
  ensureLocalFirstAvailability: async () => true,
}));
vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'device-1' }));
vi.mock('@/lib/sync', () => ({ getSyncOwner: () => syncOwner }));

import {
  setActivityOwner,
  setActivitySurface,
  startActivityTracking,
} from '../activity/runtime';

const CHECKPOINT_PREFIX = 'get_word_activity_segment:';
const INSTANCE_KEY = 'get_word_activity_instance';

function checkpointKeys(): string[] {
  return Object.keys(localStorage).filter((key) => key.startsWith(CHECKPOINT_PREFIX));
}

function writeForeignCheckpoint(
  instanceId: string,
  overrides: Record<string, unknown> = {},
) {
  localStorage.setItem(
    `${CHECKPOINT_PREFIX}${instanceId}`,
    JSON.stringify({
      owner: 'user-1',
      session_id: 'session-foreign',
      client_segment_id: 'segment-foreign',
      surface: 'study',
      started_at: Date.now() - 600_000,
      last_accounted_wall: Date.now() - 300_000,
      active_ms: 300_000,
      interactions: 20,
      last_interaction_wall: Date.now() - 300_000,
      checkpointed_at: Date.now() - 300_000,
      ...overrides,
    }),
  );
}

let stop: (() => void) | null = null;

beforeEach(() => {
  // Most tests exercise lifecycle and durability independently of cross-tab
  // claiming. The dedicated collision test below installs a channel double.
  vi.stubGlobal('BroadcastChannel', undefined);
  localStorage.clear();
  sessionStorage.clear();
  appendOp.mockClear();
  appendOp.mockImplementation(async (op: QueuedOp) => op);
  scheduleDrain.mockClear();
  flushOutboxNow.mockClear();
  syncOwner = null;
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.unstubAllGlobals();
});

describe('checkpoint instance scoping', () => {
  it('never recovers another instance checkpoint, even a stale one', async () => {
    // Tab A is alive but backgrounded, so its checkpoint is minutes old. Age is
    // not proof of death, and claiming it would post a truncated copy of a
    // segment tab A still holds.
    writeForeignCheckpoint('instance-a', { checkpointed_at: Date.now() - 5 * 60_000 });

    syncOwner = 'user-1';
    stop = startActivityTracking();
    await Promise.resolve();

    expect(appendOp).not.toHaveBeenCalled();
    // Left untouched for its owner rather than deleted or claimed.
    expect(localStorage.getItem(`${CHECKPOINT_PREFIX}instance-a`)).not.toBeNull();
  });

  it('deletes long-dead orphans without emitting them', async () => {
    const ancient = Date.now() - 30 * 24 * 60 * 60 * 1000;
    writeForeignCheckpoint('instance-dead', { checkpointed_at: ancient });

    syncOwner = 'user-1';
    stop = startActivityTracking();
    await Promise.resolve();

    expect(appendOp).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${CHECKPOINT_PREFIX}instance-dead`)).toBeNull();
  });

  it('recovers its own checkpoint after a reload in the same tab', async () => {
    sessionStorage.setItem(INSTANCE_KEY, 'instance-mine');
    writeForeignCheckpoint('instance-mine');

    syncOwner = 'user-1';
    stop = startActivityTracking();
    await Promise.resolve();

    expect(appendOp).toHaveBeenCalledTimes(1);
    const op = appendOp.mock.calls[0][0];
    expect(op.payload.client_segment_id).toBe('segment-foreign');
    expect(op.payload.active_ms).toBe(300_000);
  });

  it('stamps a newly opened checkpoint when the owner was known before startup', async () => {
    // A warm SPA can already have an account in `getSyncOwner()` before the
    // activity provider mounts. In that case no later owner-change event is
    // guaranteed, so the tracker itself must receive the initial owner.
    vi.useFakeTimers();
    try {
      syncOwner = 'user-1';
      stop = startActivityTracking();
      window.dispatchEvent(new Event('pointerdown'));
      // Open checkpoints are intentionally throttled; advance across the
      // second five-second tracker tick that reaches the ten-second write.
      await vi.advanceTimersByTimeAsync(10_000);

      const raw = localStorage.getItem(`${CHECKPOINT_PREFIX}${sessionStorage.getItem(INSTANCE_KEY)}`);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).owner).toBe('user-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for duplicate-tab claiming before recovering the shared instance key', async () => {
    class ClaimingChannel {
      onmessage: ((event: MessageEvent) => void) | null = null;

      postMessage(message: { type?: string; instanceId?: string }) {
        if (message.type !== 'claim?' || !message.instanceId) return;
        queueMicrotask(() => {
          this.onmessage?.({
            data: { type: 'claimed', instanceId: message.instanceId },
          } as MessageEvent);
        });
      }

      close() {}
    }
    vi.stubGlobal('BroadcastChannel', ClaimingChannel);
    sessionStorage.setItem(INSTANCE_KEY, 'instance-duplicated');
    writeForeignCheckpoint('instance-duplicated');

    syncOwner = 'user-1';
    stop = startActivityTracking();
    await Promise.resolve();

    // The live tab's checkpoint must survive while this copy changes identity.
    expect(appendOp).not.toHaveBeenCalled();
    expect(
      localStorage.getItem(`${CHECKPOINT_PREFIX}instance-duplicated`),
    ).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(appendOp).not.toHaveBeenCalled();
    expect(
      localStorage.getItem(`${CHECKPOINT_PREFIX}instance-duplicated`),
    ).not.toBeNull();
  });

  it('keeps two tabs on separate checkpoint keys', async () => {
    sessionStorage.setItem(INSTANCE_KEY, 'instance-a');
    writeForeignCheckpoint('instance-b');

    syncOwner = 'user-1';
    stop = startActivityTracking();
    await Promise.resolve();

    // Tab B's key survives untouched; only our own key is ever rewritten.
    expect(localStorage.getItem(`${CHECKPOINT_PREFIX}instance-b`)).not.toBeNull();
    expect(checkpointKeys()).toContain(`${CHECKPOINT_PREFIX}instance-b`);
  });
});

describe('account scoping', () => {
  it('discards a checkpoint written under a different account', async () => {
    sessionStorage.setItem(INSTANCE_KEY, 'instance-mine');
    writeForeignCheckpoint('instance-mine', { owner: 'user-1' });

    // A different account is now signed in.
    syncOwner = 'user-2';
    stop = startActivityTracking();
    await Promise.resolve();

    // Nothing is posted: user-1's activity must not land under user-2.
    expect(appendOp).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${CHECKPOINT_PREFIX}instance-mine`)).toBeNull();
  });

  it('recovers a checkpoint written before the account is known at boot', async () => {
    // The real boot order: `getSyncOwner()` is null until the first sync
    // response names the account, so recovery has to wait for it instead of
    // comparing every stored checkpoint against null and deleting the lot.
    sessionStorage.setItem(INSTANCE_KEY, 'instance-mine');
    writeForeignCheckpoint('instance-mine', { owner: 'user-1' });

    syncOwner = null;
    stop = startActivityTracking();
    await Promise.resolve();

    // Nothing recovered yet, and — crucially — nothing thrown away either. The
    // record is parked under a closed-segment key so this instance's own
    // checkpoint writes cannot clear it while it waits.
    expect(appendOp).not.toHaveBeenCalled();
    expect(
      checkpointKeys().filter((key) => key.startsWith(`${CHECKPOINT_PREFIX}instance-mine`)),
    ).toEqual([`${CHECKPOINT_PREFIX}instance-mine:closed:segment-foreign`]);

    setActivityOwner('user-1');
    await Promise.resolve();

    expect(appendOp).toHaveBeenCalledTimes(1);
    expect(appendOp.mock.calls[0][0].payload.client_segment_id).toBe('segment-foreign');
    expect(appendOp.mock.calls[0][0].payload.owner).toBe('user-1');
  });

  it('measures nothing while signed out', async () => {
    // `/api/sync` rejects an unauthenticated POST, so a signed-out visitor's
    // segments could never be delivered — they would sit in the outbox until
    // some later account flushed them under the wrong id.
    syncOwner = null;
    stop = startActivityTracking();

    window.dispatchEvent(new Event('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    window.dispatchEvent(new Event('pagehide'));
    await Promise.resolve();

    expect(appendOp).not.toHaveBeenCalled();
  });

  it('starts measuring once the account becomes known', async () => {
    syncOwner = null;
    stop = startActivityTracking();

    setActivityOwner('user-1');
    window.dispatchEvent(new Event('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    setActivityOwner('user-2');
    await Promise.resolve();
    await Promise.resolve();

    expect(appendOp).toHaveBeenCalled();
  });

  it('starts measuring when the hydration layer announces the account', async () => {
    syncOwner = null;
    stop = startActivityTracking();
    setActivitySurface('study');

    syncOwner = 'user-1';
    window.dispatchEvent(new CustomEvent('get-word:sync-owner-changed', {
      detail: { owner: 'user-1' },
    }));
    window.dispatchEvent(new Event('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    window.dispatchEvent(new Event('pagehide'));
    await Promise.resolve();
    await Promise.resolve();

    expect(appendOp).toHaveBeenCalled();
  });

  it('stamps queued segments with the owner they were measured under', async () => {
    syncOwner = 'user-1';
    stop = startActivityTracking();

    setActivityOwner('user-1');
    window.dispatchEvent(new Event('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Switching identity closes the open segment before the new owner applies.
    setActivityOwner('user-2');
    await Promise.resolve();
    await Promise.resolve();

    const ownerStamps = appendOp.mock.calls.map(
      (call) => call[0].payload.owner,
    );
    // Guard against the assertion passing vacuously on an empty queue.
    expect(ownerStamps.length).toBeGreaterThan(0);
    for (const owner of ownerStamps) {
      expect(owner).toBe('user-1');
    }
  });
});

/** Drives the visibility signal the way a phone backgrounding the tab does. */
function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => value,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('checkpoint durability', () => {
  afterEach(() => {
    setVisibility('visible');
  });

  it('keeps the checkpoint until the segment append has actually landed', async () => {
    let land = () => undefined as void;
    appendOp.mockImplementationOnce(
      () =>
        new Promise<QueuedOp>((resolve) => {
          land = () => resolve(appendOp.mock.calls[0][0]);
        }),
    );

    syncOwner = 'user-1';
    stop = startActivityTracking();
    window.dispatchEvent(new Event('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Backgrounding closes the segment and queues it, but the OS may stop
    // running JavaScript before IndexedDB commits. Until it does, the
    // checkpoint is the only copy of that time.
    setVisibility('hidden');
    await Promise.resolve();
    await Promise.resolve();

    expect(appendOp).toHaveBeenCalledTimes(1);
    expect(checkpointKeys()).toHaveLength(1);

    land();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Delivered: the recovery copy is no longer needed.
    expect(checkpointKeys()).toHaveLength(0);
  });

  it('retains the closed checkpoint when appendOp reports an IndexedDB failure', async () => {
    appendOp.mockResolvedValueOnce(null);

    syncOwner = 'user-1';
    stop = startActivityTracking();
    window.dispatchEvent(new Event('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    setVisibility('hidden');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appendOp).toHaveBeenCalledTimes(1);
    expect(scheduleDrain).not.toHaveBeenCalled();
    expect(checkpointKeys()).toHaveLength(1);
  });

  it('retains the closed checkpoint when appendOp rejects', async () => {
    appendOp.mockRejectedValueOnce(new Error('IndexedDB transaction aborted'));

    syncOwner = 'user-1';
    stop = startActivityTracking();
    window.dispatchEvent(new Event('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    setVisibility('hidden');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appendOp).toHaveBeenCalledTimes(1);
    expect(checkpointKeys()).toHaveLength(1);
  });

  it('does not let a successor overwrite an earlier segment still being appended', async () => {
    let landFirst = () => undefined as void;
    appendOp.mockImplementationOnce(
      (op) => new Promise<QueuedOp>((resolve) => {
        landFirst = () => resolve(op);
      }),
    );

    syncOwner = 'user-1';
    stop = startActivityTracking();
    window.dispatchEvent(new Event('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Close the first segment and immediately continue on another surface.
    setActivitySurface('lists');
    await new Promise((resolve) => setTimeout(resolve, 20));
    setVisibility('hidden');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appendOp).toHaveBeenCalledTimes(2);
    const firstSegmentId = appendOp.mock.calls[0][0].clientOpId;
    const savedIds = checkpointKeys().map((key) => {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as { client_segment_id: string }).client_segment_id : '';
    });
    expect(savedIds).toEqual([firstSegmentId]);

    landFirst();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(checkpointKeys()).toHaveLength(0);
  });

  it('resumes clearing checkpoints when a hidden page comes back', async () => {
    syncOwner = 'user-1';
    stop = startActivityTracking();

    // `pagehide` holds the checkpoint on purpose, for a page that is going
    // away. A bfcache restore means it did not, so the hold must lift.
    window.dispatchEvent(new Event('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(checkpointKeys()).toHaveLength(1);

    setVisibility('visible');
    window.dispatchEvent(new Event('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    window.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(checkpointKeys()).toHaveLength(0);
  });
});
