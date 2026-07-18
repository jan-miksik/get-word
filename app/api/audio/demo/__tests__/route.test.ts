import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetLandingDemoAudio = vi.fn();

vi.mock('@/features/landing/server/getDemoAudio', () => ({
  getLandingDemoAudio: (...args: unknown[]) => mockGetLandingDemoAudio(...args),
}));

import { GET } from '../route';

describe('GET /api/audio/demo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects languages outside the fixed demo catalog', async () => {
    mockGetLandingDemoAudio.mockResolvedValue(null);
    const response = await GET(new NextRequest('http://localhost/api/audio/demo?lang=bad'));

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'Unsupported demo language' });
  });

  it('returns the service payload with the existing public cache policy', async () => {
    const payload = { lang: 'cs', results: [{ text: 'ano', audio_url: null }] };
    mockGetLandingDemoAudio.mockResolvedValue(payload);
    const response = await GET(new NextRequest('http://localhost/api/audio/demo?lang=cs'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    );
    expect(mockGetLandingDemoAudio).toHaveBeenCalledWith('cs');
  });
});
