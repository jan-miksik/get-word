import { describe, it, expect } from 'vitest';
import { matchAnswer, injectMinigames } from '../minigames';
import type { NormalizedWord, } from '../words';
import type { MiniGameConfig } from '../minigames';

const makeWord = (id: string, cz: string, vi: string): NormalizedWord => ({
  id, cz, vi, en: '', category: ['word'],
});

describe('matchAnswer', () => {
  it('returns exact for identical strings', () => {
    expect(matchAnswer('pes', 'pes')).toBe('exact');
  });
  it('is case-insensitive for exact', () => {
    expect(matchAnswer('Pes', 'pes')).toBe('exact');
  });
  it('returns close when only diacritics differ', () => {
    expect(matchAnswer('a', 'â')).toBe('close');
    expect(matchAnswer('con meo', 'con mèo')).toBe('close');
    expect(matchAnswer('pes', 'pěs')).toBe('close');
  });
  it('returns wrong for different base letters', () => {
    expect(matchAnswer('cat', 'pes')).toBe('wrong');
  });
  it('trims whitespace', () => {
    expect(matchAnswer('  pes  ', 'pes')).toBe('exact');
  });
});

describe('injectMinigames', () => {
  const words = Array.from({ length: 20 }, (_, i) =>
    makeWord(`w${i}`, `cz${i}`, `vi${i}`)
  );

  it('returns original words when pool is too small', () => {
    const result = injectMinigames(words, [], 'cz');
    expect(result.every(item => !('_isMinigame' in item))).toBe(true);
  });

  it('returns original words when pool has fewer than 4', () => {
    const result = injectMinigames(words, words.slice(0, 3), 'cz');
    expect(result.every(item => !('_isMinigame' in item))).toBe(true);
  });

  it('injects at least one game into 20 words with sufficient pool', () => {
    const result = injectMinigames(words, words, 'cz', 42);
    expect(result.some(item => '_isMinigame' in item)).toBe(true);
  });

  it('never injects two consecutive minigames', () => {
    const result = injectMinigames(words, words, 'cz', 42);
    for (let i = 0; i < result.length - 1; i++) {
      if ('_isMinigame' in result[i]) {
        expect('_isMinigame' in result[i + 1]).toBe(false);
      }
    }
  });

  it('each game has exactly 4 words', () => {
    const result = injectMinigames(words, words, 'cz', 42);
    result.forEach(item => {
      if ('_isMinigame' in item) {
        expect(item.words.length).toBe(4);
      }
    });
  });

  it('game types cycle multipleChoice -> typing -> matching', () => {
    // Use a large enough word list to guarantee at least 3 games
    const manyWords = Array.from({ length: 50 }, (_, i) => makeWord(`w${i}`, `cz${i}`, `vi${i}`));
    const result = injectMinigames(manyWords, manyWords, 'cz', 1);
    const games = result.filter(item => '_isMinigame' in item) as any[];
    if (games.length >= 3) {
      expect(games[0].gameType).toBe('multipleChoice');
      expect(games[1].gameType).toBe('typing');
      expect(games[2].gameType).toBe('matching');
    }
  });

  it('each injected game has anchorWordId set to the word immediately before it', () => {
    const result = injectMinigames(words, words, 'cz', 42);
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    expect(games.length).toBeGreaterThan(0);
    games.forEach(game => {
      expect(game.anchorWordId).toBeDefined();
      const gameIdx = result.indexOf(game);
      const wordBefore = result[gameIdx - 1] as NormalizedWord;
      expect(wordBefore.id).toBe(game.anchorWordId);
    });
  });

  it('game id equals game-{anchorWordId}', () => {
    const result = injectMinigames(words, words, 'cz', 42);
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    expect(games.length).toBeGreaterThan(0);
    games.forEach(game => {
      expect(game.id).toBe(`game-${game.anchorWordId}`);
    });
  });

  it('same word triggers a game regardless of its position in stream', () => {
    const result = injectMinigames(words, words, 'cz', 42);
    const games = result.filter(item => '_isMinigame' in item) as MiniGameConfig[];
    if (games.length === 0) return;

    const anchorWord = words.find(w => w.id === games[0].anchorWordId)!;
    // Place anchor word at position 0 so lastWasGame cannot block it
    const reordered = [anchorWord, ...words.filter(w => w.id !== anchorWord.id)];
    const result2 = injectMinigames(reordered, words, 'cz', 42);
    // Game should appear immediately after the anchor at index 0
    const itemAfterAnchor = result2[1];
    expect(itemAfterAnchor && '_isMinigame' in itemAfterAnchor).toBe(true);
    expect((itemAfterAnchor as MiniGameConfig).anchorWordId).toBe(anchorWord.id);
  });
});
