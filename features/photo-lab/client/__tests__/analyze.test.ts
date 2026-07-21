import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'device-1' }));

import {
  PHOTO_LAB_ANALYZE_TIMEOUT_MS,
  PhotoLabRequestError,
  requestPhotoAnalysis,
} from '../analyze';

const DATA_URL = 'data:image/jpeg;base64,AAAA';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('requestPhotoAnalysis', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns the labels from a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ labels: [{ id: 'a', word: 'pes' }] })),
    );

    await expect(requestPhotoAnalysis(DATA_URL, 'cs', 'en')).resolves.toEqual([
      { id: 'a', word: 'pes' },
    ]);
  });

  it('maps a 429 to the limit code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ code: 'PHOTO_LAB_LIMIT_REACHED' }, 429)),
    );

    await expect(requestPhotoAnalysis(DATA_URL, 'cs', 'en')).rejects.toMatchObject({
      code: 'limit',
    });
  });

  it('aborts a stalled request instead of hanging forever', async () => {
    // A mobile upload that stalls mid-flight never rejects on its own; without
    // the timeout the caller's spinner would run until the tab is closed.
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = requestPhotoAnalysis(DATA_URL, 'cs', 'en');
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });

    await vi.advanceTimersByTimeAsync(PHOTO_LAB_ANALYZE_TIMEOUT_MS);
    await assertion;
  });

  it('reports a transport failure as generic, not as a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await requestPhotoAnalysis(DATA_URL, 'cs', 'en').catch((err) => err);

    expect(error).toBeInstanceOf(PhotoLabRequestError);
    expect(error).toMatchObject({ code: 'generic' });
  });
});
