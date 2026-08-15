import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UpcomingPanel } from '../UpcomingPanel';
import { STAGES } from '@/lib/words';
import type { ProgressStats } from '@/lib/progress-stats';

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

const progressStats: ProgressStats = {
  total: 12,
  byStage: STAGES.map((_, i) => (i === 0 ? 12 : 0)),
  totalKnown: 3,
  totalUnknown: 1,
  readyCount: 4,
  fresh: 0,
  learning: 0,
  done: 0,
  new: 12,
};

describe('UpcomingPanel progress section', () => {
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

  it('starts collapsed and expands the stats behind the toggle button', () => {
    const { container } = render(
      <UpcomingPanel isOpen onClose={vi.fn()} progressStats={progressStats} />
    );

    const toggleButton = screen.getByRole('button', { name: /learning progress/i });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('#upcoming-progress-stats')).toBeNull();
    expect(screen.queryByText(/total words/i)).not.toBeInTheDocument();

    fireEvent.click(toggleButton);

    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('#upcoming-progress-stats')).not.toBeNull();
    expect(screen.getByText(/total words/i)).toBeInTheDocument();
    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
  });

  it('keeps the progress toggle visible when there are no words to learn', () => {
    render(<UpcomingPanel isOpen onClose={vi.fn()} progressStats={progressStats} />);

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

    render(<UpcomingPanel isOpen onClose={vi.fn()} progressStats={progressStats} />);

    expect(screen.getByText('radost')).toBeInTheDocument();
    expect(screen.getByText('niềm vui')).toBeInTheDocument();
  });
});
