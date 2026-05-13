import { act } from 'react';
import { render } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLogo } from '@/components/AppLogo';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppLogo', () => {
  it('keeps the logo fill pattern stable', () => {
    const randomSpy = vi.spyOn(Math, 'random');

    const { container } = render(<AppLogo />);
    const pattern = container.querySelector('pattern[id^="gw-fill"]');

    expect(pattern?.getAttribute('patternTransform')).toBe('matrix(2.5,0,0,2.5,165,570)');
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('keeps the server and initial client markup hydration-safe', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');

    container.innerHTML = renderToString(<AppLogo size={88} showLabel />);

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <AppLogo size={88} showLabel />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(
      errorSpy.mock.calls.some(call => String(call[0]).includes('Hydration failed'))
    ).toBe(false);

    await act(async () => {
      root?.unmount();
    });
  });
});
