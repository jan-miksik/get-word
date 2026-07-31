import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListsApiFetch = vi.fn();

vi.mock('@/features/lists/api', () => ({
  listsApiFetch: (...args: unknown[]) => mockListsApiFetch(...args),
}));

vi.mock('@/features/shared/languages/useSettingsLanguage', () => ({
  useSettingsLanguage: () => 'en',
}));

import { MyReportsPage } from '../MyReportsPage';

describe('MyReportsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows separate outcomes for action taken and no violation found', async () => {
    mockListsApiFetch.mockResolvedValue(new Response(JSON.stringify({
      reports: [
        {
          id: 'report-1',
          listName: 'Abusive list',
          reason: 'hate_or_harassment',
          details: null,
          status: 'resolved',
          decisionCode: 'hate_or_harassment',
          publicNote: 'The list contained targeted insults.',
          createdAt: '2026-07-31T10:00:00.000Z',
          resolvedAt: '2026-07-31T12:00:00.000Z',
        },
        {
          id: 'report-2',
          listName: 'Accurate list',
          reason: 'spam_or_misleading',
          details: null,
          status: 'dismissed',
          decisionCode: 'no_violation',
          publicNote: 'The title accurately describes the list.',
          createdAt: '2026-07-30T10:00:00.000Z',
          resolvedAt: '2026-07-30T12:00:00.000Z',
        },
      ],
    }), { status: 200 }));

    render(<MyReportsPage />);

    await waitFor(() => expect(screen.getByText('Abusive list')).toBeInTheDocument());
    expect(screen.getByText('Action taken')).toBeInTheDocument();
    expect(screen.getByText('We found a violation and took action. Reason: Hate, bullying, or harassment.')).toBeInTheDocument();
    expect(screen.getByText('The list contained targeted insults.')).toBeInTheDocument();
    expect(screen.getByText('No violation found')).toBeInTheDocument();
    expect(screen.getByText('The title accurately describes the list.')).toBeInTheDocument();
  });

  it('shows the empty state when the user has no reports', async () => {
    mockListsApiFetch.mockResolvedValue(new Response(JSON.stringify({ reports: [] }), { status: 200 }));

    render(<MyReportsPage />);

    await waitFor(() => {
      expect(screen.getByText('You have not reported any public content.')).toBeInTheDocument();
    });
  });
});
