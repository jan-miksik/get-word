import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppSurfacePanel } from '../AppSurfacePanel';

describe('AppSurfacePanel', () => {
  it('removes an inactive surface from interaction and restores its scroll and focus', async () => {
    const frame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const { container, rerender } = render(
      <AppSurfacePanel surface="chat" active label="Chat">
        <button type="button">Action</button>
      </AppSurfacePanel>,
    );
    const panel = container.querySelector('[data-app-surface="chat"]') as HTMLElement;
    panel.scrollTop = 240;

    rerender(
      <AppSurfacePanel surface="chat" active={false} label="Chat">
        <button type="button">Action</button>
      </AppSurfacePanel>,
    );
    expect(panel).toHaveAttribute('hidden');
    expect(panel).toHaveAttribute('inert');

    panel.scrollTop = 0;
    rerender(
      <AppSurfacePanel surface="chat" active label="Chat">
        <button type="button">Action</button>
      </AppSurfacePanel>,
    );

    await waitFor(() => expect(panel.scrollTop).toBe(240));
    expect(panel).toHaveFocus();
    frame.mockRestore();
  });
});
