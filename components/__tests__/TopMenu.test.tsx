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

  it('opens the word chat in place from the app menu', () => {
    // A link would only change the URL: the learning page reads `?wordChat=1`
    // once on mount, so an in-app navigation to it does nothing visible.
    const onOpenWordChat = vi.fn();
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        onOpenWordChat={onOpenWordChat}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Add words/i }));

    expect(onOpenWordChat).toHaveBeenCalledTimes(1);
  });

  it('keeps the top bar clear of the add-words shortcuts until they are enabled', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        photoLabEnabled
        onOpenWordChat={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Add words by chatting/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Add words from a photo/i })).toBeNull();
  });

  it('opens the word chat in place from the top-bar shortcut', () => {
    const onOpenWordChat = vi.fn();
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        quickAddEnabled
        onOpenWordChat={onOpenWordChat}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add words by chatting/i }));

    expect(onOpenWordChat).toHaveBeenCalledTimes(1);
  });

  it('sends the photo-lab shortcut off with the marker that brings the learner back', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        quickAddEnabled
        photoLabEnabled
      />
    );

    expect(screen.getByRole('link', { name: /Add words from a photo/i })).toHaveAttribute(
      'href',
      '/photo-lab?from=study'
    );
  });

  it('opens photo lab in place from the top-bar shortcut', () => {
    const onOpenPhotoLab = vi.fn();
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        quickAddEnabled
        photoLabEnabled
        onOpenPhotoLab={onOpenPhotoLab}
      />
    );

    const shortcut = screen.getByRole('link', { name: /Add words from a photo/i });
    // Default prevented → the href never navigates away from the deck.
    expect(fireEvent.click(shortcut)).toBe(false);
    expect(onOpenPhotoLab).toHaveBeenCalledTimes(1);
  });

  it('leaves a modifier-click on the photo shortcut to open its own tab', () => {
    const onOpenPhotoLab = vi.fn();
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        quickAddEnabled
        photoLabEnabled
        onOpenPhotoLab={onOpenPhotoLab}
      />
    );

    const shortcut = screen.getByRole('link', { name: /Add words from a photo/i });
    expect(fireEvent.click(shortcut, { metaKey: true })).toBe(true);
    expect(onOpenPhotoLab).not.toHaveBeenCalled();
  });

  it('opens photo lab in place from the app menu', () => {
    const onOpenPhotoLab = vi.fn();
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        photoLabEnabled
        onOpenPhotoLab={onOpenPhotoLab}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Photo lab/i }));

    expect(onOpenPhotoLab).toHaveBeenCalledTimes(1);
  });

  it('drops the photo shortcut for an account that turned photo lab off', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        quickAddEnabled
        photoLabEnabled={false}
      />
    );

    expect(screen.getByRole('button', { name: /Add words by chatting/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Add words from a photo/i })).toBeNull();
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
