import type { NormalizedWord } from '@/lib/words';
import type { GameType, MiniGameConfig } from '@/features/learning/minigames';
import { resolveVariantDistractors } from '@/features/learning/fine-tune/distractors';

/**
 * The short practice offered right after a batch of words is saved.
 *
 * Deliberately NOT a study session: nothing here writes progress, picks a
 * spaced-repetition stage or consults the fine-tune ladder. It builds a handful
 * of rounds out of the words that just landed and hands them to the same
 * `MiniGameCard` the study stream uses, so there is no second implementation of
 * any exercise — only a second reason to play one.
 */
export type QuickPracticeMethodId = 'choice' | 'matching' | 'bubbles';

const QUICK_PRACTICE_METHODS = ['choice', 'matching', 'bubbles'] as const satisfies
  readonly QuickPracticeMethodId[];

const GAME_TYPE: Record<QuickPracticeMethodId, GameType> = {
  choice: 'multipleChoice',
  matching: 'matching',
  bubbles: 'bubbleChoice',
};

/** How many rounds one run is, at most. Short enough to stay a detour. */
export const QUICK_PRACTICE_ROUNDS = 4;

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
 * Deterministic within a run, different between runs. A learner who practises
 * the same batch twice should not get the same four questions in the same
 * order, but a re-render must not reshuffle the round they are answering.
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

export interface QuickPracticeInput {
  /**
   * The words the practice is about — the ones that just landed. Every round is
   * anchored to one of these, so a learner never gets asked about something
   * they did not just add.
   */
  fresh: NormalizedWord[];
  /**
   * Wider pool the distractors may also be drawn from, typically the rest of
   * the learner's list. A batch of three words cannot supply a convincing
   * eight-bubble field on its own.
   */
  pool?: NormalizedWord[];
  seed: number;
}

/**
 * Build the rounds for one method, or an empty list when the words on hand
 * cannot support even one. Callers use the emptiness as the availability test —
 * a method that cannot be played is never offered.
 */
export function buildQuickPracticeRounds(
  method: QuickPracticeMethodId,
  { fresh, pool = [], seed }: QuickPracticeInput,
): MiniGameConfig[] {
  const seen = new Set<string>();
  const anchors = fresh.filter((word) => {
    if (seen.has(word.id) || !word.cz?.trim() || !word.vi?.trim()) return false;
    seen.add(word.id);
    return true;
  });
  if (anchors.length === 0) return [];

  const full = [...anchors];
  for (const word of pool) {
    if (seen.has(word.id) || !word.cz?.trim() || !word.vi?.trim()) continue;
    seen.add(word.id);
    full.push(word);
  }

  const random = createRng(seed);
  const gameType = GAME_TYPE[method];

  if (method === 'matching') {
    // One round covers several words at once, so the batch is walked in chunks
    // rather than one round per word.
    const rounds: MiniGameConfig[] = [];
    const queue = shuffled(anchors, random);
    while (queue.length > 0 && rounds.length < QUICK_PRACTICE_ROUNDS) {
      const anchor = queue.shift();
      if (!anchor) break;
      const wanted = Math.min(MATCHING_PAIRS, full.length) - 1;
      const resolved = resolveVariantDistractors({
        target: anchor,
        pool: full,
        count: Math.max(MATCHING_MIN_PAIRS - 1, wanted),
        band: 'I',
        minInBand: () => 0,
        random,
      });
      if (!resolved) break;
      const words = [anchor, ...resolved.distractors];
      // Anything this round already covers does not need a round of its own.
      const covered = new Set(words.map((word) => word.id));
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (covered.has(queue[i].id)) queue.splice(i, 1);
      }
      rounds.push({
        _isMinigame: true,
        id: `quick-${method}-${anchor.id}-${rounds.length}`,
        gameType,
        level: 1,
        words,
      });
    }
    return rounds;
  }

  const wantedDistractors =
    method === 'bubbles' ? BUBBLE_DISTRACTORS : CHOICE_OPTIONS - 1;
  const minDistractors =
    method === 'bubbles' ? BUBBLE_MIN_DISTRACTORS : CHOICE_MIN_OPTIONS - 1;

  const rounds: MiniGameConfig[] = [];
  for (const anchor of shuffled(anchors, random).slice(0, QUICK_PRACTICE_ROUNDS)) {
    const count = Math.max(minDistractors, Math.min(wantedDistractors, full.length - 1));
    const resolved = resolveVariantDistractors({
      target: anchor,
      pool: full,
      count,
      band: 'I',
      minInBand: () => 0,
      random,
    });
    if (!resolved) continue;
    rounds.push({
      _isMinigame: true,
      id: `quick-${method}-${anchor.id}-${rounds.length}`,
      gameType,
      level: 1,
      words: [anchor, ...resolved.distractors],
    });
  }
  return rounds;
}

/** Which of the three methods these words can actually support. */
export function availableQuickPracticeMethods(
  input: QuickPracticeInput,
): QuickPracticeMethodId[] {
  return QUICK_PRACTICE_METHODS.filter(
    (method) => buildQuickPracticeRounds(method, input).length > 0,
  );
}
