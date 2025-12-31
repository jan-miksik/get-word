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
import { WORDS as RAW_WORDS } from '../slova.js';

// Validate at least one word to ensure structure matches
if (RAW_WORDS.length > 0) {
  const firstWord = RAW_WORDS[0];
  if (!('category' in firstWord) || !Array.isArray(firstWord.category)) {
    throw new Error('Invalid word data structure in slova.js: category must be an array');
  }
}

// Normalize words (shared across all users - static data)
import { normalizeWords, NormalizedWord } from '@/lib/words';

// Export typed and normalized words array
export const WORDS: NormalizedWord[] = normalizeWords(RAW_WORDS as Word[]);

