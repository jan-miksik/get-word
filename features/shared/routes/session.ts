import { NextResponse } from 'next/server';
import {
  signSession,
  WORDLINK_SESSION_COOKIE_NAME,
  WORDLINK_SESSION_TTL_SECONDS,
} from '@/lib/session';

export async function withSessionCookie(
  payload: Record<string, unknown>,
  userId: string,
  userRole?: string | null
) {
  const safeUserRole = userRole === 'editor' ? 'editor' : 'user';
  const token = await signSession({
    userId,
    userRole: safeUserRole,
    ttlSeconds: WORDLINK_SESSION_TTL_SECONDS,
  });

  const response = NextResponse.json(payload);
  response.cookies.set({
    name: WORDLINK_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: WORDLINK_SESSION_TTL_SECONDS,
  });

  return response;
}
