import type { SimilarityBand } from '@/features/learning/minigames/similarity';
import type { NormalizedWord } from '@/lib/words';

export type { SimilarityBand };

/**
 * The three methods that count as a review: answering one of them moves the
 * word's spaced-repetition stage up or down.
 *
 * Matching is deliberately NOT here. One matching round tests 4–8 words at
 * once, so a single result cannot be attributed to one word; it stays a
 * practice-only interlude with its own frequency, outside this pool.
 */
export type MethodId = 'reveal' | 'choice' | 'typing';

export const METHOD_IDS = ['reveal', 'choice', 'typing'] as const satisfies readonly MethodId[];

/** Which side the learner sees first. */
export type RevealVariant = 'foreign' | 'known';

export const REVEAL_VARIANTS = ['foreign', 'known'] as const satisfies readonly RevealVariant[];

/**
 * Typing is always known → foreign: practising how to spell your own language
 * is not what people come here for. The ladder is how much scaffolding is left.
 *
 * Modelled as a flat enum rather than `{ firstLetter, hint }` on purpose — the
 * struct would admit a fourth, meaningless combination (first letter shown but
 * no hint button), which every validator would then have to reject. The enum
 * makes that state unrepresentable, and the config travels through synced JSON
 * where a one-line schema is worth a lot.
 */
export type TypingVariant = 'firstLetterWithHint' | 'hint' | 'bare';

export const TYPING_VARIANTS = [
  'firstLetterWithHint',
  'hint',
  'bare',
] as const satisfies readonly TypingVariant[];

/** How the enum maps onto the two mechanisms the typing card actually has. */
export function typingVariantMechanics(variant: TypingVariant): {
  prefillFirstLetter: boolean;
  hintEnabled: boolean;
} {
  return {
    prefillFirstLetter: variant === 'firstLetterWithHint',
    hintEnabled: variant !== 'bare',
  };
}

export type ChoiceOptionCount = 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type MatchPairCount = 4 | 6 | 8;

export const CHOICE_OPTION_COUNTS = [2, 3, 4, 5, 6, 7, 8] as const;
export const MATCH_PAIR_COUNTS = [4, 6, 8] as const;

/** `'4:II'` — four options, distractors that look fairly alike. */
export type ChoiceVariant = `${ChoiceOptionCount}:${SimilarityBand}`;
/** `'6:III'` — six pairs of near-twins. */
export type MatchVariant = `${MatchPairCount}:${SimilarityBand}`;

export function choiceVariant(
  options: ChoiceOptionCount,
  band: SimilarityBand,
): ChoiceVariant {
  return `${options}:${band}`;
}

export function matchVariant(pairs: MatchPairCount, band: SimilarityBand): MatchVariant {
  return `${pairs}:${band}`;
}

export function parseChoiceVariant(
  variant: ChoiceVariant,
): { options: ChoiceOptionCount; band: SimilarityBand } {
  const [count, band] = variant.split(':');
  return { options: Number(count) as ChoiceOptionCount, band: band as SimilarityBand };
}

export function parseMatchVariant(
  variant: MatchVariant,
): { pairs: MatchPairCount; band: SimilarityBand } {
  const [count, band] = variant.split(':');
  return { pairs: Number(count) as MatchPairCount, band: band as SimilarityBand };
}

/**
 * A method is active on a stage exactly when it has at least one variant.
 * Weights are only meaningful between active methods and are normalised at
 * pick time, so they never have to add up to anything in particular.
 */
export interface MethodConfig<V extends string> {
  weight: number;
  variants: V[];
}

export interface StageConfig {
  reveal: MethodConfig<RevealVariant>;
  choice: MethodConfig<ChoiceVariant>;
  typing: MethodConfig<TypingVariant>;
  /** No weight: matching sits outside the review pool, on its own frequency. */
  match: { variants: MatchVariant[] };
}

export interface FineTuneConfig {
  version: 1;
  /** Exactly 8 entries, indexed by `STAGES[i].id`. */
  stages: StageConfig[];
}

export const MIN_WEIGHT = 1;
export const MAX_WEIGHT = 4;

/** The exercise the picker settled on for one word, ready to render. */
export type ResolvedExercise =
  | { method: 'reveal'; variant: RevealVariant }
  | { method: 'typing'; variant: TypingVariant }
  | {
      method: 'choice';
      variant: ChoiceVariant;
      requestedBand: SimilarityBand;
      /** May be lower than requested when the list ran out of similar words. */
      effectiveBand: SimilarityBand;
      distractors: NormalizedWord[];
    };
