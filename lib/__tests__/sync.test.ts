import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../device-id', () => ({
  getDeviceId: () => 'device-1',
}));

vi.mock('../session-id', () => ({
  getSessionId: () => 'session-1',
}));

import { fetchUserData, resetSyncIdentity, SyncRequestError, syncUserData } from '../sync';

const nextErrorHtml = `<!DOCTYPE html><html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"statusCode":500}},"page":"/_error","err":{"name":"Internal Server Error.","message":"500 - Internal Server Error.","statusCode":500}}</script></body></html>`;

describe('sync client errors', () => {
  beforeEach(() => {
    resetSyncIdentity();
    vi.restoreAllMocks();
  });

  it('does not surface a full Next HTML error document from fetchUserData', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(nextErrorHtml, {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })),
    );

    await expect(fetchUserData()).rejects.toThrow(
      'Failed to fetch user data: 500 Internal Server Error. Server returned 500: 500 - Internal Server Error.',
    );
  });

  it('does not surface a full Next HTML error document from syncUserData', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(nextErrorHtml, {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })),
    );

    await expect(syncUserData({ language_from: 'en' })).rejects.toThrow(
      'Failed to sync data: 500 Internal Server Error. Server returned 500: 500 - Internal Server Error.',
    );
  });

  it('preserves structured per-operation results on a rejected sync response', async () => {
    const payload = {
      success: false,
      error: 'Stale revision',
      code: 'SYNC_CONFLICT',
      op_results: [{ clientOpId: 'language-1', status: 'conflict', code: 'STALE_REVISION' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      })),
    );

    const error = await syncUserData({ settings_language: 'cs' }).catch((caught) => caught);

    expect(error).toBeInstanceOf(SyncRequestError);
    expect(error).toMatchObject({ status: 409, payload });
  });

  it('bounds the hydration fetch so a stalled request cannot hang the boot', async () => {
    // A stalled request used to leave the promise pending forever, which held
    // the app on its loading screen with no way out.
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchUserData()).rejects.toThrow(/timed out after \d+ms/);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('includes submitted review events in the local server-sync event detail', async () => {
    const reviewEvent = {
      client_event_id: 'event-1',
      word_id: 'w001',
      action: 'known' as const,
      client_created_at: 1_779_625_000_000,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        success: true,
        applied_review_event_ids: ['event-1'],
        user: { id: 'user-1' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
    );
    const listener = vi.fn();
    window.addEventListener('get-word:server-sync', listener);

    await syncUserData({ review_events: [reviewEvent] });

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        submitted_review_events: [reviewEvent],
      }),
    }));
    window.removeEventListener('get-word:server-sync', listener);
  });

  it('can defer publication until the outbox has checkpointed its ack', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        success: true,
        user: { id: 'user-1' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
    );
    const listener = vi.fn();
    window.addEventListener('get-word:server-sync', listener);

    await syncUserData({ game_score: 1 }, { emitEvent: false });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('get-word:server-sync', listener);
  });

});
