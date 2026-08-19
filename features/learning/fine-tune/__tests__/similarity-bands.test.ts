import { describe, it, expect } from 'vitest';
import {
  bandAtLeast,
  similarityBand,
  similarityBandForTerms,
} from '@/features/learning/minigames/similarity';
import type { NormalizedWord } from '@/lib/words';

const word = (id: string, cz: string, vi: string): NormalizedWord => ({
  id, cz, vi, en: '', category: ['word'],
});

describe('similarityBandForTerms', () => {
  it('treats a one-letter difference as extreme even in short words', () => {
    // The motivating case: by ratio alone "fér"/"fén" is only 0.67, yet it is
    // exactly the pair a learner misreads.
    expect(similarityBandForTerms('fér', 'fén')).toBe('III');
  });

  it('treats identical terms as extreme', () => {
    expect(similarityBandForTerms('kolo', 'kolo')).toBe('III');
  });

  it('reaches extreme by ratio for longer near-twins', () => {
    expect(similarityBandForTerms('nemocnice', 'nemocnica')).toBe('III');
  });

  it('marks a shared stem as similar', () => {
    expect(similarityBandForTerms('pracovat', 'pracovna')).toBe('II');
  });

  it('marks unrelated words as different', () => {
    expect(similarityBandForTerms('pes', 'stůl')).toBe('I');
  });

  it('never promotes multi-word phrases', () => {
    expect(similarityBandForTerms('dobrý den', 'dobrý dan')).toBe('I');
  });

  it('never promotes very short fragments', () => {
    expect(similarityBandForTerms('a', 'b')).toBe('I');
  });
});

describe('similarityBand', () => {
  it('takes the more confusable of the two sides', () => {
    const a = word('a', 'pes', 'cho');
    const b = word('b', 'stůl', 'cha');
    expect(similarityBand(a, b)).toBe('III');
  });
});

describe('bandAtLeast', () => {
  it('lets a harder band satisfy an easier requirement', () => {
    expect(bandAtLeast('III', 'II')).toBe(true);
    expect(bandAtLeast('II', 'III')).toBe(false);
    expect(bandAtLeast('I', 'I')).toBe(true);
  });
});
