import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRoutePath, navigate, subscribeToRoute } from '../router';

describe('native router', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('writes routes into the WebView history and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToRoute(listener);

    navigate('/lists?selected=list-1');

    expect(getRoutePath()).toBe('/lists?selected=list-1');
    expect(window.location.pathname).toBe('/lists');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('maps the standalone photo-lab URL to the integrated native surface', () => {
    navigate('/photo-lab');

    expect(getRoutePath()).toBe('/?surface=photo');
  });

  it('refuses to route an external URL inside the WebView', () => {
    expect(() => navigate('https://evil.test/join/token')).toThrow(/External URL/);
    expect(getRoutePath()).toBe('/');
  });
});
