const PHOTO_LAB_LANGUAGE_PAIR_STORAGE_KEY = 'get-word-photo-lab-langs';

export type PhotoLabLanguagePair = { from: string; to: string };

export function readPhotoLabLanguagePair(): Partial<PhotoLabLanguagePair> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PHOTO_LAB_LANGUAGE_PAIR_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PhotoLabLanguagePair>;
    return {
      from: typeof parsed.from === 'string' ? parsed.from : undefined,
      to: typeof parsed.to === 'string' ? parsed.to : undefined,
    };
  } catch {
    return {};
  }
}

export function storePhotoLabLanguagePair(pair: Partial<PhotoLabLanguagePair>): void {
  try {
    window.localStorage.setItem(PHOTO_LAB_LANGUAGE_PAIR_STORAGE_KEY, JSON.stringify(pair));
  } catch {
    // Preference persistence is best-effort.
  }
}
