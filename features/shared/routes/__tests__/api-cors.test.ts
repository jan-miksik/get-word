import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { handleApiCors } from '../api-cors';

const APP_ORIGIN = 'capacitor://localhost';

function request(
  method: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('https://getword.app/api/sync', { method, headers });
}

describe('API CORS for the native client', () => {
  it('answers a preflight from the app with 204 and allow headers', () => {
    const response = handleApiCors(
      request('OPTIONS', {
        origin: APP_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,x-device-id',
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(response.headers.get('access-control-allow-headers')).toContain('x-device-id');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('never allows credentials, so no cookie can be replayed cross-origin', () => {
    const response = handleApiCors(request('POST', { origin: APP_ORIGIN }));

    expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('does not grant access to an unknown origin', () => {
    const response = handleApiCors(request('GET', { origin: 'https://evil.example' }));

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('varies every API response on Origin so caches cannot cross the two', () => {
    const fromApp = handleApiCors(request('GET', { origin: APP_ORIGIN }));
    const sameOrigin = handleApiCors(request('GET'));

    expect(fromApp.headers.get('vary')).toContain('Origin');
    expect(sameOrigin.headers.get('vary')).toContain('Origin');
  });
});
