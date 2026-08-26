import type { NormalizedWord } from '@/lib/words';
import type { GameType, MiniGameConfig } from '@/features/learning/minigames';
import { resolveVariantDistractors } from '@/features/learning/fine-tune/distractors';

/**
 * The bonus block offered once the day is closed and there is nothing left to
 * study.
 *
 * Deliberately NOT a study session: nothing here writes progress, picks a
 * spaced-repetition stage or consults the fine-tune ladder. It builds a short
 * block out of the words already in the learner's study scope and hands the
 * rounds to the same `MiniGameCard` the study stream uses, so there is no
 * second implementation of any exercise — only a second reason to play one.
 *
 * The three exercises are mixed rather than chosen. Picking a game is a
 * decision the learner has no basis for making at the end of a finished day,
 * and a block that keeps changing shape holds attention better than ten
 * identical questions.
 */
type QuickPracticeMethod = 'choice' | 'matching' | 'bubbles';

/** Rotated through, in this order, for as long as the block lasts. */
const METHOD_ROTATION = ['choice', 'matching', 'bubbles'] as const satisfies
  readonly QuickPracticeMethod[];

const GAME_TYPE: Record<QuickPracticeMethod, GameType> = {
  choice: 'multipleChoice',
  matching: 'matching',
  bubbles: 'bubbleChoice',
};

/** How long one block is. Long enough to feel like a stretch, short enough to end. */
export const QUICK_PRACTICE_BLOCK_ROUNDS = 10;

/**
 * Below this the block would ask about the same two words ten times over, which
 * is worse than not offering it at all.
 */
const QUICK_PRACTICE_MIN_WORDS = 4;

/** Options a choice round aims for, and the floor it degrades to. */
const CHOICE_OPTIONS = 4;
const CHOICE_MIN_OPTIONS = 3;
/** Pairs one matching round covers. */
const MATCHING_PAIRS = 4;
const MATCHING_MIN_PAIRS = 2;
/** Bubbles on screen are the answer plus these. */
const BUBBLE_DISTRACTORS = 7;
const BUBBLE_MIN_DISTRACTORS = 3;

/**
 * Deterministic within a run, different between runs. A learner who plays two
 * blocks in a row should not get the same ten questions in the same order, but
 * a re-render must not reshuffle the round they are answering.
 */
function createRng(seed: number): () => number {
  let state = Math.floor(seed) % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

/** Words a round can actually be built from: one entry per id, both sides filled. */
function practicable(words: readonly NormalizedWord[]): NormalizedWord[] {
  const seen = new Set<string>();
  const output: NormalizedWord[] = [];
  for (const word of words) {
    if (seen.has(word.id) || !word.cz?.trim() || !word.vi?.trim()) continue;
    seen.add(word.id);
    output.push(word);
  }
  return output;
}

/** Whether a block is worth offering at all for this study scope. */
export function canQuickPractice(words: readonly NormalizedWord[]): boolean {
  return practicable(words).length >= QUICK_PRACTICE_MIN_WORDS;
}

/**
 * One round of one exercise, or null when the pool cannot fill it — a caller
 * that gets null moves on to the next exercise rather than giving up.
 */
function buildRound(
  method: QuickPracticeMethod,
  anchor: NormalizedWord,
  pool: NormalizedWord[],
  random: () => number,
  id: string,
): MiniGameConfig | null {
  const wanted =
    method === 'matching'
      ? Math.max(MATCHING_MIN_PAIRS, Math.min(MATCHING_PAIRS, pool.length)) - 1
      : method === 'bubbles'
        ? Math.max(BUBBLE_MIN_DISTRACTORS, Math.min(BUBBLE_DISTRACTORS, pool.length - 1))
        : Math.max(CHOICE_MIN_OPTIONS - 1, Math.min(CHOICE_OPTIONS, pool.length) - 1);

  const resolved = resolveVariantDistractors({
    target: anchor,
    pool,
    count: wanted,
    band: 'I',
    minInBand: () => 0,
    random,
  });
  if (!resolved) return null;

  return {
    _isMinigame: true,
    id,
    gameType: GAME_TYPE[method],
    level: 1,
    words: [anchor, ...resolved.distractors],
  };
}

export interface QuickPracticeInput {
  /** The learner's current study scope; every round is anchored to one of these. */
  words: readonly NormalizedWord[];
  seed: number;
  /** Shorter blocks are for previews and tests; the app uses the default. */
  size?: number;
}

/**
 * Build one block, or an empty list when these words cannot support even a
 * single round. Callers use the emptiness as the availability test — a block
 * that cannot be played is never offered.
 */
export function buildQuickPracticeBlock({
  words,
  seed,
  size = QUICK_PRACTICE_BLOCK_ROUNDS,
}: QuickPracticeInput): MiniGameConfig[] {
  const pool = practicable(words);
  if (pool.length < 2) return [];

  const random = createRng(seed);
  const rounds: MiniGameConfig[] = [];
  // Anchors are drawn from a shuffled bag that refills when it runs out, so a
  // short list repeats evenly instead of hammering whichever word sorts first.
  let bag: NormalizedWord[] = [];
  let rotation = 0;
  // Guards a scope no exercise can be built from at all; a single exercise that
  // cannot be filled only costs its turn in the rotation.
  let consecutiveMisses = 0;

  while (rounds.length < size && consecutiveMisses < METHOD_ROTATION.length) {
    const method = METHOD_ROTATION[rotation % METHOD_ROTATION.length];
    rotation += 1;
    if (bag.length === 0) bag = shuffled(pool, random);
    const anchor = bag.shift();
    if (!anchor) break;

    const round = buildRound(method, anchor, pool, random, `quick-${rounds.length}-${anchor.id}`);
    if (!round) {
      consecutiveMisses += 1;
      // The anchor was never asked about, so it goes back for the next exercise.
      bag.unshift(anchor);
      continue;
    }
    consecutiveMisses = 0;
    rounds.push(round);
  }

  return rounds;
}
