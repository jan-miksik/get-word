import type { WordList } from './types';

export function normalizeListLanguageCode(code: string): string {
  const [base, region] = String(code).trim().split('-');
  const normalizedBase = (base ?? '').toLowerCase();
  if (normalizedBase === 'cs' || normalizedBase === 'cz') return 'cs';
  return region ? `${normalizedBase}-${region.toUpperCase()}` : normalizedBase;
}

export function isSameListDirection(left: WordList, right: WordList): boolean {
  return (
    normalizeListLanguageCode(left.languageFrom) === normalizeListLanguageCode(right.languageFrom) &&
    normalizeListLanguageCode(left.languageTo) === normalizeListLanguageCode(right.languageTo)
  );
}
