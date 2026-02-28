import type { NormalizedWord } from './words';

export type GameType = 'multipleChoice' | 'typing' | 'matching';

export interface MiniGameConfig {
  _isMinigame: true;
  id: string;
  gameType: GameType;
  /** 4 words used in the game */
  words: NormalizedWord[];
  /** ID of the word that anchors this game in the stream */
  anchorWordId?: string;
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

export interface InjectMinigamesOptions {
  /**
   * Minimum number of word cards between injected mini-games.
   * If omitted, falls back to the default 5–10 range.
   */
  minInterval?: number;
  /**
   * Maximum number of word cards between injected mini-games.
   * Must be >= minInterval when provided.
   */
  maxInterval?: number;
}

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
  options?: InjectMinigamesOptions,
): StreamItem[] {
  if (learnedPool.length < 4) return [...words];

  const result: StreamItem[] = [];
  let gameIndex = 0;

  // PRNG for selecting game words (not positions)
  const rand =
    seed !== undefined
      ? (() => {
          let s = seed;
          return () => {
            s = (s * 16807 + 0) % 2147483647;
            return (s - 1) / 2147483646;
          };
        })()
      : Math.random.bind(Math);

  // Apply user-chosen frequency: min/max word cards between games (default 5–10).
  let minInterval = 5;
  let maxInterval = 10;
  if (options?.minInterval !== undefined || options?.maxInterval !== undefined) {
    const minRaw = options.minInterval ?? 2;
    const maxRaw = options.maxInterval ?? options.minInterval ?? 10;
    minInterval = Math.max(1, Math.min(50, Math.floor(minRaw)));
    maxInterval = Math.max(minInterval, Math.min(100, Math.floor(maxRaw)));
  }
  const avgInterval = (minInterval + maxInterval) / 2;
  // Probability to insert at each eligible slot so expected gap ≈ avgInterval.
  const density = avgInterval > minInterval ? 1 / (avgInterval - minInterval) : 1;
  const insertProbability = Math.min(1, Math.max(0.05, density));

  // Deterministic hash per word so anchor is stable; same word always same decision.
  const baseSeed = seed ?? 1;
  const hashToUnit = (id: string): number => {
    let h = 2166136261 ^ baseSeed;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 2147483647) / 2147483647;
  };

  let wordsSinceLastGame = 0;
  let lastWasGame = false;

  words.forEach((word) => {
    result.push(word);
    wordsSinceLastGame++;

    // Allow first game after 1 word; later games need at least minInterval words since last game
    const eligible =
      (wordsSinceLastGame >= minInterval || (gameIndex === 0 && wordsSinceLastGame >= 1)) &&
      !lastWasGame;
    const r = hashToUnit(word.id);
    const wantsGame = eligible && r < insertProbability;

    if (wantsGame) {
      const shuffled = [...learnedPool].sort(() => rand() - 0.5);
      const gameWords = shuffled.slice(0, 4);
      result.push({
        _isMinigame: true,
        id: `game-${word.id}`,
        anchorWordId: word.id,
        gameType: GAME_CYCLE[gameIndex % GAME_CYCLE.length],
        words: gameWords,
      });
      gameIndex++;
      wordsSinceLastGame = 0;
      lastWasGame = true;
    } else {
      lastWasGame = false;
    }
  });

  return result;
}
