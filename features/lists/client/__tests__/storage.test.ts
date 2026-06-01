import { beforeEach, describe, expect, it } from 'vitest';
import {
  readStoredSelectedListId,
  writeStoredSelectedListId,
} from '../storage';

describe('lists client storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shares the selected list with the learning active-list preference', () => {
    writeStoredSelectedListId('list-2');

    expect(readStoredSelectedListId()).toBe('list-2');
    expect(localStorage.getItem('get-word-active-list')).toBe('list-2');
  });

  it('removes the stored selected list when cleared', () => {
    localStorage.setItem('get-word-active-list', 'list-2');

    writeStoredSelectedListId(null);

    expect(readStoredSelectedListId()).toBeNull();
    expect(localStorage.getItem('get-word-active-list')).toBeNull();
  });
});
