import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  commitWordChatSession: vi.fn(),
  reopenNothingDueDayGoalSnapshot: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  canPublishPublicList: () => false,
  resolveUserFromRequest: vi.fn(async () => ({
    id: 'user-1',
    userRole: 'user',
    timezone: 'UTC',
  })),
  unauthorizedResponse: () => new Response(null, { status: 401 }),
}));

vi.mock('@/features/word-chat/server/commit', () => ({
  commitWordChatSession: mocks.commitWordChatSession,
}));

vi.mock('@/features/word-chat/server/config', () => ({
  canSeeWordChatDiagnostics: () => false,
  MAX_WORD_CHAT_ID_CHARS: 120,
  MAX_WORD_CHAT_ITEM_CHARS: 500,
}));

vi.mock('@/features/word-chat/server/chat', () => ({
  sanitizeMessages: () => [],
}));

vi.mock('../../errors', () => ({
  wordChatErrorResponse: () => new Response(null, { status: 500 }),
}));

vi.mock('@/lib/db', () => ({
  reopenNothingDueDayGoalSnapshot: mocks.reopenNothingDueDayGoalSnapshot,
}));

import { POST } from '../route';

describe('POST /api/word-chat/commit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commitWordChatSession.mockResolvedValue({
      listId: 'list-1',
      categoryId: 'category-1',
      itemCount: 2,
      takeoverCount: 0,
      upgradedTakeoverCount: 0,
      alreadyCommitted: false,
      monthlyUsed: 2,
      monthlyLimit: 100,
    });
  });

  it('passes valid address-form pair claims to the server commit layer', async () => {
    const request = new NextRequest('http://localhost/api/word-chat/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        creation_key: 'creation-1',
        session_id: 'session-1',
        language_from: 'en',
        language_to: 'de',
        category_name: 'Conversation',
        items: [
          {
            kind: 'sentence',
            text_known: 'How are you?',
            text_target: 'Wie geht es dir?',
            address_form: 'familiar',
            variant_group_key: '0:address',
          },
        ],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.commitWordChatSession).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          items: [
            expect.objectContaining({
              addressForm: { form: 'familiar' },
              variantGroupKey: '0:address',
            }),
          ],
        }),
      }),
    );
  });

  it('drops forged address forms and their group claims at the route boundary', async () => {
    const request = new NextRequest('http://localhost/api/word-chat/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        creation_key: 'creation-1',
        session_id: 'session-1',
        items: [
          {
            kind: 'word',
            text_known: 'hello',
            text_target: 'Hallo',
            address_form: 'attacker-value',
            variant_group_key: 'forged-group',
          },
        ],
      }),
    });

    await POST(request);

    const call = mocks.commitWordChatSession.mock.calls[0]?.[0] as {
      request: { items: Array<Record<string, unknown>> };
    };
    expect(call.request.items[0]).not.toHaveProperty('addressForm');
    expect(call.request.items[0]).not.toHaveProperty('variantGroupKey');
  });
});
