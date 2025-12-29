// Type definitions for word data
export interface Word {
  category: string[];
  cz: string;
  en: string;
  vi: string;
  czPron?: string;
  viPron?: string;
  czAudio?: string | string[];
  viAudio?: string | string[];
  czHint?: string;
  viHint?: string;
}

// Import the original data from slova.js
// Note: slova.js uses .js extension but exports ES modules
// @ts-ignore - JS file import
import { WORDS as RAW_WORDS } from '../slova.js';

// Normalize words (shared across all users - static data)
import { normalizeWords, NormalizedWord } from '@/lib/words';

// Export typed and normalized words array
export const WORDS: NormalizedWord[] = normalizeWords(RAW_WORDS as Word[]);

