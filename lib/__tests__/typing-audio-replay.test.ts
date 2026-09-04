import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TYPING_AUDIO_REPLAY_HIDE_FROM_STAGE,
  normalizeTypingAudioReplayHideFromStage,
  shouldShowTypingAudioReplayBeforeAnswer,
} from '@/lib/words';

describe('normalizeTypingAudioReplayHideFromStage', () => {
  it('keeps valid in-range stages', () => {
    expect(normalizeTypingAudioReplayHideFromStage(4)).toBe(4);
  });

  it('falls back to the default for out-of-range or junk values', () => {
    expect(normalizeTypingAudioReplayHideFromStage(0)).toBe(
      DEFAULT_TYPING_AUDIO_REPLAY_HIDE_FROM_STAGE,
    );
    expect(normalizeTypingAudioReplayHideFromStage(99)).toBe(
      DEFAULT_TYPING_AUDIO_REPLAY_HIDE_FROM_STAGE,
    );
    expect(normalizeTypingAudioReplayHideFromStage('nope')).toBe(
      DEFAULT_TYPING_AUDIO_REPLAY_HIDE_FROM_STAGE,
    );
  });
});

describe('shouldShowTypingAudioReplayBeforeAnswer', () => {
  it('shows below the cutoff and hides at/above it, at the default (14 days)', () => {
    expect(shouldShowTypingAudioReplayBeforeAnswer(4, DEFAULT_TYPING_AUDIO_REPLAY_HIDE_FROM_STAGE))
      .toBe(true); // 7 days
    expect(shouldShowTypingAudioReplayBeforeAnswer(5, DEFAULT_TYPING_AUDIO_REPLAY_HIDE_FROM_STAGE))
      .toBe(false); // 14 days
    expect(shouldShowTypingAudioReplayBeforeAnswer(7, DEFAULT_TYPING_AUDIO_REPLAY_HIDE_FROM_STAGE))
      .toBe(false); // 60 days
  });

  it('respects a custom cutoff', () => {
    expect(shouldShowTypingAudioReplayBeforeAnswer(3, 4)).toBe(true);
    expect(shouldShowTypingAudioReplayBeforeAnswer(4, 4)).toBe(false);
  });

  it('treats a junk cutoff as the default (stage 5)', () => {
    expect(shouldShowTypingAudioReplayBeforeAnswer(4, Number.NaN)).toBe(true);
    expect(shouldShowTypingAudioReplayBeforeAnswer(5, Number.NaN)).toBe(false);
  });
});
