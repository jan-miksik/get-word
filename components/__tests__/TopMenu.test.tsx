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
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    const supportLink = screen.getByRole('menuitem', { name: /Chat with support/i });
    expect(supportLink).toHaveAttribute('href', SUPPORT_TELEGRAM_URL);
    expect(supportLink).toHaveAttribute('target', '_blank');
  });

  it('offers Learning settings instead of the removed Progress item', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    expect(screen.getByRole('menuitem', { name: /learning settings/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^progress$/i })).not.toBeInTheDocument();
  });

  it('confirms school membership and links teachers to the dashboard', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        school={{ id: 'school-a', name: 'Pilot School', role: 'teacher' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    expect(screen.getByText('Teacher at Pilot School')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /School overview/i })).toHaveAttribute(
      'href',
      '/school/overview'
    );
  });

  it('confirms membership for students but keeps the dashboard out of their menu', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        school={{ id: 'school-a', name: 'Pilot School', role: 'student' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    expect(screen.getByText('Student at Pilot School')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /School overview/i })).toBeNull();
  });

  it('shows nothing school-related for an account with no membership', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    expect(screen.queryByText(/at Pilot School/)).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /School overview/i })).toBeNull();
  });
});
