import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveUserFromRequest = vi.fn();
const mockGetPhotoLabUsage = vi.fn();

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  isEditor: (user: { userRole?: string }) => user.userRole === 'editor',
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
}));

vi.mock('@/features/photo-lab/server/rate-limit', () => ({
  getPhotoLabUsage: (...args: unknown[]) => mockGetPhotoLabUsage(...args),
}));

import { GET } from '../route';

describe('GET /api/photo-lab/usage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the weekly analysis allowance for a regular user', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ id: 'user-1', userRole: 'user' });
    mockGetPhotoLabUsage.mockResolvedValue({
      used: 2,
      limit: 5,
      remaining: 3,
      resetAt: new Date('2026-07-20T00:00:00.000Z'),
      period: 'week',
    });

    const response = await GET(new NextRequest('http://localhost/api/photo-lab/usage'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      used: 2,
      limit: 5,
      remaining: 3,
      reset_at: '2026-07-20T00:00:00.000Z',
      period: 'week',
    });
    expect(mockGetPhotoLabUsage).toHaveBeenCalledWith('user-1', false, undefined);
  });

  it('returns the daily analysis allowance for an editor', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ id: 'user-2', userRole: 'editor' });
    mockGetPhotoLabUsage.mockResolvedValue({
      used: 3,
      limit: 10,
      remaining: 7,
      resetAt: new Date('2026-07-16T00:00:00.000Z'),
      period: 'day',
    });

    const response = await GET(new NextRequest('http://localhost/api/photo-lab/usage'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      used: 3,
      limit: 10,
      remaining: 7,
      reset_at: '2026-07-16T00:00:00.000Z',
      period: 'day',
    });
    expect(mockGetPhotoLabUsage).toHaveBeenCalledWith('user-2', true, undefined);
  });

  it('requires an authenticated device', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/photo-lab/usage'));

    expect(response.status).toBe(401);
    expect(mockGetPhotoLabUsage).not.toHaveBeenCalled();
  });
});
