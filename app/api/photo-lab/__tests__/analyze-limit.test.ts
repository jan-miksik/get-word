import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveUserFromRequest = vi.fn();
const mockAnalyzePhoto = vi.fn();
const mockReservePhotoLabRateLimit = vi.fn();
const mockReleasePhotoLabReservation = vi.fn();
const mockGetPhotoLabUsage = vi.fn();

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  isEditor: (user: { userRole?: string }) => user.userRole === 'editor',
  unauthorizedResponse: () => new Response(null, { status: 401 }),
}));

vi.mock('@/features/photo-lab/server/analyze', () => ({
  analyzePhoto: (...args: unknown[]) => mockAnalyzePhoto(...args),
}));

vi.mock('@/features/photo-lab/server/analysis-events', () => ({
  recordPhotoAnalysisEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/features/photo-lab/server/rate-limit', () => ({
  DailyLimitError: class extends Error {},
  reservePhotoLabRateLimit: (...args: unknown[]) => mockReservePhotoLabRateLimit(...args),
  releasePhotoLabReservation: (...args: unknown[]) => mockReleasePhotoLabReservation(...args),
  getPhotoLabUsage: (...args: unknown[]) => mockGetPhotoLabUsage(...args),
}));

import { POST } from '../analyze/route';

function analyzeRequest() {
  return new NextRequest('http://localhost/api/photo-lab/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      image: 'data:image/jpeg;base64,AAAA',
      language_from: 'cs',
      language_to: 'en',
    }),
  });
}

describe('POST /api/photo-lab/analyze — exhausted allowance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserFromRequest.mockResolvedValue({ id: 'user-1', photoLabLimitOverride: null });
    mockReservePhotoLabRateLimit.mockResolvedValue({ source: 'default' });
    mockAnalyzePhoto.mockResolvedValue([]);
    process.env.OPENROUTER_SERVER_API_KEY = 'test-key';
  });

  it('refuses before the upload is read and without touching the reservation', async () => {
    mockGetPhotoLabUsage.mockResolvedValue({ used: 5, limit: 5, remaining: 0 });

    const request = analyzeRequest();
    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: 'PHOTO_LAB_LIMIT_REACHED' });
    // The body must be left unread: a client that is already refused should
    // never be made to wait out a multi-megabyte upload.
    expect(request.bodyUsed).toBe(false);
    expect(mockReservePhotoLabRateLimit).not.toHaveBeenCalled();
    expect(mockAnalyzePhoto).not.toHaveBeenCalled();
  });

  it('passes the per-account override to both the usage read and the reservation', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ id: 'user-1', photoLabLimitOverride: 50 });
    mockGetPhotoLabUsage.mockResolvedValue({ used: 30, limit: 50, remaining: 20 });

    const response = await POST(analyzeRequest());

    expect(response.status).toBe(200);
    expect(mockGetPhotoLabUsage).toHaveBeenCalledWith('user-1', false, 50);
    expect(mockReservePhotoLabRateLimit).toHaveBeenCalledWith('user-1', false, 50);
  });
});
