import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_TODAY_MARK,
  useTodayMarkVariant,
} from '../todayMarkVariant';

describe('today mark variant', () => {
  beforeEach(() => localStorage.clear());

  it('ships the selected viewfinder marker to production surfaces', () => {
    const { result } = renderHook(() => useTodayMarkVariant());

    expect(DEFAULT_TODAY_MARK).toBe('viewfinder');
    expect(result.current).toBe('viewfinder');
  });
});
