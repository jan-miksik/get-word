import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryHooksSection } from '../MemoryHooksSection';
import { OPEN_MEMORY_HOOKS_PANEL_EVENT } from '@/lib/ui-events';

let memoryHooksEnabled = true;

vi.mock('@/context/AppStateContext', () => ({
  useAppStateContext: () => ({
    memoryHooksEnabled,
    setMemoryHooksEnabled: vi.fn(),
    memoryHookDisableFromStage: 0,
    setMemoryHookDisableFromStage: vi.fn(),
  }),
}));

describe('MemoryHooksSection', () => {
  beforeEach(() => {
    memoryHooksEnabled = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the memory hooks info panel via the learn-more link', async () => {
    const dispatched = vi.fn();
    window.addEventListener(OPEN_MEMORY_HOOKS_PANEL_EVENT, dispatched);

    render(<MemoryHooksSection />);
    await userEvent.click(screen.getByRole('button', { name: /what are memory hooks/i }));

    expect(dispatched).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_MEMORY_HOOKS_PANEL_EVENT, dispatched);
  });
});
