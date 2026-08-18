import { NextResponse, type NextRequest } from 'next/server';

/**
 * CORS for the native iOS client.
 *
 * The Capacitor build serves its bundle from `capacitor://localhost`, so every
 * call it makes to this API is cross-origin. It authenticates with a bearer
 * token from the Keychain rather than the `get_word_session` cookie, so these
 * responses deliberately do NOT set `Access-Control-Allow-Credentials`: no
 * cookie may ever be replayed cross-origin, and an allowed origin only gets
 * what its own bearer token grants it.
 *
 * The web app is same-origin and never reaches this logic.
 */
export const NATIVE_APP_ORIGINS = new Set([
  // Capacitor iOS (and the older Ionic scheme, in case a build predates it).
  'capacitor://localhost',
  'ionic://localhost',
  // Capacitor Android, if that build follows.
  'https://localhost',
  // `pnpm --dir mobile dev`, which runs the same bundle in a desktop browser.
  'http://localhost:4174',
  'http://127.0.0.1:4174',
]);

const ALLOWED_REQUEST_HEADERS = [
  'Content-Type',
  'Authorization',
  'x-device-id',
  'x-device-platform',
  'x-device-form-factor',
].join(', ');

const EXPOSED_RESPONSE_HEADERS = [
  'x-audio-storage',
  'x-audio-storage-provider',
  'x-audio-gateway',
  'x-get-word-total-ms',
].join(', ');

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': ALLOWED_REQUEST_HEADERS,
    'Access-Control-Expose-Headers': EXPOSED_RESPONSE_HEADERS,
    'Access-Control-Max-Age': '86400',
  };
}

function withVaryOnOrigin(response: NextResponse): NextResponse {
  // A shared cache must not hand a response minted for the app to a browser,
  // or the other way round, so every API response varies on Origin — not just
  // the ones that came from an allowed origin.
  response.headers.append('Vary', 'Origin');
  return response;
}

export function handleApiCors(request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');
  if (!origin || !NATIVE_APP_ORIGINS.has(origin)) {
    return withVaryOnOrigin(NextResponse.next());
  }

  const headers = corsHeaders(origin);

  // Route handlers answer OPTIONS with 405, which fails a preflight even when
  // the CORS headers are present. Answer it here instead.
  if (request.method === 'OPTIONS') {
    return withVaryOnOrigin(new NextResponse(null, { status: 204, headers }));
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return withVaryOnOrigin(response);
}
