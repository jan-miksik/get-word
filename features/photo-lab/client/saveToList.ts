'use client';

import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';

/** The single personal list this direction saves into. */
export type PhotoLabSaveList = {
  name: string;
  /** False until the first save creates it. */
  exists: boolean;
};

export type PhotoLabSaveWordsInput = {
  languageFrom: string;
  languageTo: string;
  categoryName: string;
  items: { known: string; target: string; audioHash?: string | null }[];
};

export type PhotoLabSavedWord = {
  known: string;
  target: string;
  outcome: 'added' | 'duplicate';
};

export type PhotoLabSaveWordsResult = {
  listId: string;
  listName: string;
  addedCount: number;
  duplicateCount: number;
  items: PhotoLabSavedWord[];
};

const SAVE_REQUEST_TIMEOUT_MS = 30_000;

export async function fetchPhotoLabSaveList(
  languageFrom: string,
  languageTo: string,
): Promise<PhotoLabSaveList | null> {
  try {
    const query = new URLSearchParams({ from: languageFrom, to: languageTo });
    const response = await deviceJsonFetch(`/api/photo-lab/save-to-list?${query.toString()}`, {
      signal: AbortSignal.timeout(SAVE_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as {
      list_name?: unknown;
      list_exists?: unknown;
    } | null;
    if (typeof body?.list_name !== 'string') return null;
    return { name: body.list_name, exists: body.list_exists === true };
  } catch {
    return null;
  }
}

export async function savePhotoLabWordsToList(
  input: PhotoLabSaveWordsInput,
): Promise<PhotoLabSaveWordsResult | null> {
  try {
    const response = await deviceJsonFetch('/api/photo-lab/save-to-list', {
      method: 'POST',
      body: JSON.stringify({
        language_from: input.languageFrom,
        language_to: input.languageTo,
        category_name: input.categoryName,
        items: input.items.map((item) => ({
          known: item.known,
          target: item.target,
          audio_hash: item.audioHash ?? null,
        })),
      }),
      signal: AbortSignal.timeout(SAVE_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as {
      list_id?: unknown;
      list_name?: unknown;
      added_count?: unknown;
      duplicate_count?: unknown;
      items?: { known?: unknown; target?: unknown; outcome?: unknown }[];
    } | null;
    if (
      typeof body?.list_id !== 'string' ||
      typeof body.list_name !== 'string' ||
      typeof body.added_count !== 'number' ||
      typeof body.duplicate_count !== 'number' ||
      !Array.isArray(body.items)
    ) {
      return null;
    }
    return {
      listId: body.list_id,
      listName: body.list_name,
      addedCount: body.added_count,
      duplicateCount: body.duplicate_count,
      items: body.items.flatMap((item) =>
        typeof item?.known === 'string' && typeof item.target === 'string'
          ? [
              {
                known: item.known,
                target: item.target,
                outcome: item.outcome === 'duplicate' ? ('duplicate' as const) : ('added' as const),
              },
            ]
          : [],
      ),
    };
  } catch {
    return null;
  }
}
