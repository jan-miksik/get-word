import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkAudioUrlAvailable,
  clearAudioAvailabilityCache,
  getPlayableAudioUrl,
} from '../audio-availability';

describe('audio availability', () => {
  beforeEach(() => {
    clearAudioAvailabilityCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('logs missing audio files in development when HEAD returns 404', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 } as Response));

    await expect(checkAudioUrlAvailable('/speech/cz/missing.mp3')).resolves.toBe(false);

    expect(global.fetch).toHaveBeenCalledWith('/speech/cz/missing.mp3', { method: 'HEAD' });
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
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 } as Response));

    await expect(checkAudioUrlAvailable('/speech/cz/missing.mp3')).resolves.toBe(false);
    await expect(getPlayableAudioUrl('/speech/cz/missing.mp3')).resolves.toBeNull();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back from a broken Arweave gateway URL to the next configured gateway', async () => {
    global.fetch = vi.fn(async (input) => {
      const url = String(input);
      return {
        ok: url.startsWith('https://turbo-gateway.com/'),
        status: url.startsWith('https://turbo-gateway.com/') ? 200 : 404,
      } as Response;
    });

    await expect(getPlayableAudioUrl('https://ar-io.net/tx123')).resolves.toBe(
      'https://turbo-gateway.com/tx123',
    );
    await expect(checkAudioUrlAvailable('https://ar-io.net/tx123')).resolves.toBe(true);

    expect(global.fetch).toHaveBeenCalledWith('https://turbo-gateway.com/tx123', { method: 'HEAD' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
