import { PREFILL_CHAR_RE } from '@/lib/answer-normalization';
import type { SimilarityBand } from '@/features/learning/minigames/similarity';
import type { NormalizedWord } from '@/lib/words';

export type { SimilarityBand };

/**
 * The three methods that count as a review: answering one of them moves the
 * word's spaced-repetition stage up or down.
 *
 * Matching is deliberately NOT here. One matching round tests 2–6 words at
 * once, so a single result cannot be attributed to one word; it stays a
 * practice-only interlude with its own frequency, outside this pool.
 */
export type MethodId = 'reveal' | 'choice' | 'typing' | 'assembly';

export const METHOD_IDS = ['reveal', 'choice', 'typing', 'assembly'] as const satisfies readonly MethodId[];

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
export type TypingVariant = '90:90' | '50:90' | '20:50' | '0:20' | '0:10' | '0:0';

export const TYPING_VARIANTS = [
  '90:90',
  '50:90',
  '20:50',
  '0:20',
  '0:10',
  '0:0',
] as const satisfies readonly TypingVariant[];

export function parseTypingVariant(variant: TypingVariant): {
  prefillPct: number;
  hintCapPct: number;
} {
  const [prefillPct, hintCapPct] = variant.split(':').map(Number);
  return {
    prefillPct: prefillPct ?? 0,
    hintCapPct: hintCapPct ?? 0,
  };
}

/**
 * How many of the answer's blank slots may be pre-filled.
 *
 * Two limits, both about leaving a real exercise behind. One slot always stays
 * empty, and the last *letter* always stays empty: revealing everything up to a
 * trailing `.` / `?` / `...` would leave punctuation as the whole challenge,
 * which is a keyboard drill, not a writing one. Punctuation inside a longer
 * blank (`word?` with `d?` still to type) is untouched by this.
 *
 * `slots` are the editable graphemes in reveal order — the ones the learner has
 * to type, spaces excluded, since a space is handed over for free.
 */
function maxRevealableSlots(slots: readonly string[]): number {
  const lastLetterIndex = slots.reduce(
    (last, slot, index) => (PREFILL_CHAR_RE.test(slot) ? last : index),
    -1,
  );
  const oneShortOfEverything = Math.max(0, slots.length - 1);
  // An answer made of nothing but punctuation has no letter to protect; it
  // falls back to the plain "leave one slot" rule.
  if (lastLetterIndex === -1) return oneShortOfEverything;
  return Math.min(oneShortOfEverything, lastLetterIndex);
}

/** Calculate the frozen scaffold for one answer, always leaving one slot to type. */
export function typingScaffold({
  prefillPct,
  hintCapPct,
  editableSlots,
}: {
  prefillPct: number;
  hintCapPct: number;
  /** Editable graphemes in reveal order, spaces excluded. */
  editableSlots: readonly string[];
}): { prefillCount: number; hintCap: number; hintBudget: number } {
  const editableCount = editableSlots.length;
  const maxReveal = maxRevealableSlots(editableSlots);
  const prefillCount = Math.min(Math.max(0, Math.floor(editableCount * prefillPct / 100)), maxReveal);
  const hintCap = hintCapPct > prefillPct
    ? Math.min(Math.max(1, Math.ceil(editableCount * hintCapPct / 100)), maxReveal)
    : prefillCount;
  return { prefillCount, hintCap, hintBudget: Math.max(0, hintCap - prefillCount) };
}

export type ChoiceOptionCount = 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Which language the options themselves are written in; the prompt is always
 * the other side.
 *
 * `'foreign'` is the harder, productive direction — the learner reads a word
 * they know and has to recognise its foreign form among lookalikes. `'known'`
 * is plain recognition: the foreign word is on screen and only its meaning has
 * to be picked out.
 */
export type ChoiceOptionsSide = 'foreign' | 'known';

export const CHOICE_OPTIONS_SIDES = [
  'foreign',
  'known',
] as const satisfies readonly ChoiceOptionsSide[];
export type MatchPairCount = 2 | 3 | 4 | 5 | 6;
export type AssemblyVariant = `${'letters' | 'words'}:${SimilarityBand}`;

export const CHOICE_OPTION_COUNTS = [2, 3, 4, 5, 6, 7, 8] as const;
export const MATCH_PAIR_COUNTS = [2, 3, 4, 5, 6] as const;
export const ASSEMBLY_VARIANTS = [
  'letters:I',
  'letters:II',
  'letters:III',
  'words:I',
  'words:II',
  'words:III',
] as const satisfies readonly AssemblyVariant[];

export function parseAssemblyVariant(variant: AssemblyVariant): {
  unit: 'letters' | 'words';
  band: SimilarityBand;
} {
  const [unit, band] = variant.split(':') as ['letters' | 'words', SimilarityBand];
  return { unit, band };
}

/** `'4:II:foreign'` — four foreign options, distractors that look fairly alike. */
export type ChoiceVariant = `${ChoiceOptionCount}:${SimilarityBand}:${ChoiceOptionsSide}`;
/** `'6:III'` — six pairs of near-twins. */
export type MatchVariant = `${MatchPairCount}:${SimilarityBand}`;

export function choiceVariant(
  options: ChoiceOptionCount,
  band: SimilarityBand,
  side: ChoiceOptionsSide,
): ChoiceVariant {
  return `${options}:${band}:${side}`;
}

export function matchVariant(pairs: MatchPairCount, band: SimilarityBand): MatchVariant {
  return `${pairs}:${band}`;
}

export function parseChoiceVariant(
  variant: ChoiceVariant,
): { options: ChoiceOptionCount; band: SimilarityBand; side: ChoiceOptionsSide } {
  const [count, band, side] = variant.split(':');
  return {
    options: Number(count) as ChoiceOptionCount,
    band: band as SimilarityBand,
    // Variants stored before the direction existed read as the default one, so
    // a stray legacy string can never render a card with no side at all.
    side: side === 'known' ? 'known' : 'foreign',
  };
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
  assembly: MethodConfig<AssemblyVariant>;
  /** No weight: matching sits outside the review pool, on its own frequency. */
  match: { variants: MatchVariant[] };
}

export interface FineTuneConfig {
  version: 5;
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
      /** Which language the options are written in. */
      optionsSide: ChoiceOptionsSide;
      distractors: NormalizedWord[];
    }
  | {
      method: 'assembly';
      variant: AssemblyVariant;
      effectiveBand: SimilarityBand;
      /** The answer-side units, in their required order. */
      answerParts: string[];
      /** Additional selectable units for the harder variant. */
      distractorParts: string[];
    };
