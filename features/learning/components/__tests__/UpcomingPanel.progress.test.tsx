import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UpcomingPanel } from '../UpcomingPanel';

const { appState } = vi.hoisted(() => ({
  appState: {
    filteredWords: [],
    allSyncedWords: [],
    subscribedLists: [],
    activeListId: null,
    progress: {},
    isHydrated: true,
    role: 'knownLanguage',
    categoryOrder: [],
  } as Record<string, unknown>,
}));

vi.mock('@/context/AppStateContext', () => ({
  useAppStateContext: () => appState,
}));

describe('UpcomingPanel progress link', () => {
  beforeEach(() => {
    Object.assign(appState, {
      filteredWords: [],
      allSyncedWords: [],
      subscribedLists: [],
      activeListId: null,
      progress: {},
      isHydrated: true,
      role: 'knownLanguage',
      categoryOrder: [],
    });
  });

  it('opens the overview surface in place instead of holding the tallies itself', () => {
    const onOpenProgress = vi.fn();
    render(<UpcomingPanel isOpen onClose={vi.fn()} onOpenProgress={onOpenProgress} />);

    fireEvent.click(screen.getByRole('button', { name: /learning progress/i }));

    expect(onOpenProgress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/total words/i)).not.toBeInTheDocument();
  });

  it('keeps the progress entry visible when there are no words to learn', () => {
    render(<UpcomingPanel isOpen onClose={vi.fn()} onOpenProgress={vi.fn()} />);

    expect(screen.getByText(/nothing to learn yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /learning progress/i })).toBeInTheDocument();
  });

  it('shows a personal word for the active pair even when it is absent from filtered words', () => {
    Object.assign(appState, {
      filteredWords: [],
      allSyncedWords: [
        {
          id: 'personal-word',
          listId: 'personal-cs-vi',
          category: ['word'],
          cz: 'radost',
          en: '',
          vi: 'niềm vui',
        },
      ],
      subscribedLists: [
        { id: 'catalog-cs-vi', languageFrom: 'cs', languageTo: 'vi' },
        {
          id: 'personal-cs-vi',
          languageFrom: 'cz',
          languageTo: 'vi',
          isOwnedPersonal: true,
        },
      ],
      activeListId: 'catalog-cs-vi',
    });

    render(<UpcomingPanel isOpen onClose={vi.fn()} />);

    expect(screen.getByText('radost')).toBeInTheDocument();
    expect(screen.getByText('niềm vui')).toBeInTheDocument();
  });

  it('lists personal new words before catalog ones, like the study stream does', () => {
    Object.assign(appState, {
      filteredWords: [
        {
          id: 'catalog-word',
          listId: 'catalog-cs-vi',
          category: ['word'],
          cz: 'kniha',
          en: '',
          vi: 'sách',
        },
        {
          id: 'personal-word',
          listId: 'personal-cs-vi',
          category: ['word'],
          cz: 'radost',
          en: '',
          vi: 'niềm vui',
        },
      ],
      subscribedLists: [
        { id: 'catalog-cs-vi', languageFrom: 'cs', languageTo: 'vi' },
        {
          id: 'personal-cs-vi',
          languageFrom: 'cs',
          languageTo: 'vi',
          isOwnedPersonal: true,
        },
      ],
      activeListId: 'catalog-cs-vi',
      ownedPersonalListIds: new Set(['personal-cs-vi']),
    });

    const { container } = render(
      <UpcomingPanel isOpen onClose={vi.fn()} />
    );

    const rows = Array.from(container.querySelectorAll('li')).map((li) => li.textContent ?? '');
    expect(rows[0]).toContain('radost');
    expect(rows[1]).toContain('kniha');
  });
});
