import { NextResponse } from 'next/server';
import {
  GET_WORD_SESSION_COOKIE_NAME,
  GET_WORD_SESSION_TTL_SECONDS,
  signSession,
} from '@/lib/session';

/**
 * Signs a fresh app session and sets the `get_word_session` cookie on an
 * existing response (works for JSON or redirect responses). The cookie always
 * carries the role passed here — callers must pass the current DB role so role
 * changes propagate on renewal rather than re-copying a stale claim.
 */
export async function setSessionCookieOnResponse<T extends NextResponse>(
  response: T,
  userId: string,
  userRole?: string | null
): Promise<T> {
  const safeUserRole = userRole === 'editor' ? 'editor' : 'user';
  const token = await signSession({
    userId,
    userRole: safeUserRole,
    ttlSeconds: GET_WORD_SESSION_TTL_SECONDS,
  });

  response.cookies.set({
    name: GET_WORD_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GET_WORD_SESSION_TTL_SECONDS,
  });

  return response;
}

export async function withSessionCookie(
  payload: Record<string, unknown>,
  userId: string,
  userRole?: string | null
) {
  return setSessionCookieOnResponse(NextResponse.json(payload), userId, userRole);
}
