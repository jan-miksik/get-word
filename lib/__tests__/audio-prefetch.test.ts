import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearPrefetchCache,
  getPrefetchedAudioUrl,
  prefetchAudio,
} from '../audio-prefetch';

describe('audio prefetch', () => {
  const load = vi.fn();
  const pause = vi.fn();
  const cacheMatch = vi.fn(async () => undefined);
  const cachePut = vi.fn(async () => undefined);
  let nextBlobId = 0;

  beforeEach(() => {
    load.mockClear();
    pause.mockClear();
    cacheMatch.mockClear();
    cachePut.mockClear();
    nextBlobId = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response(new Blob(['audio-bytes'], { type: 'audio/mpeg' }), { status: 200 })
    )));
    vi.stubGlobal('caches', {
      open: async () => ({ match: cacheMatch, put: cachePut }),
    });
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:audio-${++nextBlobId}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal(
      'Audio',
      vi.fn().mockImplementation(function FakeAudio(this: {
        preload: string;
        src: string;
        load: () => void;
        pause: () => void;
        removeAttribute: () => void;
      }) {
        this.preload = '';
        this.src = '';
        this.load = load;
        this.pause = pause;
        this.removeAttribute = () => {};
      }),
    );
  });

  afterEach(() => {
    clearPrefetchCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downloads upcoming clips into local blob URLs and deduplicates them', async () => {
    const urls = Array.from({ length: 12 }, (_, index) => `/speech/vi/${index}.mp3`);

    await prefetchAudio(urls);
    expect(Audio).toHaveBeenCalledTimes(4);
    expect(load).toHaveBeenCalledTimes(4);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(cachePut).toHaveBeenCalledTimes(4);
    expect(getPrefetchedAudioUrl(urls[0])).toBe('blob:audio-1');

    await prefetchAudio(urls);

    expect(Audio).toHaveBeenCalledTimes(8);
    expect(load).toHaveBeenCalledTimes(8);
    expect(fetch).toHaveBeenCalledTimes(8);
  });

  it('keeps only a bounded window of media elements alive', async () => {
    for (let batch = 0; batch < 3; batch += 1) {
      await prefetchAudio(
        Array.from({ length: 10 }, (_, index) => `/speech/vi/${batch}-${index}.mp3`),
      );
    }

    clearPrefetchCache();

    expect(Audio).toHaveBeenCalledTimes(12);
    expect(pause).toHaveBeenCalledTimes(12);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(12);
  });
});
