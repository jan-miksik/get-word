import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useMenuPanels } from '../useMenuPanels';
import { OPEN_MEMORY_HOOKS_PANEL_EVENT } from '@/lib/ui-events';

function MenuPanelsHarness() {
  const { settingsOpen, memoryHooksOpen, toggle } = useMenuPanels();
  const [menuOpen, setMenuOpen] = useState(true);

  return (
    <>
      <div className="top-menu-dropdown">
        {menuOpen && (
          <div className="menu-dropdown-popup">
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                toggle('settings');
                setMenuOpen(false);
              }}
            >
              Settings
            </button>
          </div>
        )}
      </div>
      <section
        aria-label="Settings"
        className={`settings-panel ${settingsOpen ? 'is-open' : ''}`}
      />
      <button
        type="button"
        data-memory-hooks-learn-more
        onClick={() => window.dispatchEvent(new Event(OPEN_MEMORY_HOOKS_PANEL_EVENT))}
      >
        Open memory hooks
      </button>
      <section
        aria-label="Memory hooks"
        className={`memory-hooks-panel ${memoryHooksOpen ? 'is-open' : ''}`}
      />
    </>
  );
}

describe('useMenuPanels', () => {
  it('keeps a panel open when selected from an unmounting menu item', () => {
    render(<MenuPanelsHarness />);

    fireEvent.click(screen.getByRole('button', { name: /settings/i }));

    expect(screen.getByLabelText(/settings/i)).toHaveClass('is-open');
  });

  it('keeps the memory hooks panel open when opened from a page click event', () => {
    render(<MenuPanelsHarness />);

    fireEvent.click(screen.getByRole('button', { name: /open memory hooks/i }));

    expect(screen.getByLabelText(/memory hooks/i)).toHaveClass('is-open');
  });
});
