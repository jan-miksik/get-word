import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_SURFACE_HISTORY_KEY } from '../surface-history';
import { useAppSurface } from '../useAppSurface';

describe('useAppSurface', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('pushes each surface navigation and follows popstate without another push', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(() => useAppSurface(true));

    act(() => result.current.navigateSurface('chat'));
    expect(window.location.search).toBe('?surface=chat');
    act(() => result.current.navigateSurface('photo'));
    expect(window.location.search).toBe('?surface=photo');
    expect(pushSpy).toHaveBeenCalledTimes(2);

    const chatEntry = {
      ...(window.history.state[APP_SURFACE_HISTORY_KEY] as Record<string, unknown>),
      depth: 1,
      surface: 'chat',
    };
    window.history.replaceState(
      { ...window.history.state, [APP_SURFACE_HISTORY_KEY]: chatEntry },
      '',
      '/?surface=chat',
    );
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));

    await waitFor(() => expect(result.current.activeSurface).toBe('chat'));
    expect(pushSpy).toHaveBeenCalledTimes(2);
    pushSpy.mockRestore();
  });

  it('remembers a lazy surface after returning to study', () => {
    const { result } = renderHook(() => useAppSurface(true));
    expect(result.current.visitedSurfaces).toEqual(new Set(['study']));

    act(() => result.current.navigateSurface('chat'));
    act(() => result.current.navigateSurface('study'));

    expect(result.current.visitedSurfaces).toEqual(new Set(['study', 'chat']));
  });

  it('returns an in-app surface chain to its tracked study root', () => {
    const goSpy = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    const { result } = renderHook(() => useAppSurface(true));

    act(() => result.current.navigateSurface('chat'));
    act(() => result.current.navigateSurface('photo'));
    act(() => result.current.returnToStudy());

    expect(goSpy).toHaveBeenCalledWith(-2);
    goSpy.mockRestore();
  });

  it('replaces a directly loaded surface when there is no study entry to revisit', async () => {
    window.history.replaceState({}, '', '/?surface=chat');
    const { result } = renderHook(() => useAppSurface(true));

    await waitFor(() => expect(result.current.activeSurface).toBe('chat'));
    act(() => result.current.returnToStudy());

    expect(result.current.activeSurface).toBe('study');
    expect(window.location.search).toBe('');
  });

  it('normalizes invalid and disabled photo surfaces to study', async () => {
    window.history.replaceState({}, '', '/?surface=invalid');
    const invalid = renderHook(() => useAppSurface(true));
    await waitFor(() => expect(window.location.search).toBe(''));
    invalid.unmount();

    window.history.replaceState({}, '', '/?surface=photo');
    const disabled = renderHook(() => useAppSurface(false));
    await waitFor(() => expect(disabled.result.current.activeSurface).toBe('study'));
    expect(window.location.search).toBe('');
  });
});
