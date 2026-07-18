import { describe, it, expect } from 'vitest';
import type { NormalizedWord } from '@/lib/words';
import {
  getWordAudioSrcBySide,
  getWordAudioSrcsBySide,
  getWordLanguageCodeForSide,
  normalizeAudioPath,
} from '../types';

const makeWord = (extras?: Partial<NormalizedWord>): NormalizedWord => ({
  id: 'w1',
  cz: 'pes',
  vi: 'con cho',
  en: '',
  category: ['word'],
  ...extras,
});

describe('game audio helpers', () => {
  it('normalizes relative paths for public assets', () => {
    expect(normalizeAudioPath('speech/cz/pes.mp3')).toBe('/speech/cz/pes.mp3');
  });

  it('preserves absolute URLs', () => {
    expect(normalizeAudioPath('https://cdn.example.com/pes.mp3')).toBe('https://cdn.example.com/pes.mp3');
  });

  it('picks the first usable entry from audio arrays', () => {
    const word = makeWord({ czAudio: ['', 'speech/cz/pes.mp3'] });
    expect(getWordAudioSrcBySide(word, 'from')).toBe('/speech/cz/pes.mp3');
  });

  it('returns every usable audio entry as normalized fallback candidates', () => {
    const word = makeWord({
      czAudio: ['', 'speech/cz/pes.mp3', 'https://cdn.example.com/pes.mp3', 'speech/cz/pes.mp3'],
    });
    expect(getWordAudioSrcsBySide(word, 'from')).toEqual([
      '/speech/cz/pes.mp3',
      'https://cdn.example.com/pes.mp3',
    ]);
  });

  it('returns null when all audio array entries are empty', () => {
    const word = makeWord({ czAudio: ['', '   '] });
    expect(getWordAudioSrcBySide(word, 'from')).toBeNull();
  });

  it('reads pair-agnostic BCP-47 language codes off the word', () => {
    const word = makeWord({ languageFrom: 'en', languageTo: 'es' });
    expect(getWordLanguageCodeForSide(word, 'from')).toBe('en');
    expect(getWordLanguageCodeForSide(word, 'to')).toBe('es');
  });

  it('returns null when the word has no language metadata', () => {
    const word = makeWord();
    expect(getWordLanguageCodeForSide(word, 'from')).toBeNull();
  });
});
