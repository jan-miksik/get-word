import { describe, expect, it } from 'vitest';
import {
  APP_SURFACE_HISTORY_MARKER,
  appSurfaceHref,
  parseAppSurface,
  readAppSurfaceHistoryEntry,
  withAppSurfaceHistoryEntry,
} from '../surface-history';

describe('workspace surface history helpers', () => {
  it('maps canonical and legacy URLs to app surfaces', () => {
    expect(parseAppSurface('https://getword.app/')).toBe('study');
    expect(parseAppSurface('https://getword.app/?surface=chat')).toBe('chat');
    expect(parseAppSurface('https://getword.app/?surface=photo')).toBe('photo');
    expect(parseAppSurface('https://getword.app/?wordChat=1')).toBe('chat');
    expect(parseAppSurface('https://getword.app/?surface=unknown')).toBe('study');
    expect(
      parseAppSurface('https://getword.app/?surface=photo', { photoEnabled: false }),
    ).toBe('study');
  });

  it('changes only the workspace query and removes the legacy chat marker', () => {
    expect(
      appSurfaceHref('photo', 'https://getword.app/?preview=1&wordChat=1#result'),
    ).toBe('/?preview=1&surface=photo#result');
    expect(
      appSurfaceHref('study', 'https://getword.app/?preview=1&surface=chat'),
    ).toBe('/?preview=1');
  });

  it('round-trips valid history metadata without discarding other state', () => {
    const entry = {
      marker: APP_SURFACE_HISTORY_MARKER,
      depth: 2,
      baseSurface: 'study' as const,
      surface: 'photo' as const,
    } as const;
    const state = withAppSurfaceHistoryEntry({ existing: true }, entry);
    expect(state.existing).toBe(true);
    expect(readAppSurfaceHistoryEntry(state)).toEqual(entry);
    expect(readAppSurfaceHistoryEntry({ getWordSurface: { ...entry, depth: -1 } })).toBeNull();
  });
});
