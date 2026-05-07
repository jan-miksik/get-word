import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();

vi.mock('../../client', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

import { getMultiDeviceUsageStats } from '../multi-device-insights';

describe('getMultiDeviceUsageStats', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('counts active devices and review-active devices', async () => {
    mockExecute
      .mockResolvedValueOnce([
        { one_device: 5, two_devices: 2, three_or_more_devices: 1 },
      ])
      .mockResolvedValueOnce([
        { one_device: 4, two_or_more_devices: 3 },
      ]);

    const since = new Date('2026-04-01T00:00:00.000Z');
    const stats = await getMultiDeviceUsageStats({ since });

    expect(stats).toEqual({
      since,
      activeDeviceUsers: {
        oneDevice: 5,
        twoDevices: 2,
        threeOrMoreDevices: 1,
      },
      reviewActiveUsers: {
        oneDevice: 4,
        twoOrMoreDevices: 3,
      },
    });
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});
