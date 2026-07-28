import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAudioAvailabilityCache, getPlayableAudioUrl } from '../audio-availability';
import { playUserInitiatedAudio } from '../audio-playback';
import { clearPrefetchCache, prefetchAudio } from '../audio-prefetch';

const clipPlaybackMocks = vi.hoisted(() => ({
  getWarmedClipUrl: vi.fn(),
  getLocalClipUrl: vi.fn(),
}));

vi.mock('@/lib/audio-clip-playback', () => clipPlaybackMocks);

describe('playUserInitiatedAudio', () => {
  beforeEach(() => {
    clearAudioAvailabilityCache();
    clipPlaybackMocks.getWarmedClipUrl.mockReset();
    clipPlaybackMocks.getWarmedClipUrl.mockReturnValue(null);
    clipPlaybackMocks.getLocalClipUrl.mockReset();
    clipPlaybackMocks.getLocalClipUrl.mockResolvedValue(null);
  });

  afterEach(() => {
    clearPrefetchCache();
    clearAudioAvailabilityCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls play synchronously while the triggering interaction is active', () => {
    let userActivation = true;
    const play = vi.fn(() => {
      expect(userActivation).toBe(true);
      return Promise.resolve();
    });

    vi.stubGlobal(
      'Audio',
      vi.fn().mockImplementation(function FakeAudio(this: { play: () => Promise<void>; pause: () => void }) {
        this.play = play;
        this.pause = () => {};
      }),
    );

    const audioRef = { current: null };
    void playUserInitiatedAudio(audioRef, '/speech/vi/dog.mp3');
    userActivation = false;

    expect(play).toHaveBeenCalledTimes(1);
  });

  it('reuses the activated audio element for a later source after a load failure', async () => {
    const attemptedSources: string[] = [];
    vi.stubGlobal(
      'Audio',
      vi.fn().mockImplementation(function FakeAudio(this: {
        src: string;
        onerror: (() => void) | null;
        play: () => Promise<void>;
        pause: () => void;
        load: () => void;
      }, src: string) {
        this.src = src;
        this.onerror = null;
        this.play = () => {
          attemptedSources.push(this.src);
          return this.src.includes('missing')
            ? Promise.reject(new Error('not found'))
            : Promise.resolve();
        };
        this.pause = () => {};
        this.load = () => {};
      }),
    );

    const audioRef = { current: null };
    const result = await playUserInitiatedAudio(audioRef, [
      '/speech/vi/missing.mp3',
      '/speech/vi/dog.mp3',
    ]);

    expect(result).toEqual({ ok: true, interrupted: false });
    expect(attemptedSources).toEqual([
      '/speech/vi/missing.mp3',
      '/speech/vi/dog.mp3',
    ]);
  });

  it('starts playback with the gateway already verified by warmup', async () => {
    vi.stubGlobal('caches', {
      open: async () => ({ match: async () => undefined }),
    });
    vi.stubGlobal('fetch', vi.fn(async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input.url;
      return new Response(null, { status: url.includes('ar-io.net') ? 200 : 503 });
    }));

    const originalUrl = 'https://turbo-gateway.com/tx-warmed';
    await getPlayableAudioUrl(originalUrl);

    const attemptedSources: string[] = [];
    vi.stubGlobal(
      'Audio',
      vi.fn().mockImplementation(function FakeAudio(this: {
        src: string;
        play: () => Promise<void>;
        pause: () => void;
      }, src: string) {
        this.src = src;
        this.play = () => {
          attemptedSources.push(this.src);
          return Promise.resolve();
        };
        this.pause = () => {};
      }),
    );

    await playUserInitiatedAudio({ current: null }, originalUrl);

    expect(attemptedSources[0]).toBe('https://ar-io.net/tx-warmed');
  });

  it('starts playback from a fully downloaded local blob when available', async () => {
    vi.stubGlobal('caches', {
      open: async () => ({
        match: async () => undefined,
        put: async () => undefined,
      }),
    });
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response(new Blob(['audio-bytes'], { type: 'audio/mpeg' }), { status: 200 })
    )));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ready-audio');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const attemptedSources: string[] = [];
    vi.stubGlobal(
      'Audio',
      vi.fn().mockImplementation(function FakeAudio(this: {
        src: string;
        preload: string;
        play: () => Promise<void>;
        pause: () => void;
        load: () => void;
        removeAttribute: () => void;
      }, src = '') {
        this.src = src;
        this.preload = '';
        this.play = () => {
          attemptedSources.push(this.src);
          return Promise.resolve();
        };
        this.pause = () => {};
        this.load = () => {};
        this.removeAttribute = () => {};
      }),
    );

    const source = '/speech/vi/ready.mp3';
    await prefetchAudio([source]);
    await playUserInitiatedAudio({ current: null }, source);

    expect(attemptedSources[0]).toBe('blob:ready-audio');
  });

  it('prefers clip-store bytes over the proxy for a freshly generated clip', async () => {
    clipPlaybackMocks.getWarmedClipUrl.mockImplementation((hash: string) =>
      hash === 'hash-fresh' ? 'blob:fresh-clip' : null,
    );

    const attemptedSources: string[] = [];
    vi.stubGlobal(
      'Audio',
      vi.fn().mockImplementation(function FakeAudio(this: {
        src: string;
        play: () => Promise<void>;
        pause: () => void;
      }, src: string) {
        this.src = src;
        this.play = () => {
          attemptedSources.push(this.src);
          return Promise.resolve();
        };
        this.pause = () => {};
      }),
    );

    await playUserInitiatedAudio({ current: null }, '/api/audio/hash-fresh');

    expect(attemptedSources[0]).toBe('blob:fresh-clip');
  });
});
