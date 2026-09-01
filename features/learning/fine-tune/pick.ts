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
import {
  inventLookalikeForms,
  scriptAlphabet,
  surfaceKey,
} from '@/features/learning/minigames/invented-forms';
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

/** Bent forms to build per answer part, which is more than any round needs. */
const LOOKALIKES_PER_PART = 4;

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
 * Try every configured variant, beginning at a seeded random offset.
 *
 * A variant can be structurally possible (enough options, enough answer parts)
 * and still fail its requested similarity band. Rotating the list preserves the
 * random choice between usable variants without letting one impossible variant
 * hide another one that the word can genuinely support.
 */
function pickFirstResolved<V, R>(
  variants: readonly V[],
  random: () => number,
  resolve: (variant: V) => R | null,
): R | null {
  if (variants.length === 0) return null;
  const start = Math.min(variants.length - 1, Math.floor(random() * variants.length));
  for (let offset = 0; offset < variants.length; offset += 1) {
    const resolved = resolve(variants[(start + offset) % variants.length]);
    if (resolved) return resolved;
  }
  return null;
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

/**
 * Decoy tiles built out of the answer itself, rather than borrowed from the list.
 *
 * The list is a poor source of near-misses. A three-word phrase needs three
 * tiles that could plausibly belong to it, and no real vocabulary list reliably
 * contains words that close to an arbitrary answer — so a round asking for hard
 * decoys used to degrade to whatever the list happened to hold, which is how a
 * "similar" round ended up offering unrelated words and punctuation.
 *
 * Bending the answer's own parts by one diacritic gives a guaranteed near-miss
 * for every answer there is: the same trick the hardest choice rounds use (see
 * `inventLookalikeForms`), applied one part at a time.
 */
function generateConfusableParts({
  target,
  pool,
  role,
  unit,
  correct,
  random,
}: {
  target: NormalizedWord;
  pool: NormalizedWord[];
  role: LearningRole;
  unit: 'letters' | 'words';
  correct: string[];
  random: () => number;
}): string[] {
  // Only letters the learner's own list actually uses. Without this the letter
  // families hand a Czech round its decoys in Vietnamese tone marks, which read
  // as a rendering fault rather than as a letter worth telling apart — and now
  // that every extra tile is drawn from here, they would be the whole board.
  const alphabet = scriptAlphabet(pool.map((word) => learningAnswerForRole(word, role)));

  if (unit === 'letters') {
    const generated = confusableLetters(correct);
    const inScript = generated.filter((letter) => alphabet.has(letter));
    // Ordered, not filtered: a list too small to have shown a given accent yet
    // still needs enough decoys to build a round at all.
    return [...inScript, ...generated.filter((letter) => !alphabet.has(letter))];
  }

  const taken = new Set<string>();
  for (const word of [target, ...pool]) {
    const answer = learningAnswerForRole(word, role);
    taken.add(surfaceKey(answer));
    for (const part of answerParts(answer, 'words')) taken.add(surfaceKey(part));
  }

  return correct.flatMap((part) => inventLookalikeForms({
    term: part,
    alphabet,
    isTaken: (candidate) => taken.has(surfaceKey(candidate)),
    limit: LOOKALIKES_PER_PART,
    random,
  }));
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
  const generatedSimilar = generateConfusableParts({ target, pool, role, unit, correct, random });
  const candidates = uniqueParts(
    [...generatedSimilar, ...poolParts, ...fallbackExtraParts(correct.join(''), unit)],
    correctKeys,
  );
  // Band III offers more to sift through as well as harder decoys.
  //
  // Band II used to share III's count (3-6 extra tiles), which made the ladder
  // lopsided: I hands over nothing but the answer's own parts, so II jumped
  // straight from "nothing to sift" to a board where over a third of the tiles
  // are near-misses — the steepest step of the three, and the one that arrives
  // earliest. It now adds a smaller handful, two to four, so the climb is
  // spread across both steps. Every one of them is still a near-miss (see
  // below), which is what keeps II harder than I rather than merely longer.
  const base = Math.min(6, Math.max(3, Math.ceil(correct.length * 0.3)));
  const needed =
    band === 'III'
      ? Math.min(8, base + 2)
      : Math.min(4, Math.max(2, Math.ceil(correct.length * 0.2)));
  const isSimilarEnough = (candidate: string, attempt: SimilarityBand): boolean =>
    correct.some((part) =>
      unit === 'letters'
        ? lettersAreConfusable(candidate, part)
        : bandAtLeast(similarityBandForTerms(candidate, part), attempt),
    );

  // Above band I every extra tile has to be a near-miss. A round that mixed one
  // confusable letter into two unrelated ones was solvable without reading it:
  // the odd one out *was* the answer's letter, and the rest could be ignored on
  // sight. What makes an assembly round hard is that nothing on the board can
  // be dismissed without looking at it properly.
  const resolveAt = (attempt: SimilarityBand): string[] | null => {
    if (attempt === 'I') return takeRandom(candidates, needed, random);
    const similar = candidates.filter((candidate) => isSimilarEnough(candidate, attempt));
    if (similar.length < needed) return null;
    return takeRandom(similar, needed, random);
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

  let remaining = candidates;
  while (remaining.length > 0) {
    const method = pickWeightedMethod(remaining, stage, random);
    if (!method) break;

    if (method === 'reveal') {
      return { method: 'reveal', variant: pickUniform(stage.reveal.variants, random) as RevealVariant };
    }

    if (method === 'typing') {
      return { method: 'typing', variant: pickUniform(stage.typing.variants, random) as TypingVariant };
    }

    const resolved = method === 'assembly'
      ? pickFirstResolved(usableAssembly, random, (variant) =>
          buildAssemblyExercise({
            word,
            variant,
            pool: distractorPool,
            role,
            random,
          }))
      : pickFirstResolved(usableChoice, random, (variant) =>
          buildChoiceExercise({
            word,
            variant,
            pool: distractorPool,
            role,
            random,
          }));
    if (resolved) return resolved;

    // This method had the right shape but could not meet its configured
    // difficulty. Let the remaining methods inherit its weight instead of
    // rendering an easier card than the learner's ladder permits.
    remaining = remaining.filter((candidate) => candidate !== method);
  }

  return FALLBACK_EXERCISE;
}

function buildAssemblyExercise({
  word,
  variant,
  pool,
  role,
  random,
}: {
  word: NormalizedWord;
  variant: AssemblyVariant;
  pool: NormalizedWord[];
  role: LearningRole;
  random: () => number;
}): Extract<ResolvedExercise, { method: 'assembly' }> | null {
  const resolved = resolveAssemblyParts({ target: word, pool, role, variant, random });
  const requestedBand = parseAssemblyVariant(variant).band;
  if (!bandAtLeast(resolved.effectiveBand, requestedBand)) return null;
  return { method: 'assembly', variant, ...resolved };
}

function buildChoiceExercise({
  word,
  variant,
  pool,
  role,
  random,
}: {
  word: NormalizedWord;
  variant: ChoiceVariant;
  pool: NormalizedWord[];
  role: LearningRole;
  random: () => number;
}): ResolvedExercise | null {
  const { options, band, side } = parseChoiceVariant(variant);
  const resolved = resolveVariantDistractors({
    target: word,
    pool,
    count: options - 1,
    band,
    minInBand: MIN_IN_BAND_OPTIONS,
    random,
    // Difficulty is about the words the learner has to tell apart, so it is
    // measured on the side the options are actually written in.
    side: wordSideForOptions(side, role),
    // A configured band is a floor. When the real vocabulary cannot supply
    // enough similar options, safe invented near-twins keep II/III honest.
    allowInvented: band !== 'I',
  });

  if (!resolved) return null;
  if (!bandAtLeast(resolved.effectiveBand, band)) return null;

  return {
    method: 'choice',
    variant,
    requestedBand: resolved.requestedBand,
    effectiveBand: resolved.effectiveBand,
    optionsSide: side,
    distractors: resolved.distractors,
  };
}

/**
 * The variants a practice block asks for, one set per method.
 *
 * Practice ignores the ladder on purpose. The ladder's job is to decide that a
 * 30-day word is only ever typed; a practice block's job is the opposite — every
 * exercise the app has, inside ten cards, whatever stage its words happen to sit
 * at. These sit around the middle rungs: real work, but nothing brutal for a
 * block taken on after the day was already earned.
 */
const PRACTICE_REVEAL_VARIANTS: RevealVariant[] = ['foreign', 'known'];
const PRACTICE_CHOICE_VARIANTS: ChoiceVariant[] = ['3:II:foreign', '4:II:foreign', '5:II:foreign'];
const PRACTICE_TYPING_VARIANT: TypingVariant = '50:90';
const PRACTICE_ASSEMBLY_VARIANTS: AssemblyVariant[] = ['words:II', 'letters:II'];

/**
 * Build one exercise of a named method, or null when this word cannot support
 * it — a short answer has nothing to assemble, a thin pool has nothing to
 * choose between. A caller that gets null moves on to the next method rather
 * than dropping the card, which is why this never falls back to reveal the way
 * the stage picker does.
 */
export function resolvePracticeExercise({
  word,
  method,
  pool,
  role,
  random,
}: {
  word: NormalizedWord;
  method: MethodId;
  pool: NormalizedWord[];
  role: LearningRole;
  random: () => number;
}): ResolvedExercise | null {
  if (method === 'reveal') {
    return { method: 'reveal', variant: pickUniform(PRACTICE_REVEAL_VARIANTS, random) };
  }

  if (method === 'typing') {
    return { method: 'typing', variant: PRACTICE_TYPING_VARIANT };
  }

  if (method === 'assembly') {
    const usable = feasibleAssemblyVariants(PRACTICE_ASSEMBLY_VARIANTS, word, role);
    if (usable.length === 0) return null;
    return pickFirstResolved(usable, random, (variant) =>
      buildAssemblyExercise({ word, variant, pool, role, random }));
  }

  const usable = feasibleChoiceVariants(PRACTICE_CHOICE_VARIANTS, word, pool);
  if (usable.length === 0) return null;
  return pickFirstResolved(usable, random, (variant) =>
    buildChoiceExercise({ word, variant, pool, role, random }));
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

  return pickFirstResolved(usable, random, (variant) => {
    const { pairs, band } = parseMatchVariant(variant);
    const resolved = resolveVariantDistractors({
      target: anchor,
      pool,
      count: pairs - 1,
      band,
      minInBand: MIN_IN_BAND_PAIRS,
      random,
    });
    if (!resolved || !bandAtLeast(resolved.effectiveBand, band)) return null;

    return {
      variant,
      requestedBand: resolved.requestedBand,
      effectiveBand: resolved.effectiveBand,
      words: [anchor, ...resolved.distractors],
    };
  });
}
