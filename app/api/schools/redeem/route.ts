import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { consumeRateLimit, getClientIp } from '@/lib/providers/rate-limit';
import { SchoolRedeemError, redeemSchoolCode } from '@/features/schools/server/redeem';

// Operators may issue memorable custom codes (a teacher dictates one to a
// class), so code entropy alone cannot be the defense against guessing. Two
// buckets: one per network, one per signed-in account.
const REDEEM_IP_LIMIT = 20;
const REDEEM_USER_LIMIT = 10;
const REDEEM_WINDOW_SECONDS = 3600;

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

export async function POST(request: NextRequest) {
  const ipRate = await consumeRateLimit({
    key: getClientIp(request.headers),
    endpoint: 'school-redeem-ip',
    limit: REDEEM_IP_LIMIT,
    windowSeconds: REDEEM_WINDOW_SECONDS,
  });
  if (!ipRate.allowed) return tooManyRequests(ipRate.retryAfterSeconds);

  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return unauthorizedResponse('Sign in to use a school code.');
  }

  // A single account must not be able to walk the code space from many IPs.
  const userRate = await consumeRateLimit({
    key: user.id,
    endpoint: 'school-redeem-user',
    limit: REDEEM_USER_LIMIT,
    windowSeconds: REDEEM_WINDOW_SECONDS,
  });
  if (!userRate.allowed) return tooManyRequests(userRate.retryAfterSeconds);

  const body = await request.json().catch(() => null);
  const { code, listId } = (body ?? {}) as { code?: unknown; listId?: unknown };
  if (typeof code !== 'string') {
    return NextResponse.json(
      { error: 'Invalid school code.', code: 'INVALID_SCHOOL_CODE' },
      { status: 404 },
    );
  }

  try {
    return NextResponse.json(
      await redeemSchoolCode({
        user,
        code,
        listId: typeof listId === 'string' ? listId : null,
      }),
    );
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
