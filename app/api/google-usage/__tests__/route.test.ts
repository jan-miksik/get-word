import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveUserFromRequest = vi.fn();
const mockIsEditor = vi.fn();
const mockGetGoogleApiUsageForUser = vi.fn();
const mockGetGoogleApiUsageAcrossAccounts = vi.fn();
const mockGetCurrentGoogleApiPeriodStart = vi.fn();
const mockGetGoogleApiAccountMonthlyLimit = vi.fn();
const mockGetGoogleApiFreeMonthlyUnits = vi.fn();

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  isEditor: (...args: unknown[]) => mockIsEditor(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
}));

vi.mock('@/lib/db', () => ({
  GOOGLE_API_ACCOUNT_LIMIT_MESSAGE:
    'This account has reached the free Google API usage limit. Reach out to us for more usage, or use your own API keys.',
  getCurrentGoogleApiPeriodStart: (...args: unknown[]) => mockGetCurrentGoogleApiPeriodStart(...args),
  getGoogleApiAccountMonthlyLimit: (...args: unknown[]) => mockGetGoogleApiAccountMonthlyLimit(...args),
  getGoogleApiFreeMonthlyUnits: (...args: unknown[]) => mockGetGoogleApiFreeMonthlyUnits(...args),
  getGoogleApiUsageAcrossAccounts: (...args: unknown[]) => mockGetGoogleApiUsageAcrossAccounts(...args),
  getGoogleApiUsageForUser: (...args: unknown[]) => mockGetGoogleApiUsageForUser(...args),
}));

import { GET } from '../route';

describe('GET /api/google-usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentGoogleApiPeriodStart.mockReturnValue(new Date('2026-04-01T00:00:00.000Z'));
    mockGetGoogleApiAccountMonthlyLimit.mockImplementation((scope: string) =>
      scope === 'translate' ? 25000 : 50000,
    );
    mockGetGoogleApiFreeMonthlyUnits.mockImplementation((scope: string) =>
      scope === 'translate' ? 500000 : 1000000,
    );
  });

  it('returns account usage for a standard user', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ id: 'user-1', userRole: 'user' });
    mockIsEditor.mockReturnValue(false);
    mockGetGoogleApiUsageForUser.mockResolvedValue([
      {
        scope: 'translate',
        units: 25000,
        requestCount: 7,
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/google-usage'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.account[0]).toMatchObject({
      scope: 'translate',
      used_units: 25000,
      account_limit: 25000,
      paused: true,
    });
    expect(data.account[0].limit_message).toMatch(/Reach out to us/);
    expect(data.global).toBeUndefined();
  });

  it('returns global monitoring for editors', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ id: 'editor-1', userRole: 'editor' });
    mockIsEditor.mockReturnValue(true);
    mockGetGoogleApiUsageForUser.mockResolvedValue([
      {
        scope: 'tts',
        units: 1200,
        requestCount: 3,
      },
    ]);
    mockGetGoogleApiUsageAcrossAccounts.mockResolvedValue([
      {
        scope: 'translate',
        units: 64000,
        requestCount: 20,
        accountCount: 5,
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/google-usage'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.global).toEqual([
      {
        scope: 'translate',
        used_units: 64000,
        request_count: 20,
        account_count: 5,
        free_monthly_units: 500000,
      },
      {
        scope: 'tts',
        used_units: 0,
        request_count: 0,
        account_count: 0,
        free_monthly_units: 1000000,
      },
    ]);
  });
});
