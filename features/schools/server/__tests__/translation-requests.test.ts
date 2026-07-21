import { afterEach, describe, expect, it, vi } from 'vitest';

const mockDbExecute = vi.fn();
const mockDbTransaction = vi.fn();

vi.mock('@/lib/db/client', () => ({
  db: {
    execute: (...args: unknown[]) => mockDbExecute(...args),
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}));

vi.mock('@/lib/openrouter-chat', () => ({
  OpenRouterChatError: class OpenRouterChatError extends Error {
    constructor(message: string, readonly retryable: boolean, readonly status?: number) {
      super(message);
    }
    get isOutOfCredits() {
      return this.status === 402;
    }
  },
  callOpenRouterChatParsedWithMeta: vi.fn(),
}));

import {
  SchoolTranslationError,
  translateWithSchoolOpenRouter,
} from '../translation-requests';

const entitlement = {
  schoolId: 'school-1',
  schoolName: 'Pilot',
  plan: 'pilot_v1' as const,
  role: 'student' as const,
  limits: {
    photoLabMonthlyLimit: 25,
    translationItemsMonthlyLimit: 1000,
    translationItemMaxChars: 160,
  },
};

describe('school translation requests', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects items longer than the school per-item character limit before reserving quota', async () => {
    vi.stubEnv('OPENROUTER_SCHOOL_API_KEY', 'sk-school');

    await expect(translateWithSchoolOpenRouter({
      userId: 'user-1',
      entitlement,
      requestId: 'req-1',
      fromLang: 'cs',
      toLang: 'vi',
      items: [{
        id: 'i1',
        text: 'x'.repeat(161),
        from_lang: 'cs',
        to_lang: 'vi',
      }],
    })).rejects.toMatchObject({
      status: 400,
      body: {
        code: 'TRANSLATION_ITEM_TOO_LONG',
        max_chars: 160,
      },
    } satisfies Partial<SchoolTranslationError>);

    expect(mockDbTransaction).not.toHaveBeenCalled();
    expect(mockDbExecute).not.toHaveBeenCalled();
  });
});
