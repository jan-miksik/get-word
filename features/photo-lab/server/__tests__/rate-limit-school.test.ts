import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReserveDailyBuckets = vi.fn();
const mockGetDailyBucketUsage = vi.fn();
const mockGetActiveSchoolEntitlement = vi.fn();
const mockGetSchoolFeatureUsage = vi.fn();
const mockReserveSchoolFeatureUsage = vi.fn();
const mockRefundSchoolFeatureUsage = vi.fn();

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
  refundSchoolFeatureUsage: (...args: unknown[]) => mockRefundSchoolFeatureUsage(...args),
}));

import { DailyLimitError } from '@/lib/rate-limit/daily-bucket';
import {
  getPhotoLabUsage,
  releasePhotoLabReservation,
  reservePhotoLabRateLimit,
} from '../rate-limit';

const entitlement = {
  schoolId: 'school-a',
  role: 'student' as const,
  limits: { photoLabMonthlyLimit: 25, translationItemsMonthlyLimit: 1000, translationItemMaxChars: 160 },
};

describe('photo lab school metering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReserveDailyBuckets.mockResolvedValue(undefined);
  });

  it('enforces the per-member limit in school_feature_usage and skips every rate bucket', async () => {
    mockGetActiveSchoolEntitlement.mockResolvedValue(entitlement);
    mockReserveSchoolFeatureUsage.mockResolvedValue({ reserved: true, used: 3 });

    await reservePhotoLabRateLimit('user-1', false);

    // The shared daily cap must not apply: a whole class in one lesson would
    // exhaust it and block the school for the rest of the day.
    expect(mockReserveDailyBuckets).not.toHaveBeenCalled();
    expect(mockReserveSchoolFeatureUsage).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      schoolId: 'school-a',
      feature: 'photo_lab',
      periodStart: new Date('2026-07-01T00:00:00.000Z'),
      count: 1,
      limit: 25,
    });
  });

  it('rejects a member who is out of their monthly allowance', async () => {
    mockGetActiveSchoolEntitlement.mockResolvedValue(entitlement);
    mockReserveSchoolFeatureUsage.mockResolvedValue({ reserved: false, used: 25 });

    await expect(reservePhotoLabRateLimit('user-1', false)).rejects.toBeInstanceOf(
      DailyLimitError,
    );
  });

  it('keeps non-school users on the per-user and global buckets', async () => {
    mockGetActiveSchoolEntitlement.mockResolvedValue(null);

    await reservePhotoLabRateLimit('user-1', false);

    const buckets = mockReserveDailyBuckets.mock.calls[0][0] as { key: string }[];
    expect(buckets).toHaveLength(2);
    expect(buckets[1].key).toContain(':global');
    expect(mockReserveSchoolFeatureUsage).not.toHaveBeenCalled();
  });

  it('reports school usage from the metering table', async () => {
    mockGetActiveSchoolEntitlement.mockResolvedValue(entitlement);
    mockGetSchoolFeatureUsage.mockResolvedValue({
      used: 4,
      resetAt: new Date('2026-08-01T00:00:00.000Z'),
      periodStart: new Date('2026-07-01T00:00:00.000Z'),
    });

    const usage = await getPhotoLabUsage('user-1', false);

    expect(mockGetSchoolFeatureUsage).toHaveBeenCalledWith({
      userId: 'user-1',
      feature: 'photo_lab',
    });
    expect(mockGetDailyBucketUsage).not.toHaveBeenCalled();
    expect(usage).toMatchObject({ used: 4, limit: 25, remaining: 21, source: 'school' });
  });

  it('hands back a token describing what the reservation consumed', async () => {
    mockGetActiveSchoolEntitlement.mockResolvedValue(entitlement);
    mockReserveSchoolFeatureUsage.mockResolvedValue({ reserved: true, used: 3 });

    await expect(reservePhotoLabRateLimit('user-1', false)).resolves.toEqual({
      source: 'school',
      userId: 'user-1',
      periodStart: new Date('2026-07-01T00:00:00.000Z'),
    });

    mockGetActiveSchoolEntitlement.mockResolvedValue(null);
    await expect(reservePhotoLabRateLimit('user-2', false)).resolves.toEqual({
      source: 'default',
    });
  });

  it('refunds the period the reservation was made in, not the current one', async () => {
    // A request that starts at 23:59 on the last day of the month and fails
    // after midnight must give back July's unit, not August's.
    await releasePhotoLabReservation({
      source: 'school',
      userId: 'user-1',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
    });

    expect(mockRefundSchoolFeatureUsage).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      feature: 'photo_lab',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      count: 1,
    });
  });

  it('never touches school usage for a request that did not use the school meter', async () => {
    // Without the token this would decrement a row left over from a membership
    // the user has since lost.
    await releasePhotoLabReservation({ source: 'default' });

    expect(mockRefundSchoolFeatureUsage).not.toHaveBeenCalled();
  });
});
