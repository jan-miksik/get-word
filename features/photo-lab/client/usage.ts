'use client';

import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';

export type PhotoLabUsage = {
  used: number;
  limit: number;
  remaining: number;
  reset_at: string;
  period: 'day' | 'week' | 'month';
  source?: 'default' | 'school';
};

function normalizeUsagePeriod(period: unknown): PhotoLabUsage['period'] {
  return period === 'week' || period === 'month' ? period : 'day';
}

export async function requestPhotoLabUsage(): Promise<PhotoLabUsage | null> {
  try {
    const response = await deviceJsonFetch('/api/photo-lab/usage');
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<PhotoLabUsage>;
    if (
      typeof body.used !== 'number' ||
      typeof body.limit !== 'number' ||
      typeof body.remaining !== 'number' ||
      typeof body.reset_at !== 'string'
    ) {
      return null;
    }
    return { ...body, period: normalizeUsagePeriod(body.period) } as PhotoLabUsage;
  } catch {
    return null;
  }
}
