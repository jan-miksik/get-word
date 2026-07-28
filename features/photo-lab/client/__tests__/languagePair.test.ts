import { beforeEach, describe, expect, it } from 'vitest';
import {
  readPhotoLabLanguagePair,
  storePhotoLabLanguagePair,
} from '@/features/photo-lab/client/languagePair';
import {
  clearPendingLearningLanguagePair,
  readPendingLearningLanguagePair,
  storePendingLearningLanguagePair,
} from '@/features/shared/languages/learningPairStorage';

describe('Photo Lab language-pair storage', () => {
  beforeEach(() => localStorage.clear());

  it('preserves the existing storage key and pair shape', () => {
    storePhotoLabLanguagePair({ from: 'cs', to: 'vi' });

    expect(localStorage.getItem('get-word-photo-lab-langs')).toBe(
      JSON.stringify({ from: 'cs', to: 'vi' }),
    );
    expect(readPhotoLabLanguagePair()).toEqual({ from: 'cs', to: 'vi' });
  });

  it('ignores malformed or non-string fields', () => {
    localStorage.setItem('get-word-photo-lab-langs', JSON.stringify({ from: 1, to: 'en' }));
    expect(readPhotoLabLanguagePair()).toEqual({ from: undefined, to: 'en' });

    localStorage.setItem('get-word-photo-lab-langs', '{bad json');
    expect(readPhotoLabLanguagePair()).toEqual({});
  });

  it('keeps an unconfirmed pair across a remount until it is cleared', () => {
    const pending = {
      from: 'cs',
      to: 'vi',
      changedAt: '2026-07-28T12:00:00.000Z',
    };
    storePendingLearningLanguagePair(pending);

    expect(readPendingLearningLanguagePair()).toEqual(pending);
    clearPendingLearningLanguagePair();
    expect(readPendingLearningLanguagePair()).toBeNull();
  });
});
