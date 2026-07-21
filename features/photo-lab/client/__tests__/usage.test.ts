import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDeviceJsonFetch = vi.fn();

vi.mock('@/features/shared/http/device-json-fetch', () => ({
  deviceJsonFetch: (...args: unknown[]) => mockDeviceJsonFetch(...args),
}));

import { requestPhotoLabUsage } from '../usage';

describe('requestPhotoLabUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves monthly school usage periods', async () => {
    mockDeviceJsonFetch.mockResolvedValue(
      Response.json({
        used: 4,
        limit: 25,
        remaining: 21,
        reset_at: '2026-08-01T00:00:00.000Z',
        period: 'month',
        source: 'school',
      }),
    );

    await expect(requestPhotoLabUsage()).resolves.toEqual({
      used: 4,
      limit: 25,
      remaining: 21,
      reset_at: '2026-08-01T00:00:00.000Z',
      period: 'month',
      source: 'school',
    });
  });

  it('falls back unknown periods to day', async () => {
    mockDeviceJsonFetch.mockResolvedValue(
      Response.json({
        used: 1,
        limit: 5,
        remaining: 4,
        reset_at: '2026-07-21T00:00:00.000Z',
        period: 'decade',
      }),
    );

    await expect(requestPhotoLabUsage()).resolves.toMatchObject({
      period: 'day',
    });
  });
});
