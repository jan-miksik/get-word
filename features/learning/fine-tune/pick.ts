import type { NormalizedWord } from '@/lib/words';
import { splitGraphemes } from '@/lib/answer-normalization';
import {
  knownSideForRole,
  learningSideForRole,
  type LearningRole,
  type WordSide,
} from '@/features/learning/state/learningRole';
import {
  bandAtLeast,
  similarityBandForTerms,
  type SimilarityBand,
} from '@/features/learning/minigames/similarity';
import {
  confusableLetters,
  lettersAreConfusable,
} from '@/features/learning/minigames/letter-families';
import { stageConfigAt } from './config';
import {
  MIN_IN_BAND_OPTIONS,
  MIN_IN_BAND_PAIRS,
  canBuildVariant,
  resolveVariantDistractors,
} from './distractors';
import {
  METHOD_IDS,
  parseChoiceVariant,
  parseAssemblyVariant,
  parseMatchVariant,
  type ChoiceOptionsSide,
  type ChoiceVariant,
  type AssemblyVariant,
  type FineTuneConfig,
  type MatchVariant,
  type MethodId,
  type ResolvedExercise,
  type RevealVariant,
  type StageConfig,
  type TypingVariant,
} from './types';

/** The gentlest exercise there is, and therefore the universal fallback. */
const FALLBACK_EXERCISE: ResolvedExercise = { method: 'reveal', variant: 'foreign' };

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Avalanche the seed before it reaches the generator. Our seeds are highly
 * correlated by construction — neighbouring word ids, review counts that differ
 * by one — and a bare Lehmer LCG leaks that structure straight into its first
 * output, which is the one that chooses the method. Mixing first is what makes
 * the weighted pick actually hit its configured shares.
 */
function mixSeed(raw: number): number {
  let mixed = Math.floor(raw) >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function createRng(rawSeed: number): () => number {
  const mod = 2147483647;
  const normalized = mixSeed(rawSeed) % mod;
  let state = normalized <= 0 ? normalized + (mod - 1) : normalized;
  return () => {
    state = (state * 16807) % mod;
    return (state - 1) / (mod - 1);
  };
}

/**
 * Seeded by the word plus how many times it has been reviewed, so a re-render
 * always lands on the same exercise while answering the card naturally reshuffles
 * it for next time.
 */
function exerciseSeed(wordId: string, reviewCount: number): number {
  return hashString(`${wordId}:${reviewCount}`);
}

function pickUniform<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

/**
 * Weighted pick over methods, NOT over variants. This is the whole point of the
 * two-step model: a stage that allows seven kinds of multiple choice and one
 * kind of reveal must still show reveal as often as its weight says, instead of
 * being drowned out seven to one.
 */
function pickWeightedMethod(
  candidates: MethodId[],
  stage: StageConfig,
  random: () => number,
): MethodId | null {
  if (candidates.length === 0) return null;
  const total = candidates.reduce((sum, id) => sum + Math.max(1, stage[id].weight), 0);
  let ticket = random() * total;
  for (const id of candidates) {
    ticket -= Math.max(1, stage[id].weight);
    if (ticket <= 0) return id;
  }
  return candidates[candidates.length - 1];
}

function feasibleChoiceVariants(
  variants: ChoiceVariant[],
  target: NormalizedWord,
  pool: NormalizedWord[],
): ChoiceVariant[] {
  return variants.filter((variant) => {
    const { options } = parseChoiceVariant(variant);
    return canBuildVariant({ target, pool, count: options - 1 });
  });
}

/** The side an exercise's options are written on, for this learner's role. */
function wordSideForOptions(side: ChoiceOptionsSide, role: LearningRole): WordSide {
  return side === 'foreign' ? learningSideForRole(role) : knownSideForRole(role);
}

function answerParts(value: string, unit: 'letters' | 'words'): string[] {
  if (unit === 'letters') {
    return splitGraphemes(value).filter((part) => /[\p{L}\p{N}]/u.test(part));
  }
  return value.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) ?? [];
}

function learningAnswerForRole(word: NormalizedWord, role: LearningRole): string {
  return role === 'knownLanguage' ? word.vi : word.cz;
}

function feasibleAssemblyVariants(
  variants: AssemblyVariant[],
  target: NormalizedWord,
  role: LearningRole,
): AssemblyVariant[] {
  const answer = learningAnswerForRole(target, role);
  return variants.filter((variant) => {
    const { unit } = parseAssemblyVariant(variant);
    const count = answerParts(answer, unit).length;
    return unit === 'letters' ? count >= 2 && !/\s/u.test(answer.trim()) : count >= 2;
  });
}

