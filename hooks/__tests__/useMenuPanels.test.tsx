import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useMenuPanels } from '../useMenuPanels';

function MenuPanelsHarness() {
  const { settingsOpen, toggle } = useMenuPanels();
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
    </>
  );
}

describe('useMenuPanels', () => {
  it('keeps a panel open when selected from an unmounting menu item', () => {
    render(<MenuPanelsHarness />);

    fireEvent.click(screen.getByRole('button', { name: /settings/i }));

    expect(screen.getByLabelText(/settings/i)).toHaveClass('is-open');
  });
});
