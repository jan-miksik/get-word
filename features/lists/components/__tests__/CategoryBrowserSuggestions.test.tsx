import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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
