import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockFetchGoogleSupportedLanguages = vi.fn();

vi.mock('@/lib/i18n/server', () => ({
  fetchGoogleSupportedLanguages: (...args: unknown[]) => mockFetchGoogleSupportedLanguages(...args),
}));

import { GET } from '../route';

describe('GET /api/settings-languages', () => {
  it('merges common languages with Google-supported languages and filters by query', async () => {
    mockFetchGoogleSupportedLanguages.mockResolvedValue([
      { code: 'de', name: 'German', source: 'google' },
      { code: 'sv', name: 'Swedish', source: 'google' },
    ]);

    const res = await GET(new NextRequest('http://localhost/api/settings-languages?target=en&q=swe'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockFetchGoogleSupportedLanguages).toHaveBeenCalledWith('en');
    expect(body.languages).toEqual([
      { code: 'sv', name: 'Swedish', source: 'google' },
    ]);
  });
});
