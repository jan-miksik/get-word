import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkAudioUrlAvailable,
  clearAudioAvailabilityCache,
  getPlayableAudioUrl,
} from '../audio-availability';

const clipPlaybackMocks = vi.hoisted(() => ({
  getWarmedClipUrl: vi.fn(),
  getLocalClipUrl: vi.fn(),
}));

vi.mock('@/lib/audio-clip-playback', () => clipPlaybackMocks);

describe('audio availability', () => {
  beforeEach(() => {
    clearAudioAvailabilityCache();
    vi.restoreAllMocks();
    clipPlaybackMocks.getLocalClipUrl.mockReset();
    clipPlaybackMocks.getLocalClipUrl.mockResolvedValue(null);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'onLine');
  });

  it('logs missing audio files in development when HEAD returns 404', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    global.fetch = vi.fn(async () => new Response(null, { status: 404 }));

    await expect(checkAudioUrlAvailable('/speech/cz/missing.mp3')).resolves.toBe(false);

    expect(global.fetch).toHaveBeenCalledWith(
      '/speech/cz/missing.mp3',
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      '[AudioAvailability] Missing audio file',
      expect.objectContaining({
        url: '/speech/cz/missing.mp3',
        method: 'HEAD',
        status: 404,
      }),
    );
  });

  it('returns null for playback when availability has already been cached as missing', async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 404 }));

    await expect(checkAudioUrlAvailable('/speech/cz/missing.mp3')).resolves.toBe(false);
    await expect(getPlayableAudioUrl('/speech/cz/missing.mp3')).resolves.toBeNull();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('checks cached audio without probing the network while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const cachedUrl = 'https://turbo-gateway.com/tx-cached';
    vi.stubGlobal('caches', {
      open: async () => ({
        match: async (url: string) => (url === cachedUrl ? new Response('ok') : undefined),
      }),
    });
    global.fetch = vi.fn();

    await expect(getPlayableAudioUrl(cachedUrl)).resolves.toBe(cachedUrl);
    await expect(checkAudioUrlAvailable(cachedUrl)).resolves.toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('plays a locally stored clip without probing the proxy or the gateways', async () => {
    clipPlaybackMocks.getLocalClipUrl.mockResolvedValue('blob:local-clip');
    global.fetch = vi.fn();

    await expect(getPlayableAudioUrl('/api/audio/hash-fresh')).resolves.toBe('blob:local-clip');
    await expect(checkAudioUrlAvailable('/api/audio/hash-fresh')).resolves.toBe(true);

    expect(clipPlaybackMocks.getLocalClipUrl).toHaveBeenCalledWith('hash-fresh');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back from a broken Arweave gateway URL to the next configured gateway', async () => {
    global.fetch = vi.fn(async (input) => {
      const url = String(input);
      return new Response(null, {
        status: url.startsWith('https://turbo-gateway.com/') ? 200 : 404,
      });
    });

    await expect(getPlayableAudioUrl('https://ar-io.net/tx123')).resolves.toBe(
      'https://turbo-gateway.com/tx123',
    );
    await expect(checkAudioUrlAvailable('https://ar-io.net/tx123')).resolves.toBe(true);

    // arweave.net is probed first (and 404s in this mock) before the fallback
    // gateway answers.
    expect(global.fetch).toHaveBeenCalledWith(
      'https://arweave.net/tx123',
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://turbo-gateway.com/tx123',
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
