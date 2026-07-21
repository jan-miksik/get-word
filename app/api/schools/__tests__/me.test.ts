import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveAuthenticatedUser = vi.fn();
const mockGetActiveSchoolEntitlement = vi.fn();
const mockGetSchoolFeatureUsage = vi.fn();

vi.mock('@/lib/auth', () => ({
  resolveAuthenticatedUser: (...args: unknown[]) => mockResolveAuthenticatedUser(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
}));

vi.mock('@/features/schools/server/entitlements', () => ({
  getActiveSchoolEntitlement: (...args: unknown[]) => mockGetActiveSchoolEntitlement(...args),
  getSchoolFeatureUsage: (...args: unknown[]) => mockGetSchoolFeatureUsage(...args),
}));

import { GET } from '../me/route';

describe('GET /api/schools/me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a signed-in account', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/schools/me'));

    expect(response.status).toBe(401);
    expect(mockGetActiveSchoolEntitlement).not.toHaveBeenCalled();
  });

  it('returns null without an active entitlement', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockGetActiveSchoolEntitlement.mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/schools/me'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entitlement: null });
  });

  it('returns role, limits, usage, remaining, and reset', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockGetActiveSchoolEntitlement.mockResolvedValue({
      schoolId: 'school-1',
      schoolName: 'Pilot',
      plan: 'pilot_v1',
      role: 'teacher',
      limits: {
        photoLabMonthlyLimit: 25,
        translationItemsMonthlyLimit: 1000,
        translationItemMaxChars: 160,
      },
    });
    mockGetSchoolFeatureUsage.mockResolvedValue({
      used: 12,
      resetAt: new Date('2026-08-01T00:00:00.000Z'),
      periodStart: new Date('2026-07-01T00:00:00.000Z'),
    });

    const response = await GET(new NextRequest('http://localhost/api/schools/me'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      entitlement: {
        school_id: 'school-1',
        school_name: 'Pilot',
        plan: 'pilot_v1',
        role: 'teacher',
        limits: {
          photo_lab_monthly_limit: 25,
          translation_items_monthly_limit: 1000,
          translation_item_max_chars: 160,
        },
        usage: {
          ai_translation: {
            used: 12,
            limit: 1000,
            remaining: 988,
            reset_at: '2026-08-01T00:00:00.000Z',
            period: 'month',
          },
        },
      },
    });
  });
});
