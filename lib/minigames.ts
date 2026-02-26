import type { NormalizedWord } from './words';

export type GameType = 'multipleChoice' | 'typing' | 'matching';

export interface MiniGameConfig {
  _isMinigame: true;
  id: string;
  gameType: GameType;
  /** 4 words used in the game */
  words: NormalizedWord[];
}

export type StreamItem = NormalizedWord | MiniGameConfig;

/**
 * Returns 'exact' | 'close' (right base letters, wrong diacritics) | 'wrong'
 * Strips NFD combining diacritical marks for the 'close' check.
 * Case-insensitive, trims whitespace.
 */
export function matchAnswer(input: string, correct: string): 'exact' | 'close' | 'wrong' {
  const trim = (s: string) => s.trim().toLowerCase();
  if (trim(input) === trim(correct)) return 'exact';
  const strip = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (strip(input) === strip(correct)) return 'close';
  return 'wrong';
}

const GAME_CYCLE: GameType[] = ['multipleChoice', 'typing', 'matching'];

/**
 * Injects MiniGameConfig items into a flat word array at random 5–10 card intervals.
 * Returns a new array mixing NormalizedWord and MiniGameConfig.
 * Requires learnedPool.length >= 4 to inject any games (returns words unchanged if not).
 */
export function injectMinigames(
  words: NormalizedWord[],
  learnedPool: NormalizedWord[],
  _role: 'cz' | 'vi',
  seed?: number,
): StreamItem[] {
  if (learnedPool.length < 4) return [...words];

  const result: StreamItem[] = [];
  let counter = 0;
  let gameIndex = 0;

  const rand = seed !== undefined
    ? (() => { let s = seed; return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; }; })()
    : Math.random.bind(Math);

  let nextThreshold = 5 + Math.floor(rand() * 6); // 5–10

  for (const word of words) {
    result.push(word);
    counter++;

    if (counter >= nextThreshold) {
      const shuffled = [...learnedPool].sort(() => rand() - 0.5);
      const gameWords = shuffled.slice(0, 4);

      result.push({
        _isMinigame: true,
        id: `game-${gameIndex}-${result.length}`,
        gameType: GAME_CYCLE[gameIndex % GAME_CYCLE.length],
        words: gameWords,
      });

      gameIndex++;
      counter = 0;
      nextThreshold = 5 + Math.floor(rand() * 6);
    }
  }

  return result;
}
