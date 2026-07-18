import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLimit = vi.fn();
const mockGetUserApiKey = vi.fn();
const mockCallOpenRouterChatParsed = vi.fn();

vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: (...args: unknown[]) => mockLimit(...args) }),
      }),
    }),
  },
}));

vi.mock('@/lib/translation', () => ({
  getUserApiKey: (...args: unknown[]) => mockGetUserApiKey(...args),
}));

vi.mock('@/lib/openrouter-chat', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/openrouter-chat')>();
  return {
    ...original,
    callOpenRouterChatParsed: (...args: unknown[]) => mockCallOpenRouterChatParsed(...args),
  };
});

import {
  suggestAcceptedAnswersForItem,
} from '../suggest-item';

const list = { id: 'list-1', languageFrom: 'en', languageTo: 'cs' };

describe('suggestAcceptedAnswersForItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserApiKey.mockResolvedValue('key');
    mockLimit.mockResolvedValue([{
      id: 'item-1',
      listId: 'list-1',
      textKnown: 'hello',
      textTarget: 'ahoj',
      acceptedKnown: [],
      acceptedTarget: [],
      comment: null,
    }]);
    mockCallOpenRouterChatParsed.mockImplementation(async (_options, parse) =>
      parse('{"suggestions":["čest"]}'),
    );
  });

  it('returns normalized suggestions for the requested side', async () => {
    await expect(suggestAcceptedAnswersForItem({
      userId: 'user-1',
      list,
      itemId: 'item-1',
      body: { side: 'target' },
    })).resolves.toEqual({ suggestions: ['čest'] });
  });

  it('keeps the existing 404 contract for an item outside the list', async () => {
    mockLimit.mockResolvedValueOnce([]);
    await expect(suggestAcceptedAnswersForItem({
      userId: 'user-1',
      list,
      itemId: 'missing',
      body: { side: 'target' },
    })).rejects.toMatchObject({
      message: 'Item not found',
      status: 404,
    });
  });
});
