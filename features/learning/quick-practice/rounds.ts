import type { NormalizedWord } from '@/lib/words';
import type { GameType, MiniGameConfig } from '@/features/learning/minigames';
import type { ProgressData } from '@/features/sync/contracts';
import { resolveVariantDistractors } from '@/features/learning/fine-tune/distractors';
import { resolvePracticeExercise } from '@/features/learning/fine-tune/pick';
import type { ResolvedExercise } from '@/features/learning/fine-tune/types';
import type { LearningRole } from '@/features/learning/state/learningRole';

/**
 * The bonus block offered once the day is closed and there is nothing left to
 * study.
 *
 * Deliberately NOT a study session: nothing here writes progress, picks a
 * spaced-repetition stage or consults the fine-tune ladder. It builds a short
 * block out of the words already in the learner's study scope and hands each
 * card to the same component the study stream uses — `MiniGameCard` for the
 * multi-word rounds, `StudyExerciseCard` for the single-word exercises — so no
 * exercise is implemented twice; there is only a second reason to play one.
 *
 * The exercises are mixed rather than chosen. Picking one is a decision the
 * learner has no basis for making at the end of a finished day, and a block
 * that keeps changing shape holds attention better than ten identical
 * questions. The mix is everything the app can ask: reveal (scratched or
 * pressed, whichever the learner set), choice, typing, assembly, matching —
 * and at most one field of bubbles.
 */
type PracticeMethod = 'reveal' | 'choice' | 'typing' | 'assembly' | 'matching' | 'bubbles';

/**
 * Rotated through, in this order, for as long as the block lasts.
 *
 * Bubbles are not in it: one field is plenty. A bubble round is a whole screen
 * of its own and takes as long as three ordinary cards, so a rotation with
 * bubbles in it would spend a third of the block on them.
 */
const METHOD_ROTATION = ['choice', 'typing', 'matching', 'reveal', 'assembly'] as const satisfies
  readonly PracticeMethod[];

/** Everything the rotation can offer, plus the one bubble field. */
const METHOD_COUNT = METHOD_ROTATION.length + 1;

