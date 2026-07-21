import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveAuthenticatedUser = vi.fn();
const mockGetActiveSchoolEntitlement = vi.fn();
const mockGetSchoolUsageStats = vi.fn();

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
}));

vi.mock('@/lib/db', () => ({
  getSchoolUsageStats: (...args: unknown[]) => mockGetSchoolUsageStats(...args),
}));

import { GET } from '../me/stats/route';

const teacher = { schoolId: 'school-a', role: 'teacher' };

function request(query = '') {
  return new NextRequest(`http://localhost/api/schools/me/stats${query}`);
}

describe('GET /api/schools/me/stats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a signed-in account', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mockGetSchoolUsageStats).not.toHaveBeenCalled();
  });

  it('rejects a user without a school entitlement', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockGetActiveSchoolEntitlement.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mockGetSchoolUsageStats).not.toHaveBeenCalled();
  });

  it('rejects students — the dashboard is a teacher tool', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockGetActiveSchoolEntitlement.mockResolvedValue({ schoolId: 'school-a', role: 'student' });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mockGetSchoolUsageStats).not.toHaveBeenCalled();
  });

  it('returns the teacher’s own school, never one named in the request', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockGetActiveSchoolEntitlement.mockResolvedValue(teacher);
    mockGetSchoolUsageStats.mockResolvedValue({ school: { id: 'school-a' } });

    const response = await GET(request('?schoolId=school-b&activityWindow=calendar'));

    expect(response.status).toBe(200);
    expect(mockGetSchoolUsageStats).toHaveBeenCalledWith('school-a', {
      activityWindow: 'calendar',
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('reports a deleted school as 404', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockGetActiveSchoolEntitlement.mockResolvedValue(teacher);
    mockGetSchoolUsageStats.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(404);
  });
});
