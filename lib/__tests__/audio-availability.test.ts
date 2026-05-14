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
});