function fallbackExtraParts(answer: string, unit: 'letters' | 'words'): string[] {
  if (unit === 'words') return ['…', '?', '—', '+', '•', '×'];
  const used = new Set(answer.toLocaleLowerCase());
  return [...'abcdefghijklmnopqrstuvwxyz'].filter((letter) => !used.has(letter));
}

function uniqueParts(parts: string[], excluded: Set<string>): string[] {
  const seen = new Set(excluded);
  const output: string[] = [];
  for (const part of parts) {
    const key = part.toLocaleLowerCase();
    if (!part || seen.has(key)) continue;
    seen.add(key);
    output.push(part);
  }
  return output;
}

function takeRandom(parts: string[], count: number, random: () => number): string[] {
  const available = [...parts];
  const output: string[] = [];
  while (available.length > 0 && output.length < count) {
    output.push(available.splice(Math.floor(random() * available.length), 1)[0]);
  }
  return output;
}

function resolveAssemblyParts({
  target,
  pool,
  role,
  variant,
  random,
}: {
  target: NormalizedWord;
  pool: NormalizedWord[];
  role: LearningRole;
  variant: AssemblyVariant;
  random: () => number;
}): { answerParts: string[]; distractorParts: string[]; effectiveBand: SimilarityBand } {
  const { unit, band } = parseAssemblyVariant(variant);
  const correct = answerParts(learningAnswerForRole(target, role), unit);
  if (band === 'I') {
    return { answerParts: correct, distractorParts: [], effectiveBand: 'I' };
  }

  const correctKeys = new Set(correct.map((part) => part.toLocaleLowerCase()));
  const poolParts = pool
    .filter((word) => word.id !== target.id)
    .flatMap((word) => answerParts(learningAnswerForRole(word, role), unit))
    .filter((part) => !correctKeys.has(part.toLocaleLowerCase()));
  const generatedSimilar = unit === 'letters' ? confusableLetters(correct) : [];
  const candidates = uniqueParts(
    [...generatedSimilar, ...poolParts, ...fallbackExtraParts(correct.join(''), unit)],
    correctKeys,
  );
  const needed = Math.min(6, Math.max(3, Math.ceil(correct.length * 0.3)));
  const isSimilarEnough = (candidate: string, attempt: SimilarityBand): boolean =>
    correct.some((part) =>
      unit === 'letters'
        ? lettersAreConfusable(candidate, part)
        : bandAtLeast(similarityBandForTerms(candidate, part), attempt),
    );

  const resolveAt = (attempt: SimilarityBand): string[] | null => {
    if (attempt === 'I') return takeRandom(candidates, needed, random);
    const ratio = attempt === 'III' ? 0.8 : 0.2;
    const similarNeeded = Math.ceil(needed * ratio);
    const similar = candidates.filter((candidate) => isSimilarEnough(candidate, attempt));
    if (similar.length < similarNeeded) return null;
    const chosenSimilar = takeRandom(similar, similarNeeded, random);
    const chosenSet = new Set(chosenSimilar.map((part) => part.toLocaleLowerCase()));
    const remaining = candidates.filter((part) => !chosenSet.has(part.toLocaleLowerCase()));
    const dissimilar = remaining.filter((candidate) => !isSimilarEnough(candidate, attempt));
    const filler = takeRandom(dissimilar, needed - chosenSimilar.length, random);
    if (filler.length < needed - chosenSimilar.length) {
      const fillerSet = new Set(filler.map((part) => part.toLocaleLowerCase()));
      filler.push(...takeRandom(
        remaining.filter((part) => !fillerSet.has(part.toLocaleLowerCase())),
        needed - chosenSimilar.length - filler.length,
        random,
      ));
    }
    return [...chosenSimilar, ...filler];
  };

  const attempts: SimilarityBand[] = band === 'III' ? ['III', 'II', 'I'] : ['II', 'I'];
  for (const attempt of attempts) {
    const distractorParts = resolveAt(attempt);
    if (distractorParts && distractorParts.length > 0) {
      return { answerParts: correct, distractorParts, effectiveBand: attempt };
    }
  }

  return { answerParts: correct, distractorParts: [], effectiveBand: 'I' };
}

export interface PickExerciseInput {
  word: NormalizedWord;
  stageIndex: number;
  knownCount: number;
  unknownCount: number;
  config: FineTuneConfig;
  /** Every word available to draw distractors from, in list order. */
  distractorPool: NormalizedWord[];
  role: LearningRole;
}

