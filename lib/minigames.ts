import type { NormalizedWord } from './words';

export type GameType = 'multipleChoice' | 'typing' | 'matching';
export type GameDifficultyLevel = 1 | 2;

/** Minigame frequency: 'off' or interval range (min/max word cards between games). */
export type MinigameFrequencyRange = { min: number; max: number } | 'off';

export const DEFAULT_MINIGAME_FREQUENCY = { min: 1, max: 3 } satisfies Exclude<
  MinigameFrequencyRange,
  'off'
>;

export const MINIGAME_FREQUENCY_MIN = 0;
export const MINIGAME_FREQUENCY_MAX = 10;

export interface MiniGameConfig {
  _isMinigame: true;
  id: string;
  gameType: GameType;
  /** Level 1 = any mix, Level 2 = contains similar-word distractors. */
  level?: GameDifficultyLevel;
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
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').trim().toLowerCase();
  if (strip(input) === strip(correct)) return 'close';
  return 'wrong';
}

function normalizeForSimilarity(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function isOneEditAway(a: string, b: string): boolean {
  if (a === b) return true;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < lenA && j < lenB) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (lenA > lenB) i += 1;
    else if (lenB > lenA) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }

  if (i < lenA || j < lenB) edits += 1;
  return edits <= 1;
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

function isSimilarTerm(a: string, b: string): boolean {
  const aTrim = a.trim();
  const bTrim = b.trim();
  if (!aTrim || !bTrim) return false;
  if (aTrim.split(/\s+/).length !== 1 || bTrim.split(/\s+/).length !== 1) return false;

  const normA = normalizeForSimilarity(aTrim);
  const normB = normalizeForSimilarity(bTrim);
  if (normA.length < 3 || normB.length < 3) return false;
  if (normA === normB) return true;
  if (Math.abs(normA.length - normB.length) <= 2 && commonPrefixLength(normA, normB) >= 3) {
    return true;
  }
  return isOneEditAway(normA, normB);
}

function areWordsSimilarForLevel2(a: NormalizedWord, b: NormalizedWord): boolean {
  return isSimilarTerm(a.cz, b.cz) || isSimilarTerm(a.vi, b.vi);
}

