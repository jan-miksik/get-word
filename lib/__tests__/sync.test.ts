import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../device-id', () => ({
  getDeviceId: () => 'device-1',
}));

vi.mock('../session-id', () => ({
  getSessionId: () => 'session-1',
}));

import { fetchUserData, resetSyncIdentity, syncUserData } from '../sync';

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
});
