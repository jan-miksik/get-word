import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canBulkCacheAudio,
  getAudioPrefetchLimit,
  getAudioWarmupLookahead,
  isAudioNetworkConstrained,
  isAudioNetworkOffline,
  subscribeAudioNetworkChanges,
} from '../audio-network-policy';

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: online,
  });
}

function setConnection(connection?: object): void {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: connection,
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
  Reflect.deleteProperty(navigator, 'connection');
  vi.restoreAllMocks();
});

describe('audio network policy', () => {
  it('pauses all warmup and bulk downloads while offline', () => {
    setOnline(false);

    expect(isAudioNetworkOffline()).toBe(true);
    expect(getAudioWarmupLookahead(2)).toBe(-1);
    expect(getAudioPrefetchLimit(10)).toBe(0);
    expect(canBulkCacheAudio()).toBe(false);
  });

  it('limits foreground warming and blocks bulk caching on cellular data', () => {
    setOnline(true);
    setConnection({ type: 'cellular', effectiveType: '4g', saveData: false });

    expect(isAudioNetworkConstrained()).toBe(true);
    expect(getAudioWarmupLookahead(2)).toBe(1);
    expect(getAudioPrefetchLimit(10)).toBe(4);
    expect(canBulkCacheAudio()).toBe(false);
  });

  it('allows whole-list caching on wifi', () => {
    setOnline(true);
    setConnection({ type: 'wifi', effectiveType: '4g', saveData: false });

    expect(isAudioNetworkConstrained()).toBe(false);
    expect(canBulkCacheAudio()).toBe(true);
  });

  it('notifies listeners when the browser reports a connection change', () => {
    setOnline(true);
    const connection = new EventTarget() as EventTarget & { type: string };
    connection.type = 'wifi';
    setConnection(connection);
    const listener = vi.fn();

    const unsubscribe = subscribeAudioNetworkChanges(listener);
    connection.dispatchEvent(new Event('change'));
    window.dispatchEvent(new Event('offline'));
    unsubscribe();
    connection.dispatchEvent(new Event('change'));

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
