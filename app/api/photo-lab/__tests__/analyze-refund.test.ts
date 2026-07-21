import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { OpenRouterChatError } from '@/lib/openrouter-chat';

const mockResolveUserFromRequest = vi.fn();
const mockAnalyzePhoto = vi.fn();
const mockReservePhotoLabRateLimit = vi.fn();
const mockReleasePhotoLabReservation = vi.fn();

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  isEditor: () => false,
  unauthorizedResponse: () => new Response(null, { status: 401 }),
}));

vi.mock('@/features/photo-lab/server/analyze', () => ({
  analyzePhoto: (...args: unknown[]) => mockAnalyzePhoto(...args),
}));

vi.mock('@/features/photo-lab/server/rate-limit', () => ({
  DailyLimitError: class extends Error {},
  reservePhotoLabRateLimit: (...args: unknown[]) => mockReservePhotoLabRateLimit(...args),
  releasePhotoLabReservation: (...args: unknown[]) => mockReleasePhotoLabReservation(...args),
}));

import { POST } from '../analyze/route';

const SCHOOL_RESERVATION = {
  source: 'school',
  userId: 'user-1',
  periodStart: new Date('2026-07-01T00:00:00.000Z'),
};

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

describe('POST /api/photo-lab/analyze — school allowance on failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockResolveUserFromRequest.mockResolvedValue({ id: 'user-1' });
    mockReservePhotoLabRateLimit.mockResolvedValue(SCHOOL_RESERVATION);
    process.env.OPENROUTER_SERVER_API_KEY = 'test-key';
  });

  it('keeps the allowance spent when the analysis succeeds', async () => {
    mockAnalyzePhoto.mockResolvedValue([]);

    const response = await POST(analyzeRequest());

    expect(response.status).toBe(200);
    expect(mockReleasePhotoLabReservation).not.toHaveBeenCalled();
  });

  it('refunds when the provider responded but produced nothing usable', async () => {
    mockAnalyzePhoto.mockRejectedValue(
      new OpenRouterChatError('OpenRouter API error: 500', true, 500),
    );

    const response = await POST(analyzeRequest());

    expect(response.status).toBe(502);
    expect(mockReleasePhotoLabReservation).toHaveBeenCalledWith(SCHOOL_RESERVATION);
  });

  it('refunds when the provider is out of credits', async () => {
    mockAnalyzePhoto.mockRejectedValue(
      new OpenRouterChatError('OpenRouter API error: 402', false, 402),
    );

    const response = await POST(analyzeRequest());

    expect(response.status).toBe(402);
    expect(mockReleasePhotoLabReservation).toHaveBeenCalledWith(SCHOOL_RESERVATION);
  });

  it('keeps the allowance spent on an ambiguous transport failure', async () => {
    mockAnalyzePhoto.mockRejectedValue(
      new OpenRouterChatError('OpenRouter request timed out.', true, undefined, 'transport'),
    );

    const response = await POST(analyzeRequest());

    expect(response.status).toBe(502);
    expect(mockReleasePhotoLabReservation).not.toHaveBeenCalled();
  });

  it('refunds before rethrowing an unexpected error', async () => {
    mockAnalyzePhoto.mockRejectedValue(new Error('boom'));

    await expect(POST(analyzeRequest())).rejects.toThrow('boom');
    expect(mockReleasePhotoLabReservation).toHaveBeenCalledWith(SCHOOL_RESERVATION);
  });
});
