import { describe, expect, it, vi } from 'vitest';

import { playUserInitiatedAudio } from '../audio-playback';

describe('playUserInitiatedAudio', () => {
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
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
  });
});
