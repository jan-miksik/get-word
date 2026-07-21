import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { getActiveSchoolEntitlement } from '@/features/schools/server/entitlements';
import { getSchoolUsageStats } from '@/lib/db';
import type { ActivityWindow } from '@/lib/stats/types';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * GET /api/schools/me/stats — usage for the signed-in teacher's own school.
 * The school is always derived from the caller's membership; a schoolId is
 * never accepted from the request. Students get 403: the dashboard is a
 * teacher tool, even though its member rows are pseudonymized.
 */
export async function GET(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    const response = unauthorizedResponse();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const entitlement = await getActiveSchoolEntitlement(user.id);
  if (!entitlement || entitlement.role !== 'teacher') {
    return NextResponse.json(
      { error: 'School teacher access required' },
      { status: 403, headers: NO_STORE },
    );
  }

  const activityWindow: ActivityWindow =
    request.nextUrl.searchParams.get('activityWindow') === 'calendar' ? 'calendar' : 'rolling';

  try {
    const stats = await getSchoolUsageStats(entitlement.schoolId, { activityWindow });
    if (!stats) {
      return NextResponse.json(
        { error: 'School not found' },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json(stats, { headers: NO_STORE });
  } catch (error) {
    console.error('Failed to get school usage stats', error);
    return NextResponse.json(
      { error: 'Failed to load school statistics' },
      { status: 500, headers: NO_STORE },
    );
  }
}
