import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deviceJsonFetch: vi.fn(),
}));

vi.mock('@/features/shared/http/device-json-fetch', () => ({
  deviceJsonFetch: mocks.deviceJsonFetch,
}));

import { commitSession } from '../api';

describe('commitSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deviceJsonFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        list_id: 'list-1',
        category_id: 'category-1',
        item_count: 2,
        takeover_count: 0,
        upgraded_takeover_count: 0,
        already_committed: false,
        monthly_used: 2,
        monthly_limit: 100,
      }),
    });
  });

  it('keeps transient address-form metadata on the commit wire payload', async () => {
    await commitSession({
      creationKey: 'creation-1',
      sessionId: 'session-1',
      languageFrom: 'en',
      languageTo: 'de',
      chatLanguage: 'en',
      listName: 'My words',
      categoryName: 'Conversation',
      topicLabel: 'Conversation',
      reviewLabel: 'Conversation',
      isPublic: false,
      items: [
        {
          kind: 'sentence',
          textKnown: 'How are you?',
          textTarget: 'Wie geht es dir?',
          addressForm: { form: 'familiar' },
          variantGroupKey: '0:address',
        },
      ],
      messages: [],
    });

    const [, init] = mocks.deviceJsonFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      items: Array<{ address_form: string | null; variant_group_key: string | null }>;
    };
    expect(body.items[0]).toMatchObject({
      address_form: 'familiar',
      variant_group_key: '0:address',
    });
  });
});