const GAME_TYPE: Record<'matching' | 'bubbles', GameType> = {
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

/** Pairs one matching round covers. */
const MATCHING_PAIRS = 4;
const MATCHING_MIN_PAIRS = 2;
/** Bubbles on screen are the answer plus these. */
const BUBBLE_DISTRACTORS = 7;
const BUBBLE_MIN_DISTRACTORS = 3;

/**
 * One card of a block: either a multi-word round or a single-word exercise.
 * Both are played the same way — answer it, move on, nothing written back.
 */
export type PracticeStep =
  | { kind: 'game'; id: string; config: MiniGameConfig }
  | { kind: 'exercise'; id: string; word: NormalizedWord; exercise: ResolvedExercise };

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
export function canQuickPractice(
  words: readonly NormalizedWord[],
  minimumWords = QUICK_PRACTICE_MIN_WORDS,
): boolean {
  return practicable(words).length >= Math.max(1, minimumWords);
}

/**
 * The bonus is free practice, not a second due queue.  It may therefore draw
 * from the whole selected list, but should begin with the words the learner
 * has gone longest without actually answering.  No progress is ever written
 * while practising, so this order stays stable for the whole block.
 *
 * A word never answered has no timestamp and naturally comes first.  At the
 * same age, lower stages lead: when there is more material than ten cards can
 * hold, that makes the voluntary block a little more useful without turning it
 * into a new SRS policy.
 */
export function rankPracticeWords(
  words: readonly NormalizedWord[],
  progress: Record<string, ProgressData> | undefined,
): NormalizedWord[] {
  return words
    .map((word, index) => ({ word, index }))
    .sort((left, right) => {
      const leftProgress = progress?.[left.word.id];
      const rightProgress = progress?.[right.word.id];
      const leftSeen = Math.max(leftProgress?.lastKnownAt ?? 0, leftProgress?.lastUnknownAt ?? 0);
      const rightSeen = Math.max(rightProgress?.lastKnownAt ?? 0, rightProgress?.lastUnknownAt ?? 0);
      if (leftSeen !== rightSeen) return leftSeen - rightSeen;

      const leftStage = leftProgress?.stageIndex ?? 0;
      const rightStage = rightProgress?.stageIndex ?? 0;
      if (leftStage !== rightStage) return leftStage - rightStage;

      return left.index - right.index;
    })
    .map(({ word }) => word);
}

/**
 * One multi-word round, or null when the pool cannot fill it — a caller that
 * gets null moves on to the next exercise rather than giving up.
 */
function buildGameRound(
  method: 'matching' | 'bubbles',
  anchor: NormalizedWord,
  pool: NormalizedWord[],
  random: () => number,
  id: string,
): MiniGameConfig | null {
  const wanted =
    method === 'matching'
      ? Math.max(MATCHING_MIN_PAIRS, Math.min(MATCHING_PAIRS, pool.length)) - 1
      : Math.max(BUBBLE_MIN_DISTRACTORS, Math.min(BUBBLE_DISTRACTORS, pool.length - 1));

  const resolved = resolveVariantDistractors({
    target: anchor,
    pool,
    count: wanted,
    band: 'I',
    minInBand: () => 0,
    random,
  });
  if (!resolved) return null;
  // A field of one bubble is not a field, and a pair game needs a pair. Both
  // floors are what the pool could not supply rather than what was asked for.
  if (resolved.distractors.length < (method === 'bubbles' ? BUBBLE_MIN_DISTRACTORS : 1)) return null;

  return {
    _isMinigame: true,
    id,
    gameType: GAME_TYPE[method],
    level: 1,
    words: [anchor, ...resolved.distractors],
  };
}

export interface QuickPracticeInput {
  /** The learner's current study scope; every card is anchored to one of these. */
  words: readonly NormalizedWord[];
  /** Which side of the pair the learner already knows; assembly needs it. */
  role: LearningRole;
  seed: number;
  /** Shorter blocks are for previews and tests; the app uses the default. */
  size?: number;
}

/**
 * Build one block, or an empty list when these words cannot support even a
 * single card. Callers use the emptiness as the availability test — a block
 * that cannot be played is never offered.
 */
export function buildQuickPracticeBlock({
  words,
  role,
  seed,
  size = QUICK_PRACTICE_BLOCK_ROUNDS,
}: QuickPracticeInput): PracticeStep[] {
  const pool = practicable(words);
  if (pool.length === 0) return [];

  const random = createRng(seed);
  // Where the single bubble field goes. Never the opening card: the field takes
  // the whole screen edge to edge, and a block that opens on it reads as having
  // started somewhere else. A scope too thin to fill a field skips it entirely,
  // and that slot goes back to the rotation.
  const bubbleSlot = pool.length > BUBBLE_MIN_DISTRACTORS && size > 1
    ? 1 + Math.floor(random() * (size - 1))
    : -1;

  const steps: PracticeStep[] = [];
  // Anchors are drawn from a shuffled bag that refills when it runs out, so a
  // short list repeats evenly instead of hammering whichever word sorts first.
  // Select before shuffling: the first block uses the least recently answered
  // words, while its presentation still feels varied.  Once that small pool is
  // exhausted, repeats come from the whole scope so a four-word list can still
  // make ten cards.
  const preferredPool = pool.slice(0, Math.min(size, pool.length));
  let bag: NormalizedWord[] = [];
  let rotation = 0;
  // Guards a scope no exercise can be built from at all; a single exercise that
  // cannot be filled only costs its turn in the rotation.
  let consecutiveMisses = 0;

  while (steps.length < size && consecutiveMisses < METHOD_COUNT) {
    const method: PracticeMethod = steps.length === bubbleSlot && consecutiveMisses === 0
      ? 'bubbles'
      : METHOD_ROTATION[rotation % METHOD_ROTATION.length];
    if (method !== 'bubbles') rotation += 1;
    if (bag.length === 0) bag = shuffled(steps.length < preferredPool.length ? preferredPool : pool, random);
    const anchor = bag.shift();
    if (!anchor) break;

    const id = `quick-${steps.length}-${anchor.id}`;
    const step = buildStep(method, anchor, pool, role, random, id);
    if (!step) {
      consecutiveMisses += 1;
      // The anchor was never asked about, so it goes back for the next exercise.
      bag.unshift(anchor);
      continue;
    }
    consecutiveMisses = 0;
    steps.push(step);
  }

  return steps;
}

function buildStep(
  method: PracticeMethod,
  anchor: NormalizedWord,
  pool: NormalizedWord[],
  role: LearningRole,
  random: () => number,
  id: string,
): PracticeStep | null {
  if (method === 'matching' || method === 'bubbles') {
    const config = buildGameRound(method, anchor, pool, random, id);
    return config ? { kind: 'game', id, config } : null;
  }
  const exercise = resolvePracticeExercise({ word: anchor, method, pool, role, random });
  return exercise ? { kind: 'exercise', id, word: anchor, exercise } : null;
}
