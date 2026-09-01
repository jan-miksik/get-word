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

  it('offers the globally persisted study-pair switcher in the main menu', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        learningLanguagePair={{ from: 'cs', to: 'vi' }}
        onLearningLanguagePairChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    expect(screen.getByRole('menuitem', { name: /change languages/i })).toBeInTheDocument();
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

  it('shows the study and chat shortcuts by default', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        onOpenWordChat={vi.fn()}
      />
    );

    expect(screen.getByRole('link', { name: /Study words/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add your own words/i })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('link', { name: /Add your own words/i }));

    expect(onOpenWordChat).toHaveBeenCalledTimes(1);
  });

  it('offers the way back to studying next to the add-words shortcuts', () => {
    const onSurfaceChange = vi.fn();
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        quickAddEnabled
        activeSurface="chat"
        onSurfaceChange={onSurfaceChange}
      />
    );

    const study = screen.getByRole('link', { name: /Study words/i });
    expect(study).toHaveAttribute('href', '/');
    expect(study).not.toHaveAttribute('aria-current');

    fireEvent.click(study);
    expect(onSurfaceChange).toHaveBeenCalledWith('study');
  });

  it('keeps the camera out of the menu now that it is a tab on Add words', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        quickAddEnabled
      />
    );

    expect(screen.queryByRole('link', { name: /Add words from a photo/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.queryByRole('menuitem', { name: /Photo lab/i })).toBeNull();
  });

  it('marks the active shortcut as current and treats another shortcut as navigation', () => {
    const onSurfaceChange = vi.fn();
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        quickAddEnabled
        activeSurface="chat"
        onSurfaceChange={onSurfaceChange}
      />
    );

    const chat = screen.getByRole('link', { name: /Add your own words/i });
    const study = screen.getByRole('link', { name: /Study words/i });
    expect(chat).toHaveAttribute('aria-current', 'page');
    expect(study).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('menuitem', { name: /^Add words$/i })).toHaveAttribute(
      'aria-current',
      'page',
    );

    fireEvent.click(chat);
    expect(onSurfaceChange).not.toHaveBeenCalled();
    fireEvent.click(study);
    expect(onSurfaceChange).toHaveBeenCalledWith('study');
  });

  it('keeps Add words lit while the photo tab of it is showing', () => {
    const onSurfaceChange = vi.fn();
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        quickAddEnabled
        activeSurface="photo"
        onSurfaceChange={onSurfaceChange}
      />
    );

    // The camera is a tab of Add words, so the learner is still inside that
    // errand — but pressing the shortcut is a move back to the typing tab.
    const chat = screen.getByRole('link', { name: /Add your own words/i });
    expect(chat).toHaveAttribute('aria-current', 'page');

    fireEvent.click(chat);
    expect(onSurfaceChange).toHaveBeenCalledWith('chat');
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

  it('opens the list library with the active language pair', () => {
    render(
      <TopMenu
        showAll={false}
        onShowAll={vi.fn()}
        onMenuAction={vi.fn()}
        categoryCount={0}
        categoryActive={false}
        lists={[{ id: 'list-1', name: 'My list' }]}
        activeListId="list-1"
        onListChange={vi.fn()}
        activeListLanguagePair={{ from: 'cs', to: 'vi' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /select word list/i }));

    expect(screen.getByRole('link', { name: /browse word lists/i })).toHaveAttribute(
      'href',
      '/lists?languageFrom=cs&languageTo=vi',
    );
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
