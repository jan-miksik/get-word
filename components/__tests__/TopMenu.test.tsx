import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SUPPORT_TELEGRAM_URL } from '../SupportButton';
import { TopMenu } from '../TopMenu';

describe('TopMenu', () => {
  it('removes the active menu button shadow while preserving active state', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={1}
        categoryActive
        progressActive={false}
      />
    );

    const menuButton = screen.getByRole('button', { name: /open menu/i });
    expect(menuButton).toHaveClass('is-active');
    expect(menuButton).toHaveClass('!shadow-none');
  });

  it('includes Telegram support in the menu', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        progressActive={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    const supportLink = screen.getByRole('menuitem', { name: /Chat with support/i });
    expect(supportLink).toHaveAttribute('href', SUPPORT_TELEGRAM_URL);
    expect(supportLink).toHaveAttribute('target', '_blank');
  });
});
