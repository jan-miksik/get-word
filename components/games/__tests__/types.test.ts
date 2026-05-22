import { describe, it, expect } from 'vitest';
import type { NormalizedWord } from '@/lib/words';
import { getWordAudioSrcByLang, getWordAudioSrcsByLang, normalizeAudioPath } from '../types';

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
    expect(getWordAudioSrcByLang(word, 'cz')).toBe('/speech/cz/pes.mp3');
  });

  it('returns every usable audio entry as normalized fallback candidates', () => {
    const word = makeWord({
      czAudio: ['', 'speech/cz/pes.mp3', 'https://cdn.example.com/pes.mp3', 'speech/cz/pes.mp3'],
    });
    expect(getWordAudioSrcsByLang(word, 'cz')).toEqual([
      '/speech/cz/pes.mp3',
      'https://cdn.example.com/pes.mp3',
    ]);
  });

  it('returns null when all audio array entries are empty', () => {
    const word = makeWord({ czAudio: ['', '   '] });
    expect(getWordAudioSrcByLang(word, 'cz')).toBeNull();
  });
});
