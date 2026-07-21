import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { SchoolRedeemError, redeemSchoolCode } from '@/features/schools/server/redeem';

export async function POST(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse('AUTH_REQUIRED');
  }

  const body = await request.json().catch(() => null);
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') {
    return NextResponse.json(
      { error: 'Invalid school code.', code: 'INVALID_SCHOOL_CODE' },
      { status: 404 },
    );
  }

  try {
    return NextResponse.json(await redeemSchoolCode({ user, code }));
  } catch (err) {
    if (err instanceof SchoolRedeemError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    throw err;
  }
}
