import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAudioAvailabilityCache,
  getPlayableAudioUrl,
} from '../audio-availability';

beforeEach(() => {
  clearAudioAvailabilityCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearAudioAvailabilityCache();
});

describe('audio availability resolver', () => {
  it('returns a cache hit before touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const cachedUrl = 'https://turbo-gateway.com/tx-cached';
    const cacheMatch = vi.fn(async (req: Request | string) => {
      const url = typeof req === 'string' ? req : req.url;
      return url === cachedUrl ? new Response('ok') : undefined;
    });
    vi.stubGlobal('caches', {
      open: async () => ({ match: cacheMatch }),
    });

    const result = await getPlayableAudioUrl(cachedUrl);
    expect(result).toBe(cachedUrl);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls through gateway candidates when the first one 503s', async () => {
    const fetchMock = vi.fn(async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('turbo-gateway.com')) return new Response('boom', { status: 503 });
      if (url.includes('arweave.net')) return new Response('boom', { status: 503 });
      if (url.includes('ar-io.net')) return new Response(null, { status: 200 });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', {
      open: async () => ({ match: async () => undefined }),
    });

    const result = await getPlayableAudioUrl('https://turbo-gateway.com/tx-abc');
    expect(result).toBe('https://ar-io.net/tx-abc');
    const calledUrls = fetchMock.mock.calls.map(([req]) =>
      typeof req === 'string' ? req : (req as Request).url,
    );
    expect(calledUrls.some((u) => u.includes('turbo-gateway.com'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('ar-io.net'))).toBe(true);
  });

  it('returns null when every gateway times out or fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', {
      open: async () => ({ match: async () => undefined }),
    });

    const result = await getPlayableAudioUrl('https://turbo-gateway.com/tx-dead');
    expect(result).toBeNull();
  });
});