function buildSimilarPairs(pool: NormalizedWord[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      if (areWordsSimilarForLevel2(pool[i], pool[j])) {
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}

export function hasAtLeastOneSimilarPair(words: NormalizedWord[]): boolean {
  return buildSimilarPairs(words).length > 0;
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

export function sanitizeMinigameFrequency(
  range: MinigameFrequencyRange,
): MinigameFrequencyRange {
  if (range === 'off') return 'off';
  const min = Number.isFinite(range.min) ? Math.floor(range.min) : DEFAULT_MINIGAME_FREQUENCY.min;
  const max = Number.isFinite(range.max) ? Math.floor(range.max) : DEFAULT_MINIGAME_FREQUENCY.max;
  const clampedMin = Math.max(MINIGAME_FREQUENCY_MIN, Math.min(MINIGAME_FREQUENCY_MAX, min));
  const clampedMax = Math.max(clampedMin, Math.min(MINIGAME_FREQUENCY_MAX, max));
  return { min: clampedMin, max: clampedMax };
}

/**
 * A stable game anchor computed from the original word list.
 * anchorOriginalIndex never changes, so the game can always find
 * its correct position even after words are removed.
 */
export interface GameAnchor {
  id: string;
  gameType: GameType;
  level?: GameDifficultyLevel;
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
  const learnedPoolSimilarPairs = useStreamAbove ? [] : buildSimilarPairs(learnedPool);

  let lastSignature: string | null = null;
  const anchors: (GameAnchor | null)[] = [];

  const pickDistinctWords = (pool: NormalizedWord[], rand: () => number): NormalizedWord[] => {
    // Deterministically pick 4 distinct items without shuffling the whole pool.
    // This keeps computeGameAnchors O(#anchors) even for large pools (1k–5k words).
    const n = pool.length;
    if (n <= 4) return pool.slice(0, 4);
    const picked = new Set<number>();
    const out: NormalizedWord[] = [];
    while (out.length < 4) {
      const idx = Math.floor(rand() * n);
      if (picked.has(idx)) continue;
      picked.add(idx);
      out.push(pool[idx]);
    }
    return out;
  };

  const signatureOf = (words: NormalizedWord[]) =>
    words.map(w => w.id).sort().join('|');

  const pickLevel2DistinctWords = (
    pool: NormalizedWord[],
    similarPairs: Array<[number, number]>,
    rand: () => number
  ): NormalizedWord[] | null => {
    if (pool.length < 4 || similarPairs.length === 0) return null;
    const pair = similarPairs[Math.floor(rand() * similarPairs.length)];
    if (!pair) return null;

    const picked = new Set<number>(pair);
    const out: NormalizedWord[] = [pool[pair[0]], pool[pair[1]]];
    const n = pool.length;
    let guard = 0;
    while (out.length < 4 && guard < n * 6) {
      const idx = Math.floor(rand() * n);
      guard += 1;
      if (picked.has(idx)) continue;
      picked.add(idx);
      out.push(pool[idx]);
    }
    if (out.length < 4) return null;
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return hasAtLeastOneSimilarPair(out) ? out : null;
  };

  for (let slotIndex = 0; slotIndex < anchorIndices.length; slotIndex++) {
    const i = anchorIndices[slotIndex];
    const gameType = GAME_CYCLE[slotIndex % GAME_CYCLE.length];
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
    const level2Eligible =
      !useStreamAbove &&
      (gameType === 'multipleChoice' || gameType === 'matching') &&
      learnedPoolSimilarPairs.length > 0;

    let attempt = 0;
    let chosen: NormalizedWord[] | null = null;
    let chosenLevel: GameDifficultyLevel = 1;
    let sig = '';
    while (attempt < 4) {
      const randPick = createRng(mixSeed(baseSeed, mixSeed(i + 1, attempt + 1)));
      const randLevel = createRng(mixSeed(baseSeed, mixSeed(i + 1, 5000 + attempt)));
      const shouldAttemptLevel2 = level2Eligible && randLevel() < 0.5;
      const level2Candidate = shouldAttemptLevel2
        ? pickLevel2DistinctWords(pool, learnedPoolSimilarPairs, randPick)
        : null;
      const candidate = level2Candidate ?? pickDistinctWords(pool, randPick);
      const candidateLevel: GameDifficultyLevel = level2Candidate ? 2 : 1;
      sig = signatureOf(candidate);
      if (sig !== lastSignature) {
        chosen = candidate;
        chosenLevel = candidateLevel;
        break;
      }
      attempt += 1;
    }
    if (!chosen) {
      const randPick = createRng(mixSeed(baseSeed, mixSeed(i + 1, 999)));
      const fallback = pickDistinctWords(pool, randPick);
      chosen = fallback;
      sig = signatureOf(fallback);
      chosenLevel = 1;
    }

    lastSignature = sig;
    anchors.push({
      id: anchorId,
      gameType,
      level: chosenLevel,
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
      level: anchor.level,
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
        level: anchor.level,
        words: anchor.words,
        anchorOriginalIndex: anchor.anchorOriginalIndex,
      });
    }
  }

  return result;
}

/**
 * Enforces a minimum number of word cards between minigames by delaying
 * too-early games until enough words have been emitted. Any games that cannot
 * be placed without violating the minimum are dropped.
 *
 * This is intended as a UI-level safety net for dynamic queues where words
 * can disappear (answered) and cause previously well-spaced anchors to
 * compress.
 */
export function enforceMinigameMinGap(stream: StreamItem[], minWordsBetweenGames: number): StreamItem[] {
  const raw = Number.isFinite(minWordsBetweenGames) ? Math.floor(minWordsBetweenGames) : 0;
  const minGap = Math.max(0, raw);
  if (minGap <= 0) return stream;

  const out: StreamItem[] = [];
  const pending: MiniGameConfig[] = [];

  // Allow a leading game (no gap requirement before the first game), but enforce
  // gaps between games thereafter.
  let wordsSinceLastGame = minGap;

  const flushPendingIfPossible = () => {
    while (pending.length > 0 && wordsSinceLastGame >= minGap) {
      const g = pending.shift()!;
      out.push(g);
      wordsSinceLastGame = 0;
    }
  };

  for (const item of stream) {
    if ('_isMinigame' in item) {
      if (wordsSinceLastGame < minGap) {
        pending.push(item);
      } else {
        out.push(item);
        wordsSinceLastGame = 0;
      }
      continue;
    }

    out.push(item);
    wordsSinceLastGame += 1;
    flushPendingIfPossible();
  }

  // Drop any remaining pending games (would violate min gap at end of stream).
  return out;
}

/**
 * Prunes the anchor list so the number of games never exceeds what the
 * current word count can accommodate at the configured minimum gap.
 *
 *   maxGames = floor(currentWordCount / (minGap + 1))
 *
 * This prevents anchor over-density when words shrink (e.g. user marks
 * 7 of 10 due words known — original 6 anchors would pile into 3 words).
 *
 * When minGap <= 0, games may be adjacent, so no cap is applied.
 * When currentWordCount is 0, there is no room for any game.
 */
export function pruneAnchorsForCurrentSize(
  anchors: GameAnchor[],
  currentWordCount: number,
  minGap: number,
): GameAnchor[] {
  if (currentWordCount === 0) return [];
  if (minGap <= 0) return anchors;
  const maxGames = Math.floor(currentWordCount / (minGap + 1));
  if (anchors.length <= maxGames) return anchors;
  return anchors.slice(0, Math.max(0, maxGames));
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
