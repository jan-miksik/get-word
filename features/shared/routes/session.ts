import { NextResponse } from 'next/server';
import {
  GET_WORD_SESSION_COOKIE_NAME,
  GET_WORD_SESSION_TTL_SECONDS,
  signSession,
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
    ttlSeconds: GET_WORD_SESSION_TTL_SECONDS,
  });

  const response = NextResponse.json(payload);
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
