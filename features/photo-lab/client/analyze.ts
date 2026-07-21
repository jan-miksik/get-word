'use client';

import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';
import type { PhotoLabLabel } from '@/features/photo-lab/types';

export type PhotoLabErrorCode =
  | 'limit'
  | 'imageProcessing'
  | 'tooLarge'
  | 'unauthorized'
  | 'timeout'
  | 'generic';

/**
 * Hard ceiling on one analysis round-trip. The model itself takes ~25s, but a
 * mobile upload that stalls mid-flight never rejects on its own — without this
 * the spinner would run forever with no way back to the retry button.
 */
export const PHOTO_LAB_ANALYZE_TIMEOUT_MS = 90_000;

export class PhotoLabRequestError extends Error {
  constructor(readonly code: PhotoLabErrorCode) {
    super(`Photo analysis failed: ${code}`);
    this.name = 'PhotoLabRequestError';
  }
}

function codeForResponse(status: number, body: { code?: string } | null): PhotoLabErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 429 || body?.code === 'PHOTO_LAB_LIMIT_REACHED') return 'limit';
  if (body?.code === 'PHOTO_TOO_LARGE') return 'tooLarge';
  return 'generic';
}

export async function requestPhotoAnalysis(
  dataUrl: string,
  languageFrom: string,
  languageTo: string,
): Promise<PhotoLabLabel[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PHOTO_LAB_ANALYZE_TIMEOUT_MS);

  // The timeout covers the body read too, not just the headers: the abort
  // signal rejects an in-flight `response.json()` as well, so a response that
  // stops mid-JSON cannot hang the caller either.
  try {
    const response = await deviceJsonFetch('/api/photo-lab/analyze', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        image: dataUrl,
        language_from: languageFrom,
        language_to: languageTo,
      }),
    });

    const body = (await response.json().catch(() => null)) as
      | { labels?: PhotoLabLabel[]; code?: string }
      | null;

    if (!response.ok) {
      throw new PhotoLabRequestError(codeForResponse(response.status, body));
    }
    return Array.isArray(body?.labels) ? body.labels : [];
  } catch (error) {
    if (error instanceof PhotoLabRequestError) throw error;
    throw new PhotoLabRequestError(controller.signal.aborted ? 'timeout' : 'generic');
  } finally {
    clearTimeout(timeoutId);
  }
}
