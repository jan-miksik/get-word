import { describe, expect, it, vi } from 'vitest';

import { SyncEngine, type ConnectivitySource } from '../engine';

function harness(options: { online?: boolean; cached?: { value: string } | null } = {}) {
  let online = options.online ?? true;
  const connectivityListeners = new Set<(value: boolean) => void>();
  const connectivity: ConnectivitySource = {
    isOnline: () => online,
    subscribe: (listener) => {
      connectivityListeners.add(listener);
      return () => connectivityListeners.delete(listener);
    },
  };
  const order: string[] = [];
  const transport = {
    pull: vi.fn(async () => {
      order.push('pull');
      return { value: 'server' };
    }),
    push: vi.fn(async () => ({ value: 'ack' })),
  };
  const repository = {
    load: vi.fn(async () => {
      order.push('load');
      return options.cached ?? null;
    }),
    readCursor: vi.fn(async () => ({ since: '7', contentRevision: 'content-1' })),
    persist: vi.fn(async () => {
      order.push('persist');
      return true;
    }),
  };
  let now = 0;
  const engine = new SyncEngine({
    transport,
    repository,
    connectivity,
    clock: { now: () => ++now },
  });
  return {
    engine,
    order,
    transport,
    repository,
    setOnline(value: boolean) {
      online = value;
      for (const listener of connectivityListeners) listener(value);
    },
  };
}

describe('SyncEngine', () => {
  it('applies cache before pulling and persists before publishing server data', async () => {
    const test = harness({ cached: { value: 'cache' } });
    const events: string[] = [];
    test.engine.onData(async (event) => {
      events.push(`${event.source}:${event.value.value}`);
      test.order.push(`emit:${event.source}`);
    });

    await test.engine.boot();

    expect(test.order).toEqual(['load', 'emit:cache', 'pull', 'persist', 'emit:server']);
    expect(events).toEqual(['cache:cache', 'server:server']);
    expect(test.engine.getState().phase).toBe('ready');
    expect(test.transport.pull).toHaveBeenCalledWith({ since: '7', contentRevision: 'content-1' });
  });

  it('boots from cache without network access while offline', async () => {
    const test = harness({ online: false, cached: { value: 'cache' } });
    const listener = vi.fn();
    test.engine.onData(listener);

    await test.engine.boot();

    expect(listener).toHaveBeenCalledOnce();
    expect(test.transport.pull).not.toHaveBeenCalled();
    expect(test.engine.getState().phase).toBe('offline');
  });

  it('observes connectivity without importing browser globals', () => {
    const test = harness();
    test.engine.start();
    test.setOnline(false);
    expect(test.engine.getState().phase).toBe('offline');
    test.setOnline(true);
    expect(test.engine.getState().phase).toBe('ready');
    test.engine.stop();
  });

  // A device whose storage is full or evicted still deserves fresh data. The
  // read cursor is what must not advance, and the repository owns that; the
  // payload itself is published either way, with the phase reporting that the
  // app is live but no longer warm-bootable.
  it('still publishes a pull it could not cache, and reports degraded', async () => {
    const test = harness();
    const listener = vi.fn();
    test.engine.onData(listener);
    test.repository.persist.mockResolvedValueOnce(false);

    await expect(test.engine.pull()).resolves.toEqual({ value: 'server' });
    expect(listener).toHaveBeenCalledWith({
      source: 'server',
      value: { value: 'server' },
    });
    expect(test.engine.getState()).toMatchObject({
      phase: 'degraded',
      lastError: 'Sync snapshot could not be cached locally',
    });
  });

  it('does not let a throwing cache write lose the payload', async () => {
    const test = harness();
    const listener = vi.fn();
    test.engine.onData(listener);
    test.repository.persist.mockRejectedValueOnce(new Error('QuotaExceededError'));

    await expect(test.engine.pull()).resolves.toEqual({ value: 'server' });
    expect(listener).toHaveBeenCalledWith({
      source: 'server',
      value: { value: 'server' },
    });
    expect(test.engine.getState().phase).toBe('degraded');
  });

  it('persists an external acknowledgement before publishing it', async () => {
    const test = harness();
    const listener = vi.fn();
    test.engine.onData(listener);

    await test.engine.ingest({ value: 'external-ack' });

    expect(test.repository.persist).toHaveBeenCalledWith({ value: 'external-ack' });
    expect(listener).toHaveBeenCalledWith({
      source: 'server',
      value: { value: 'external-ack' },
    });
  });
});
