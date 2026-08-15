import { describe, expect, it } from 'vitest';
import { readPhotoLabPreference } from '../preferences';

describe('readPhotoLabPreference', () => {
  it('keeps Photo Lab available when a legacy PWA install stored false', () => {
    window.localStorage.setItem('get-word-photo-lab-enabled', 'false');

    expect(readPhotoLabPreference()).toBe(true);
  });
});
