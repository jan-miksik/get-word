import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApiRuntime } from '@/features/shared/http/api-runtime';
import { clearAudioAvailabilityCache, getPlayableAudioUrl } from '../audio-availability';
import { playUserInitiatedAudio, resetAudioRepeatState } from '../audio-playback';
import { clearPrefetchCache, prefetchAudio } from '../audio-prefetch';

const clipPlaybackMocks = vi.hoisted(() => ({
  getWarmedClipUrl: vi.fn(),
  getLocalClipUrl: vi.fn(),
}));

vi.mock('@/lib/audio-clip-playback', () => clipPlaybackMocks);

describe('playUserInitiatedAudio', () => {
  beforeEach(() => {
    clearAudioAvailabilityCache();
    resetAudioRepeatState();
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

    expect(result).toEqual({ ok: true, interrupted: false, rate: 1 });
    expect(attemptedSources).toEqual([
      '/speech/vi/missing.mp3',
      '/speech/vi/dog.mp3',
    ]);
  });

  it('points app-relative sources at the API host for the native client', async () => {
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

    configureApiRuntime({ origin: 'https://getword.app' });
    try {
      const audioRef = { current: null };
      // An <audio> src is resolved against the page, so the bundle's own
      // capacitor:// origin would 404 on every clip served by the proxy.
      await playUserInitiatedAudio(audioRef, '/api/audio/hash-1');
      expect(attemptedSources).toEqual(['https://getword.app/api/audio/hash-1']);
    } finally {
      configureApiRuntime({ origin: '' });
    }
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

  describe('slow replay on a repeated press', () => {
    const stubAudio = (rates: number[]) => {
      vi.stubGlobal(
        'Audio',
        vi.fn().mockImplementation(function FakeAudio(this: {
          playbackRate: number;
          defaultPlaybackRate: number;
          preservesPitch: boolean;
          play: () => Promise<void>;
          pause: () => void;
        }) {
          this.playbackRate = 1;
          this.defaultPlaybackRate = 1;
          this.preservesPitch = false;
          this.play = () => {
            rates.push(this.playbackRate);
            return Promise.resolve();
          };
          this.pause = () => {};
        }),
      );
    };

    it('halves the rate on the second press and returns to normal on the third', async () => {
      const rates: number[] = [];
      stubAudio(rates);
      const audioRef = { current: null };

      const first = await playUserInitiatedAudio(audioRef, '/speech/vi/dog.mp3');
      const second = await playUserInitiatedAudio(audioRef, '/speech/vi/dog.mp3');
      const third = await playUserInitiatedAudio(audioRef, '/speech/vi/dog.mp3');

      expect(rates).toEqual([1, 0.5, 1]);
      expect([first.rate, second.rate, third.rate]).toEqual([1, 0.5, 1]);
    });

    it('keeps pitch while playing at half speed', async () => {
      const rates: number[] = [];
      stubAudio(rates);
      const audioRef = { current: null as HTMLAudioElement | null };

      await playUserInitiatedAudio(audioRef, '/speech/vi/dog.mp3');
      await playUserInitiatedAudio(audioRef, '/speech/vi/dog.mp3');

      expect(audioRef.current?.preservesPitch).toBe(true);
      expect(audioRef.current?.defaultPlaybackRate).toBe(0.5);
    });

    it('starts at normal speed when a different word is played in between', async () => {
      const rates: number[] = [];
      stubAudio(rates);
      const audioRef = { current: null };

      await playUserInitiatedAudio(audioRef, '/speech/vi/dog.mp3');
      await playUserInitiatedAudio(audioRef, '/speech/vi/cat.mp3');
      await playUserInitiatedAudio(audioRef, '/speech/vi/dog.mp3');

      expect(rates).toEqual([1, 1, 1]);
    });

    it('starts at normal speed when the repeat window has passed', async () => {
      const rates: number[] = [];
      stubAudio(rates);
      const audioRef = { current: null };
      const now = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

      await playUserInitiatedAudio(audioRef, '/speech/vi/dog.mp3');
      nowSpy.mockReturnValue(now + 60_000);
      await playUserInitiatedAudio(audioRef, '/speech/vi/dog.mp3');

      expect(rates).toEqual([1, 1]);
    });

    it('stays at normal speed when the caller opts out', async () => {
      const rates: number[] = [];
      stubAudio(rates);
      const audioRef = { current: null };

      await playUserInitiatedAudio(audioRef, '/speech/vi/dog.mp3', { slowOnRepeat: false });
      await playUserInitiatedAudio(audioRef, '/speech/vi/dog.mp3', { slowOnRepeat: false });

      expect(rates).toEqual([1, 1]);
    });
  });
});
