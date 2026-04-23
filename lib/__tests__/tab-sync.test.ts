import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postTabMessage, subscribeTabMessages } from '../tab-sync';

type Listener = (event: MessageEvent) => void;
const listeners: Listener[] = [];
const postedMessages: unknown[] = [];

class MockBroadcastChannel {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  postMessage(message: unknown) {
    postedMessages.push(message);
  }
  addEventListener(_type: 'message', listener: Listener) {
    listeners.push(listener);
  }
  removeEventListener(_type: 'message', listener: Listener) {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  }
  close() {}
}

describe('tab sync channel', () => {
  beforeEach(() => {
    listeners.length = 0;
    postedMessages.length = 0;
    sessionStorage.clear();
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('session-1' as `${string}-${string}-${string}-${string}-${string}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('adds the current tab session id to outbound messages', () => {
    postTabMessage({
      type: 'game_score_changed',
      score: 4,
    });

    expect(postedMessages).toEqual([
      { type: 'game_score_changed', score: 4, sessionId: 'session-1' },
    ]);
  });

  it('ignores messages from the same session', () => {
    const handler = vi.fn();
    subscribeTabMessages(handler);

    listeners[0](new MessageEvent('message', {
      data: { type: 'game_score_changed', score: 4, sessionId: 'session-1' },
    }));

    expect(handler).not.toHaveBeenCalled();
  });
});
