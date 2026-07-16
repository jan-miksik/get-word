'use client';

import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';
import type { PhotoLabLabel } from '@/features/photo-lab/types';

export type PhotoLabErrorCode =
  | 'limit'
  | 'imageProcessing'
  | 'tooLarge'
  | 'unauthorized'
  | 'generic';

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
  let response: Response;
  try {
    response = await deviceJsonFetch('/api/photo-lab/analyze', {
      method: 'POST',
      body: JSON.stringify({
        image: dataUrl,
        language_from: languageFrom,
        language_to: languageTo,
      }),
    });
  } catch {
    throw new PhotoLabRequestError('generic');
  }

  const body = (await response.json().catch(() => null)) as
    | { labels?: PhotoLabLabel[]; code?: string }
    | null;

  if (!response.ok) {
    throw new PhotoLabRequestError(codeForResponse(response.status, body));
  }
  return Array.isArray(body?.labels) ? body.labels : [];
}
