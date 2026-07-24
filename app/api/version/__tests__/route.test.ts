import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';

describe('GET /api/version', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the current app version without caching', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.0.124');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      'no-store, no-cache, must-revalidate'
    );
    expect(body).toEqual({ version: '1.0.124' });
  });
});
