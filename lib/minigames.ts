import type { NormalizedWord } from './words';

export type GameType = 'multipleChoice' | 'typing' | 'matching';

/** Minigame frequency: 'off' or interval range (min/max word cards between games). */
export type MinigameFrequencyRange = { min: number; max: number } | 'off';

export const DEFAULT_MINIGAME_FREQUENCY: MinigameFrequencyRange = { min: 1, max: 3 };

export const MINIGAME_FREQUENCY_MIN = 0;
export const MINIGAME_FREQUENCY_MAX = 10;

export interface MiniGameConfig {
  _isMinigame: true;
  id: string;
  gameType: GameType;
  /** 4 words used in the game */
  words: NormalizedWord[];
  /**
   * originalIndex of the word after which this game is anchored.
   * Stable even when earlier words are removed from the stream.
   */
  anchorOriginalIndex?: number;
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
 * A stable game anchor computed from the original word list.
 * anchorOriginalIndex never changes, so the game can always find
 * its correct position even after words are removed.
 */
export interface GameAnchor {
  id: string;
  gameType: GameType;
  words: NormalizedWord[];
  /**
   * The originalIndex of the word after which this game is inserted.
   * When that word is removed, the game drifts to the nearest lower
   * surviving word — it never disappears.
   */
  anchorOriginalIndex: number;
}

/**
 * Phase 1 — Compute stable game anchors from the *original* ordered word list.
 *
 * Call this once per filter session (before any words are removed).
 * Each anchor records the originalIndex of the word it follows; that index
 * is frozen and never mutated, so anchor positions survive word removals.
 */
export function computeGameAnchors(
  originalWords: NormalizedWord[],
  learnedPool: NormalizedWord[],
  seed: number,
  options?: InjectMinigamesOptions,
): GameAnchor[] {
  if (originalWords.length === 0) return [];

  const baseSeed = seed;
  const normalizeSeed = (raw: number) => {
    const mod = 2147483647;
    const s = Math.floor(raw) % mod;
    return s <= 0 ? s + (mod - 1) : s;
  };

  const createRng = (rawSeed: number) => {
    let s = normalizeSeed(rawSeed);
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  };

  // Deterministic 32-bit mix to derive independent per-anchor RNG seeds.
  const mixSeed = (seedA: number, seedB: number) => {
    let x = (normalizeSeed(seedA) ^ normalizeSeed(seedB)) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return normalizeSeed(x);
  };

  const randGap = createRng(baseSeed);

  let minInterval = 5;
  let maxInterval = 10;
  if (options?.minInterval !== undefined || options?.maxInterval !== undefined) {
    const minRaw = options.minInterval ?? 2;
    const maxRaw = options.maxInterval ?? options.minInterval ?? 10;
    minInterval = Math.max(1, Math.min(50, Math.floor(minRaw)));
    maxInterval = Math.max(minInterval, Math.min(100, Math.floor(maxRaw)));
  }

  const pickGap = () =>
    minInterval + Math.floor(randGap() * (maxInterval - minInterval + 1));

  // Phase A — compute anchor positions using ONLY the gap PRNG.
  //
  // Critically, no learnedPool.sort() happens here. Array.sort() makes a
  // non-deterministic number of comparisons depending on array length, which
  // would consume an unpredictable number of rand() calls and silently shift
  // every subsequent gap position whenever learnedPool grows. By computing all
  // positions up-front in a tight loop, the gap sequence is perfectly stable
  // regardless of learnedPool size or content.
  const anchorIndices: number[] = [];
  let wordCount = 0;
  let nextGap = pickGap();
  for (let i = 0; i < originalWords.length; i++) {
    wordCount++;
    if (wordCount >= nextGap) {
      wordCount = 0;
      anchorIndices.push(i);
      nextGap = pickGap();
    }
  }

  // Phase B — pick game words for each locked position.
  // When the user has at least 4 words in progress, use that pool.
  // When they have none (new user), use the words in the stream above this
  // anchor (originalWords[0..i]) so minigames still appear and feel contextual.
  const useStreamAbove = learnedPool.length < 4;
  const STREAM_ABOVE_WINDOW = 14; // prefer nearby words above the minigame

  let lastSignature: string | null = null;
  const anchors: (GameAnchor | null)[] = [];

  const shuffleWithRand = <T,>(arr: T[], rand: () => number) => {
    const a = [...arr];
    for (let j = a.length - 1; j > 0; j--) {
      const k = Math.floor(rand() * (j + 1));
      [a[j], a[k]] = [a[k], a[j]];
    }
    return a;
  };

  const signatureOf = (words: NormalizedWord[]) =>
    words.map(w => w.id).sort().join('|');

  for (let slotIndex = 0; slotIndex < anchorIndices.length; slotIndex++) {
    const i = anchorIndices[slotIndex];
    let pool = useStreamAbove
      ? originalWords.slice(Math.max(0, i + 1 - STREAM_ABOVE_WINDOW), i + 1)
      : learnedPool;
    // New user: if the window above the anchor has < 4 words, use all words up to
    // this position, or the full list so every user sees minigames regardless of history.
    if (useStreamAbove && pool.length < 4 && originalWords.length >= 4) {
      pool = originalWords.slice(0, i + 1);
      if (pool.length < 4) pool = originalWords;
    }
    if (pool.length < 4) {
      anchors.push(null);
      continue;
    }

    const anchorId = `game-${originalWords[i].id}-s${baseSeed}`;

    let attempt = 0;
    let chosen: NormalizedWord[] | null = null;
    let sig = '';
    while (attempt < 4) {
      const randPick = createRng(mixSeed(baseSeed, mixSeed(i + 1, attempt + 1)));
      const shuffled = shuffleWithRand(pool, randPick);
      const candidate = shuffled.slice(0, 4);
      sig = signatureOf(candidate);
      if (sig !== lastSignature) {
        chosen = candidate;
        break;
      }
      attempt += 1;
    }
    if (!chosen) {
      const randPick = createRng(mixSeed(baseSeed, mixSeed(i + 1, 999)));
      const fallback = shuffleWithRand(pool, randPick).slice(0, 4);
      chosen = fallback;
      sig = signatureOf(fallback);
    }

    lastSignature = sig;
    anchors.push({
      id: anchorId,
      gameType: GAME_CYCLE[slotIndex % GAME_CYCLE.length],
      words: chosen,
      anchorOriginalIndex: i,
    });
  }

  return anchors.filter((a): a is GameAnchor => a !== null);
}

/**
 * Phase 2 — Compose the current visible stream from current words + stable anchors.
 *
 * Pure function — no mutation, no side effects.
 *
 * For each anchor, we find the highest-indexed remaining word whose
 * originalIndex ≤ anchor.anchorOriginalIndex and insert the game after it.
 * If no such word exists (all preceding words were removed), the game floats
 * to the top of the stream. This guarantees games never silently disappear.
 * If currentWords is empty, returns an empty stream (no context to show games).
 *
 * @param currentWords   The currently visible word list (already filtered).
 * @param originalIndexMap  Maps word id → its originalIndex (assigned once, never changes).
 * @param anchors        Stable anchors from computeGameAnchors().
 */
export function composeStream(
  currentWords: NormalizedWord[],
  originalIndexMap: Map<string, number>,
  anchors: GameAnchor[],
): StreamItem[] {
  if (currentWords.length === 0) return [];
  if (anchors.length === 0) return [...currentWords];

  // Process anchors in ascending position order so multiple games on the
  // same word are inserted in their natural sequence.
  const sortedAnchors = [...anchors].sort((a, b) => a.anchorOriginalIndex - b.anchorOriginalIndex);

  // Map each current word to its stable originalIndex.
  const wordsWithOrigIdx = currentWords.map(w => ({
    word: w,
    origIdx: originalIndexMap.get(w.id) ?? -1,
  }));

  // Decide where in currentWords each anchor inserts.
  // insertAfter = -1  →  insert before all words (game floats to top when
  //                       every word with origIdx ≤ anchor has been removed).
  const insertions = new Map<number, GameAnchor[]>();
  const usedSlots = new Set<number>();
  const maxIndex = wordsWithOrigIdx.length - 1;
  const totalSlots = currentWords.length + 1; // -1 plus 0..maxIndex

  for (const anchor of sortedAnchors) {
    if (usedSlots.size >= totalSlots) break;
    let insertAfter = -1;
    // Find the remaining word with the maximum originalIndex that is still ≤
    // the anchor position ("nearest lower surviving word"), independent of the
    // currentWords ordering.
    let bestOrigIdx = Number.NEGATIVE_INFINITY;
    let bestIdx = -1;
    for (let i = 0; i < wordsWithOrigIdx.length; i++) {
      const origIdx = wordsWithOrigIdx[i].origIdx;
      if (origIdx < 0) continue;
      if (origIdx <= anchor.anchorOriginalIndex && origIdx >= bestOrigIdx) {
        bestOrigIdx = origIdx;
        bestIdx = i;
      }
    }
    insertAfter = bestIdx;

    let target = Math.max(-1, Math.min(maxIndex, insertAfter));
    if (usedSlots.has(target)) {
      let found = false;
      for (let t = target + 1; t <= maxIndex; t++) {
        if (!usedSlots.has(t)) {
          target = t;
          found = true;
          break;
        }
      }
      if (!found) {
        for (let t = target - 1; t >= -1; t--) {
          if (!usedSlots.has(t)) {
            target = t;
            found = true;
            break;
          }
        }
      }
      if (!found) continue;
    }

    usedSlots.add(target);
    const list = insertions.get(target) ?? [];
    list.push(anchor);
    insertions.set(target, list);
  }

  const result: StreamItem[] = [];

  // Games that float to the top (insertAfter = -1)
  for (const anchor of (insertions.get(-1) ?? [])) {
    result.push({
      _isMinigame: true,
      id: anchor.id,
      gameType: anchor.gameType,
      words: anchor.words,
      anchorOriginalIndex: anchor.anchorOriginalIndex,
    });
  }

  for (let i = 0; i < currentWords.length; i++) {
    result.push(currentWords[i]);

    for (const anchor of (insertions.get(i) ?? [])) {
      result.push({
        _isMinigame: true,
        id: anchor.id,
        gameType: anchor.gameType,
        words: anchor.words,
        anchorOriginalIndex: anchor.anchorOriginalIndex,
      });
    }
  }

  return result;
}

/**
 * Convenience wrapper that combines Phase 1 + Phase 2 for callers that
 * already have the full word list and don't need incremental composition.
 * Kept for backward compatibility with tests.
 */
export function injectMinigames(
  words: NormalizedWord[],
  learnedPool: NormalizedWord[],
  _role: 'cz' | 'vi',
  seed?: number,
  options?: InjectMinigamesOptions,
): StreamItem[] {
  if (words.length === 0) return [];

  const anchors = computeGameAnchors(words, learnedPool, seed ?? 1, options);
  if (anchors.length === 0) return [...words];

  // Identity map: when the full list is present every word's originalIndex
  // equals its current position, so composeStream produces the same order
  // as the old inline-injection loop.
  const originalIndexMap = new Map(words.map((w, i) => [w.id, i]));
  return composeStream(words, originalIndexMap, anchors);
}
