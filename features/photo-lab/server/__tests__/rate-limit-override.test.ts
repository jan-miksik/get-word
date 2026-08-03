import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReserveDailyBuckets = vi.fn();
const mockGetDailyBucketUsage = vi.fn();
const mockGetActiveSchoolEntitlement = vi.fn();
const mockGetSchoolFeatureUsage = vi.fn();
const mockReserveSchoolFeatureUsage = vi.fn();

vi.mock('@/lib/rate-limit/daily-bucket', () => ({
  DailyLimitError: class TestDailyLimitError extends Error {},
  reserveDailyBuckets: (...args: unknown[]) => mockReserveDailyBuckets(...args),
  getDailyBucketUsage: (...args: unknown[]) => mockGetDailyBucketUsage(...args),
  parsePositiveIntEnv: (_value: string | undefined, fallback: number) => fallback,
}));

vi.mock('@/lib/db/client', () => ({ db: { execute: vi.fn() } }));

vi.mock('@/features/schools/server/entitlements', () => ({
  getActiveSchoolEntitlement: (...args: unknown[]) => mockGetActiveSchoolEntitlement(...args),
  getSchoolFeatureUsage: (...args: unknown[]) => mockGetSchoolFeatureUsage(...args),
  getCurrentSchoolFeaturePeriod: () => ({
    start: new Date('2026-07-01T00:00:00.000Z'),
    resetAt: new Date('2026-08-01T00:00:00.000Z'),
  }),
}));

vi.mock('@/features/schools/server/feature-usage', () => ({
  reserveSchoolFeatureUsage: (...args: unknown[]) => mockReserveSchoolFeatureUsage(...args),
  refundSchoolFeatureUsage: vi.fn(),
}));

import { getPhotoLabUsage, reservePhotoLabRateLimit } from '../rate-limit';

const entitlement = {
  schoolId: 'school-a',
  role: 'student' as const,
  limits: {
    photoLabMonthlyLimit: 25,
    translationItemsMonthlyLimit: 1000,
    translationItemMaxChars: 160,
  },
};

/** The single reserved bucket for a non-school user (the global one is [1]). */
function reservedUserBucket() {
  return (mockReserveDailyBuckets.mock.calls[0][0] as { key: string; limit: number }[])[0];
}

describe('photo lab per-account limit override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReserveDailyBuckets.mockResolvedValue(undefined);
    mockReserveSchoolFeatureUsage.mockResolvedValue({ reserved: true, used: 1 });
    mockGetDailyBucketUsage.mockResolvedValue({
      used: 2,
      resetAt: new Date('2026-07-20T00:00:00.000Z'),
    });
    mockGetSchoolFeatureUsage.mockResolvedValue({
      used: 30,
      resetAt: new Date('2026-08-01T00:00:00.000Z'),
      periodStart: new Date('2026-07-01T00:00:00.000Z'),
    });
  });

  it('replaces the monthly allowance of a free account', async () => {
    mockGetActiveSchoolEntitlement.mockResolvedValue(null);

    await reservePhotoLabRateLimit('user-1', false, 40);

    expect(reservedUserBucket()).toMatchObject({ limit: 40 });
    // The shared abuse ceiling still applies — it caps the server key's spend,
    // not one person's allowance.
    const buckets = mockReserveDailyBuckets.mock.calls[0][0] as { key: string }[];
    expect(buckets[1].key).toContain(':global');
  });

  it("replaces a school member's monthly quota", async () => {
    mockGetActiveSchoolEntitlement.mockResolvedValue(entitlement);

    await reservePhotoLabRateLimit('user-1', false, 100);

    expect(mockReserveSchoolFeatureUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('treats 0 as "photo analysis off" rather than "no override"', async () => {
    mockGetActiveSchoolEntitlement.mockResolvedValue(null);

    await reservePhotoLabRateLimit('user-1', false, 0);

    expect(reservedUserBucket()).toMatchObject({ limit: 0 });
  });

  it('falls back to the default limit for null, undefined and negative values', async () => {
    mockGetActiveSchoolEntitlement.mockResolvedValue(null);

    for (const override of [null, undefined, -5]) {
      mockReserveDailyBuckets.mockClear();
      await reservePhotoLabRateLimit('user-1', false, override);
      expect(reservedUserBucket()).toMatchObject({ limit: 5 });
    }
  });

  it('reports the override as the limit in the usage payload', async () => {
    mockGetActiveSchoolEntitlement.mockResolvedValue(null);
    expect(await getPhotoLabUsage('user-1', false, 40)).toMatchObject({
      used: 2,
      limit: 40,
      remaining: 38,
    });

    mockGetActiveSchoolEntitlement.mockResolvedValue(entitlement);
    expect(await getPhotoLabUsage('user-1', false, 100)).toMatchObject({
      used: 30,
      limit: 100,
      remaining: 70,
      source: 'school',
    });
  });

  it('never reports a negative remaining when the override is lowered below current usage', async () => {
    mockGetActiveSchoolEntitlement.mockResolvedValue(entitlement);

    expect(await getPhotoLabUsage('user-1', false, 10)).toMatchObject({
      used: 30,
      limit: 10,
      remaining: 0,
    });
  });
});
