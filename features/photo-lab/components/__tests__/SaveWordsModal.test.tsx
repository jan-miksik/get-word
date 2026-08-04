import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPhotoLabSaveList = vi.fn();
const savePhotoLabWordsToList = vi.fn();

vi.mock('@/features/photo-lab/client/saveToList', () => ({
  fetchPhotoLabSaveList: (...args: unknown[]) => fetchPhotoLabSaveList(...args),
  savePhotoLabWordsToList: (...args: unknown[]) => savePhotoLabWordsToList(...args),
}));

import { SaveWordsModal } from '@/features/photo-lab/components/SaveWordsModal';
import type { PhotoLabSession } from '@/features/photo-lab/types';

const LIST_REFRESH_MARKER_KEY = 'get-word-refresh-lists-on-learning-return';

function session(): PhotoLabSession {
  return {
    id: 'session-1',
    createdAt: 0,
    languageFrom: 'cs',
    languageTo: 'vi',
    photoHash: 'photo-hash',
    labels: [
      { id: 'a', known: 'okno', target: 'cửa sổ', x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
      { id: 'b', known: 'stůl', target: 'bàn', x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
      { id: 'c', known: '', target: 'ghế', x: 0.3, y: 0.3, w: 0.1, h: 0.1 },
    ],
    audioHashes: { a: 'audio-a' },
  };
}

describe('SaveWordsModal', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    fetchPhotoLabSaveList.mockReset().mockResolvedValue({
      name: 'Moje slovíčka — vietnamština',
      exists: true,
    });
    savePhotoLabWordsToList.mockReset().mockResolvedValue({
      listId: 'list-1',
      listName: 'Moje slovíčka — vietnamština',
      addedCount: 1,
      duplicateCount: 0,
      items: [{ known: 'okno', target: 'cửa sổ', outcome: 'added' }],
    });
  });

  it('starts with nothing ticked and names the destination list', async () => {
    render(<SaveWordsModal session={session()} onClose={vi.fn()} />);

    // Labels missing a side are never offered.
    expect(screen.queryByText('ghế')).not.toBeInTheDocument();
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await waitFor(() => expect(fetchPhotoLabSaveList).toHaveBeenCalledWith('cs', 'vi'));
    expect(
      await screen.findByText(/Goes into your own list: Moje slovíčka — vietnamština/),
    ).toBeInTheDocument();
  });

  it('saves only the ticked labels, with their audio hashes', async () => {
    const user = userEvent.setup();
    render(<SaveWordsModal session={session()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('checkbox', { name: /okno/ }));
    await user.click(screen.getByRole('button', { name: 'Save 1' }));

    await waitFor(() => expect(savePhotoLabWordsToList).toHaveBeenCalledTimes(1));
    expect(savePhotoLabWordsToList).toHaveBeenCalledWith({
      languageFrom: 'cs',
      languageTo: 'vi',
      categoryName: 'Photo lab',
      items: [{ known: 'okno', target: 'cửa sổ', audioHash: 'audio-a' }],
    });

    expect(await screen.findByText('1 added, 0 already there')).toBeInTheDocument();
  });

  it('marks the duplicate word rather than the whole batch', async () => {
    savePhotoLabWordsToList.mockResolvedValue({
      listId: 'list-1',
      listName: 'Moje slovíčka — vietnamština',
      addedCount: 1,
      duplicateCount: 1,
      items: [
        { known: 'okno', target: 'cửa sổ', outcome: 'duplicate' },
        { known: 'stůl', target: 'bàn', outcome: 'added' },
      ],
    });
    const user = userEvent.setup();
    render(<SaveWordsModal session={session()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Save 2' }));

    const duplicateRow = (await screen.findByText('okno')).closest('li');
    const addedRow = screen.getByText('stůl').closest('li');
    expect(duplicateRow).toHaveTextContent('•');
    expect(addedRow).toHaveTextContent('✓');
    expect(screen.getByText('1 added, 1 already there')).toBeInTheDocument();
  });

  it('tells the study view behind it to re-read after a save that added words', async () => {
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<SaveWordsModal session={session()} onClose={vi.fn()} onSaved={onSaved} />);

    await user.click(screen.getByRole('checkbox', { name: /okno/ }));
    await user.click(screen.getByRole('button', { name: 'Save 1' }));

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ listId: 'list-1' })),
    );
    expect(window.sessionStorage.getItem(LIST_REFRESH_MARKER_KEY)).toBeNull();
  });

  it('leaves a refresh marker when no study view is mounted to refresh', async () => {
    const user = userEvent.setup();
    render(<SaveWordsModal session={session()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('checkbox', { name: /okno/ }));
    await user.click(screen.getByRole('button', { name: 'Save 1' }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem(LIST_REFRESH_MARKER_KEY)).toBeTruthy(),
    );
  });

  it('does not refresh when every picked word was already there', async () => {
    savePhotoLabWordsToList.mockResolvedValue({
      listId: 'list-1',
      listName: 'Moje slovíčka — vietnamština',
      addedCount: 0,
      duplicateCount: 1,
      items: [{ known: 'okno', target: 'cửa sổ', outcome: 'duplicate' }],
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<SaveWordsModal session={session()} onClose={vi.fn()} onSaved={onSaved} />);

    await user.click(screen.getByRole('checkbox', { name: /okno/ }));
    await user.click(screen.getByRole('button', { name: 'Save 1' }));

    expect(await screen.findByText('0 added, 1 already there')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(LIST_REFRESH_MARKER_KEY)).toBeNull();
  });

  it('reports a failed save and keeps the picked words', async () => {
    savePhotoLabWordsToList.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<SaveWordsModal session={session()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('checkbox', { name: /okno/ }));
    await user.click(screen.getByRole('button', { name: 'Save 1' }));

    expect(await screen.findByText('Saving failed. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /okno/ })).toBeChecked();
  });
});
