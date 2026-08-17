import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('@/features/shared/http/api-runtime', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { CategoryBrowser } from '@/features/lists/components/category-browser/CategoryBrowser';

const LIST_ID = 'list-1';
const ITEM_ID = 'item-1';

const list = {
  id: LIST_ID,
  name: 'My words',
  description: null,
  languageFrom: 'cs',
  languageTo: 'en',
  isPublic: false,
  isCommon: false,
  isRecommended: false,
  isPersonal: true,
  ownerId: 'user-1',
  moderationStatus: 'visible',
};

const categories = [{ id: 'cat-1', listId: LIST_ID, name: 'Kitchen', position: 0 }];

const items = [
  {
    id: ITEM_ID,
    listId: LIST_ID,
    categoryId: 'cat-1',
    textKnown: 'struhadlo',
    textTarget: 'a grater',
    audioStatus: 'none',
    position: 0,
  },
];

function respondWithSuggestion() {
  apiFetch.mockImplementation(async (url: string) => {
    if (String(url).includes('quality-suggestions')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          suggestions: [
            {
              item_id: ITEM_ID,
              pool_key: 'p1:abc',
              suggestion_version: 1,
              current_target: 'a grater',
              suggested_known: null,
              suggested_target: 'a grater and a whisk',
              note: 'sounds unnatural',
            },
          ],
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
}

function renderBrowser(isOwner = true) {
  const noop = vi.fn();
  return render(
    <CategoryBrowser
      list={list as never}
      categories={categories as never}
      itemsByCategory={new Map([['cat-1', items]]) as never}
      isOwner={isOwner}
      isEditor={false}
      onEditCategory={noop}
      onEditAllWords={noop}
      onCreateCategory={noop as never}
      onUpdateList={noop as never}
      onRenameCategory={noop as never}
      onReorderCategories={noop as never}
      onDeleteCategory={noop as never}
    />,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe('quality suggestions in the list editor', () => {
  /**
   * The bug this covers: the inline notice lives inside a collapsed category,
   * so without a top-level summary a learner has no way to learn a suggestion
   * exists at all.
   */
  it('announces suggestions above the categories, not only inside them', async () => {
    respondWithSuggestion();
    renderBrowser();

    await waitFor(() =>
      expect(screen.getByText(/1 suggested correction/)).toBeTruthy(),
    );
  });

  it('marks the category that holds one while it is still collapsed', async () => {
    respondWithSuggestion();
    renderBrowser();

    await waitFor(() => expect(screen.getByText('1 suggested')).toBeTruthy());
    // The word itself is still hidden — the category has not been opened.
    expect(screen.queryByText('a grater and a whisk')).toBeNull();
  });

  it('asks for nothing when the viewer does not own the list', async () => {
    respondWithSuggestion();
    renderBrowser(false);

    // Give the hook's deferred load every chance to fire before concluding
    // that it did not. A non-owner triggers no request at all, so there is no
    // positive signal to wait for.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const suggestionCalls = apiFetch.mock.calls.filter((call) =>
      String(call[0]).includes('quality-suggestions'),
    );
    expect(suggestionCalls).toHaveLength(0);
    expect(screen.queryByText(/suggested correction/)).toBeNull();
  });
});

describe('a failed accept or dismiss', () => {
  /**
   * `deviceJsonFetch` is a plain fetch wrapper: a 4xx or 5xx resolves rather
   * than throwing. Both actions used to drop the suggestion from local state
   * without reading `response.ok`, so a rejected save — including the 409 a
   * changed suggestion now returns — looked exactly like success.
   */
  it('keeps the suggestion on screen when the server rejects it', async () => {
    respondWithSuggestion();
    renderBrowser();

    await waitFor(() => expect(screen.getByText(/1 suggested correction/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }));

    // From here on every write fails, while the re-read still returns the
    // suggestion. Reads and the dismiss POST share a URL, so the two are told
    // apart by method rather than by path.
    apiFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      const isRead = String(url).includes('quality-suggestions') && !options?.method;
      if (isRead) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            suggestions: [
              {
                item_id: ITEM_ID,
                pool_key: 'p1:abc',
                suggestion_version: 1,
                current_target: 'a grater',
                suggested_known: null,
                suggested_target: 'a grater and a whisk',
                note: 'sounds unnatural',
              },
            ],
          }),
        };
      }
      return { ok: false, status: 500, json: async () => ({ error: 'nope' }) };
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(screen.getByText('Save failed')).toBeTruthy());
    // Still offered, because nothing was actually saved.
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
  });
});

describe('a failed re-read', () => {
  /**
   * The tail of the failed-write path. After a rejected accept the hook
   * re-reads, and that read emptying the list on failure hid the suggestion
   * anyway — write 500, read 500, notice gone, nothing saved. A failed fetch
   * means "no news", so the last known state has to survive it.
   */
  it('keeps the suggestion when both the write and the re-read fail', async () => {
    respondWithSuggestion();
    renderBrowser();

    await waitFor(() => expect(screen.getByText(/1 suggested correction/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }));
    const accept = await screen.findByRole('button', { name: 'Accept' });

    // Everything from here on fails, the re-read included.
    apiFetch.mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'nope' }),
    }));

    fireEvent.click(accept);

    await waitFor(() => expect(screen.getByText('Save failed')).toBeTruthy());
    expect(screen.getByText('a grater and a whisk')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
  });
});

describe('a refused read', () => {
  /**
   * The counterweight to "a failed read keeps the last known state". A 5xx
   * says nothing about access, but 401/403/404 are the server answering: the
   * session ended, the list changed hands, or it is gone. Holding stale rows
   * on screen there would keep showing content that access to has just been
   * explicitly refused.
   */
  it.each([401, 403, 404])('clears the suggestions on %i', async (status) => {
    respondWithSuggestion();
    renderBrowser();

    await waitFor(() => expect(screen.getByText(/1 suggested correction/)).toBeTruthy());

    apiFetch.mockImplementation(async () => ({
      ok: false,
      status,
      json: async () => ({ error: 'denied' }),
    }));

    // The write fails too; what matters is the re-read that follows it.
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(screen.queryByText(/suggested correction/)).toBeNull());
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });

  it('holds on through a 500, which is not an answer about access', async () => {
    respondWithSuggestion();
    renderBrowser();

    await waitFor(() => expect(screen.getByText(/1 suggested correction/)).toBeTruthy());

    apiFetch.mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Show them' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(screen.getByText('Save failed')).toBeTruthy());
    expect(screen.getByText(/1 suggested correction/)).toBeTruthy();
  });
});