/**
 * Choose the exercise for one word: first the method (by weight), then one of
 * its variants (uniformly). Variants that cannot be built for this particular
 * word drop out beforehand, and a method with nothing left to offer drops out
 * with them so the remaining weights simply share it out.
 */
export function pickExerciseForWord({
  word,
  stageIndex,
  knownCount,
  unknownCount,
  config,
  distractorPool,
  role,
}: PickExerciseInput): ResolvedExercise {
  // A word the learner has never got right has nothing to be quizzed on yet —
  // show them the answer whatever the stage is configured to do.
  if (knownCount <= 0) return FALLBACK_EXERCISE;

  const stage = stageConfigAt(config, stageIndex);
  const random = createRng(exerciseSeed(word.id, knownCount + unknownCount));

  const usableChoice = feasibleChoiceVariants(stage.choice.variants, word, distractorPool);
  const usableAssembly = feasibleAssemblyVariants(stage.assembly.variants, word, role);
  const candidates = METHOD_IDS.filter((id) => {
    if (id === 'choice') return usableChoice.length > 0;
    if (id === 'assembly') return usableAssembly.length > 0;
    return stage[id].variants.length > 0;
  });

  const method = pickWeightedMethod(candidates, stage, random);
  if (!method) return FALLBACK_EXERCISE;

  if (method === 'reveal') {
    return { method: 'reveal', variant: pickUniform(stage.reveal.variants, random) as RevealVariant };
  }

  if (method === 'typing') {
    return { method: 'typing', variant: pickUniform(stage.typing.variants, random) as TypingVariant };
  }

  if (method === 'assembly') {
    const variant = pickUniform(usableAssembly, random);
    return {
      method: 'assembly',
      variant,
      ...resolveAssemblyParts({ target: word, pool: distractorPool, role, variant, random }),
    };
  }

  const variant = pickUniform(usableChoice, random);
  const { options, band, side } = parseChoiceVariant(variant);
  const resolved = resolveVariantDistractors({
    target: word,
    pool: distractorPool,
    count: options - 1,
    band,
    minInBand: MIN_IN_BAND_OPTIONS,
    random,
    // Difficulty is about the words the learner has to tell apart, so it is
    // measured on the side the options are actually written in.
    side: wordSideForOptions(side, role),
    // Only the hardest band. Below it the exercise is asking the learner to tell
    // words apart, and real vocabulary does that job; band III is asking them to
    // read one word precisely, which is what a one-diacritic near-miss tests and
    // what no list reliably supplies on its own.
    allowInvented: band === 'III',
  });

  if (!resolved) return FALLBACK_EXERCISE;

  return {
    method: 'choice',
    variant,
    requestedBand: resolved.requestedBand,
    effectiveBand: resolved.effectiveBand,
    optionsSide: side,
    distractors: resolved.distractors,
  };
}

function matchVariantsForStage(
  config: FineTuneConfig,
  stageIndex: number,
): MatchVariant[] {
  return stageConfigAt(config, stageIndex).match.variants;
}

export interface ResolvedMatchRound {
  variant: MatchVariant;
  requestedBand: SimilarityBand;
  effectiveBand: SimilarityBand;
  words: NormalizedWord[];
}

/**
 * Matching lives outside the review pool — it never moves a word's stage —
 * so it is picked separately, keyed off the stage of the word it is anchored to.
 * Returns `null` when that stage allows no matching at all, which is how the
 * long intervals opt out of it in the balanced preset.
 */
export function pickMatchRound({
  anchor,
  stageIndex,
  config,
  pool,
  seed,
}: {
  anchor: NormalizedWord;
  stageIndex: number;
  config: FineTuneConfig;
  pool: NormalizedWord[];
  seed: number;
}): ResolvedMatchRound | null {
  const variants = matchVariantsForStage(config, stageIndex);
  if (variants.length === 0) return null;

  const random = createRng(seed);
  const usable = variants.filter((variant) => {
    const { pairs } = parseMatchVariant(variant);
    return canBuildVariant({ target: anchor, pool, count: pairs - 1 });
  });
  if (usable.length === 0) return null;

  const variant = pickUniform(usable, random);
  const { pairs, band } = parseMatchVariant(variant);
  const resolved = resolveVariantDistractors({
    target: anchor,
    pool,
    count: pairs - 1,
    band,
    minInBand: MIN_IN_BAND_PAIRS,
    random,
  });
  if (!resolved) return null;

  return {
    variant,
    requestedBand: resolved.requestedBand,
    effectiveBand: resolved.effectiveBand,
    words: [anchor, ...resolved.distractors],
  };
}
