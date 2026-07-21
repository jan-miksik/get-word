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
    constructor(
      message: string,
      readonly retryable: boolean,
      readonly status?: number,
      readonly kind: 'transport' | 'response' = 'response',
    ) {
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
import { OpenRouterChatError, callOpenRouterChatParsedWithMeta } from '@/lib/openrouter-chat';

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

  describe('provider failures', () => {
    const item = { id: 'i1', text: 'ahoj', from_lang: 'cs', to_lang: 'vi' };

    /**
     * Drives one reservation transaction followed by an optional release
     * transaction. `reserve` ends with a non-empty RETURNING so the monthly
     * limit check passes; `release` starts by finding the reserved row.
     */
    function stubTransactions() {
      const reserveRows = [[], [], [], [{ used: 1 }]];
      const releaseRows = [
        [{ id: 'row-1', status: 'reserved', item_count: 1, period_start: new Date('2026-07-01T00:00:00Z') }],
        [],
        [],
      ];
      let call = 0;
      mockDbTransaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => {
        const rows = call === 0 ? reserveRows : releaseRows;
        call += 1;
        let step = 0;
        return run({ execute: async () => rows[step++] ?? [] });
      });
      mockDbExecute.mockResolvedValue([]);
    }

    async function translateOnce() {
      return translateWithSchoolOpenRouter({
        userId: 'user-1',
        entitlement,
        requestId: 'req-1',
        fromLang: 'cs',
        toLang: 'vi',
        items: [item],
      });
    }

    it('returns the reserved quota when the provider rejected the call', async () => {
      vi.stubEnv('OPENROUTER_SCHOOL_API_KEY', 'sk-school');
      stubTransactions();
      vi.mocked(callOpenRouterChatParsedWithMeta).mockRejectedValue(
        new OpenRouterChatError('OpenRouter API error: 503', true, 503),
      );

      await expect(translateOnce()).rejects.toMatchObject({ status: 502 });

      // Two transactions: the reservation and its release. markUnknown would
      // have gone through db.execute and left the quota charged.
      expect(mockDbTransaction).toHaveBeenCalledTimes(2);
      expect(mockDbExecute).not.toHaveBeenCalled();
    });

    it('parks the request as unknown when no response was ever observed', async () => {
      vi.stubEnv('OPENROUTER_SCHOOL_API_KEY', 'sk-school');
      stubTransactions();
      vi.mocked(callOpenRouterChatParsedWithMeta).mockRejectedValue(
        new OpenRouterChatError('OpenRouter request timed out.', true, undefined, 'transport'),
      );

      await expect(translateOnce()).rejects.toMatchObject({
        status: 409,
        body: { code: 'TRANSLATION_REQUEST_STATUS_UNKNOWN' },
      });

      expect(mockDbTransaction).toHaveBeenCalledTimes(1);
      expect(mockDbExecute).toHaveBeenCalledTimes(1);
    });
  });
});
