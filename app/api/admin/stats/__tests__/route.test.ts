import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveAuthenticatedUser = vi.fn();
const mockIsEditor = vi.fn();
const mockGetUsageStats = vi.fn();

vi.mock('@/lib/auth', () => ({
  resolveAuthenticatedUser: (...args: unknown[]) => mockResolveAuthenticatedUser(...args),
  isEditor: (...args: unknown[]) => mockIsEditor(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
  forbiddenResponse: () =>
    new Response(JSON.stringify({ error: 'Editor role required' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }),
}));

vi.mock('@/lib/db', () => ({
  getUsageStats: (...args: unknown[]) => mockGetUsageStats(...args),
}));

import { GET } from '../route';

const request = (url = 'http://localhost/api/admin/stats') => new NextRequest(url);

describe('GET /api/admin/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without a session', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mockGetUsageStats).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-editor', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'u1', userRole: 'user' });
    mockIsEditor.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mockGetUsageStats).not.toHaveBeenCalled();
  });

  it('returns the stats for an editor with no-store caching', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'e1', userRole: 'editor' });
    mockIsEditor.mockReturnValue(true);
    const stats = { generatedAt: '2026-07-15T12:00:00.000Z', activity: { mau: 20 } };
    mockGetUsageStats.mockResolvedValue(stats);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(stats);
    expect(mockGetUsageStats).toHaveBeenCalledWith({ activityWindow: 'rolling' });
  });

  it('passes the calendar activity window through to the stats query', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'e1', userRole: 'editor' });
    mockIsEditor.mockReturnValue(true);
    mockGetUsageStats.mockResolvedValue({ generatedAt: '2026-07-15T12:00:00.000Z' });

    const response = await GET(request('http://localhost/api/admin/stats?activityWindow=calendar'));

    expect(response.status).toBe(200);
    expect(mockGetUsageStats).toHaveBeenCalledWith({ activityWindow: 'calendar' });
  });

  it('returns a generic 500 when the stats query fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'e1', userRole: 'editor' });
    mockIsEditor.mockReturnValue(true);
    mockGetUsageStats.mockRejectedValue(new Error('db exploded: secret details'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'Failed to load usage statistics' });
    consoleError.mockRestore();
  });
});
