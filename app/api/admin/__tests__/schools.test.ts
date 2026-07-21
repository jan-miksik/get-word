import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveAuthenticatedUser = vi.fn();
const mockIsEditor = vi.fn();
const mockListSchoolSummaries = vi.fn();
const mockGetSchoolUsageStats = vi.fn();

vi.mock('@/lib/auth', () => ({
  resolveAuthenticatedUser: (...args: unknown[]) => mockResolveAuthenticatedUser(...args),
  isEditor: (...args: unknown[]) => mockIsEditor(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }),
  forbiddenResponse: () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
}));

vi.mock('@/lib/db', () => ({
  listSchoolSummaries: (...args: unknown[]) => mockListSchoolSummaries(...args),
  getSchoolUsageStats: (...args: unknown[]) => mockGetSchoolUsageStats(...args),
}));

import { GET as listSchools } from '../schools/route';
import { GET as schoolStats } from '../schools/[schoolId]/stats/route';

const context = { params: Promise.resolve({ schoolId: 'school-a' }) };

describe('GET /api/admin/schools', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a signed-in account', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue(null);

    const response = await listSchools(new NextRequest('http://localhost/api/admin/schools'));

    expect(response.status).toBe(401);
    expect(mockListSchoolSummaries).not.toHaveBeenCalled();
  });

  it('rejects non-editors', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockIsEditor.mockReturnValue(false);

    const response = await listSchools(new NextRequest('http://localhost/api/admin/schools'));

    expect(response.status).toBe(403);
    expect(mockListSchoolSummaries).not.toHaveBeenCalled();
  });

  it('returns schools to editors', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockIsEditor.mockReturnValue(true);
    mockListSchoolSummaries.mockResolvedValue([{ id: 'school-a', name: 'Pilot' }]);

    const response = await listSchools(new NextRequest('http://localhost/api/admin/schools'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      schools: [{ id: 'school-a', name: 'Pilot' }],
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('GET /api/admin/schools/[schoolId]/stats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a signed-in account', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue(null);

    const response = await schoolStats(
      new NextRequest('http://localhost/api/admin/schools/school-a/stats'),
      context,
    );

    expect(response.status).toBe(401);
    expect(mockGetSchoolUsageStats).not.toHaveBeenCalled();
  });

  it('rejects non-editors', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockIsEditor.mockReturnValue(false);

    const response = await schoolStats(
      new NextRequest('http://localhost/api/admin/schools/school-a/stats'),
      context,
    );

    expect(response.status).toBe(403);
    expect(mockGetSchoolUsageStats).not.toHaveBeenCalled();
  });

  it('returns the requested school with the chosen activity window', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockIsEditor.mockReturnValue(true);
    mockGetSchoolUsageStats.mockResolvedValue({ school: { id: 'school-a' } });

    const response = await schoolStats(
      new NextRequest('http://localhost/api/admin/schools/school-a/stats?activityWindow=calendar'),
      context,
    );

    expect(response.status).toBe(200);
    expect(mockGetSchoolUsageStats).toHaveBeenCalledWith('school-a', {
      activityWindow: 'calendar',
    });
  });

  it('reports an unknown school as 404', async () => {
    mockResolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    mockIsEditor.mockReturnValue(true);
    mockGetSchoolUsageStats.mockResolvedValue(null);

    const response = await schoolStats(
      new NextRequest('http://localhost/api/admin/schools/school-a/stats'),
      context,
    );

    expect(response.status).toBe(404);
  });
});
