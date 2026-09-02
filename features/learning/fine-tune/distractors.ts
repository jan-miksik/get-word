import type { NormalizedWord } from '@/lib/words';
import {
  bandAtLeast,
  similarityBand,
  similarityBandOnSide,
  type SimilarityBand,
} from '@/features/learning/minigames/similarity';
import type { WordSide } from '@/features/learning/state/learningRole';
import {
  acceptedOnSide,
  hasDistinctVisibleAnswers,
  sharesLearningScope,
  termOnSide,
} from '@/features/learning/minigames/word-pool';
import {
  inventLookalikeForms,
  scriptAlphabet,
  surfaceKey,
} from '@/features/learning/minigames/invented-forms';

/**
 * Order in which a requested difficulty gives way when the list simply does not
 * contain enough confusable words. We drop the *similarity*, never the option
 * count: a six-option question built from mildly similar words is still a
 * six-option question, whereas silently shrinking it to four would change the
 * exercise the learner asked for.
 */
const BAND_DEGRADATION_ORDER: readonly SimilarityBand[] = ['III', 'II', 'I'];

/**
 * How many distractors must genuinely sit in the requested band before the
 * variant counts as having that difficulty. Demanding seven near-twins for an
 * eight-option question would be unsatisfiable in any real list; two are enough
 * to make the learner read carefully, and the rest add plausible noise.
 *
 * Tunable on purpose — worth revisiting once we can see how often real lists
 * degrade in practice.
 */
export const MIN_IN_BAND_OPTIONS = (optionCount: number): number =>
  Math.min(2, Math.max(0, optionCount - 1));

/**
 * How many of an exercise's distractors may be invented lookalikes of the answer
 * rather than real words from the list.
 *
 * Invented forms are the reliable way to honour a configured similarity floor:
 * a real near-twin of any given word rarely exists in a real list. They are a
 * fallback and not a first choice — the round is filled with real vocabulary in
 * the band first, and only the slots that stay empty are invented into. Two is
 * the cap even on larger rounds; a two-distractor round may therefore consist
 * entirely of invented near-misses when no real twin exists.
 */
const MAX_INVENTED_OPTIONS = (distractorCount: number): number =>
  Math.max(0, Math.min(2, distractorCount));

/** Same idea for matching, counted over the words that form the round. */
export const MIN_IN_BAND_PAIRS = (pairCount: number): number =>
  Math.min(2, Math.max(0, Math.floor(pairCount / 2)));

/**
 * Upper bound on how many candidates we score per card. Band III needs a wide
 * net — near-twins are rare — but the work must stay bounded on long lists, so
 * we scan a generous slice centred on the word's own position.
 */
const DISTRACTOR_SCAN_LIMIT = 400;

export interface ResolvedDistractors {
  distractors: NormalizedWord[];
  requestedBand: SimilarityBand;
  /** Lower than requested when the list ran out of similar-enough words. */
  effectiveBand: SimilarityBand;
  /** How many of them are invented lookalikes rather than words from the list. */
  inventedCount: number;
}

interface ScoredCandidate {
  word: NormalizedWord;
  band: SimilarityBand;
  /** Words from the same lesson make better company than random ones. */
  inScope: boolean;
  /** Bent out of the answer itself rather than drawn from the list. */
  invented?: boolean;
}

function scanSlice(pool: NormalizedWord[], targetId: string): NormalizedWord[] {
  if (pool.length <= DISTRACTOR_SCAN_LIMIT) return pool;
  const index = pool.findIndex((word) => word.id === targetId);
  const centre = index >= 0 ? index : 0;
  const half = Math.floor(DISTRACTOR_SCAN_LIMIT / 2);
  const start = Math.max(0, Math.min(pool.length - DISTRACTOR_SCAN_LIMIT, centre - half));
  return pool.slice(start, start + DISTRACTOR_SCAN_LIMIT);
}

/**
 * `side` names the language the options will be written in. Passing it scores
 * candidates on that side alone; leaving it out keeps the pair-wide reading,
 * which is what direction-agnostic rounds (matching, bubbles) want.
 */
function scoreCandidates(
  target: NormalizedWord,
  pool: NormalizedWord[],
  side?: WordSide,
): ScoredCandidate[] {
  const seen = new Set<string>([target.id]);
  const scored: ScoredCandidate[] = [];

  for (const word of scanSlice(pool, target.id)) {
    if (seen.has(word.id)) continue;
    seen.add(word.id);
    if (!hasDistinctVisibleAnswers(target, word)) continue;
    scored.push({
      word,
      band: side ? similarityBandOnSide(target, word, side) : similarityBand(target, word),
      inScope: sharesLearningScope(target, word),
    });
  }

  return scored;
}

/**
 * An invented form wearing just enough of a word to be rendered as an option.
 *
 * The bent text sits on *both* sides on purpose. Only the option side is ever
 * drawn, but leaving the target's real text on the other side would mean a
 * round that read the opposite direction printed the correct answer twice.
 * Everything tied to a real entry — audio, pronunciation, hints, the spellings
 * that count as correct — is dropped rather than inherited.
 */
function inventedWord(
  target: NormalizedWord,
  form: string,
  index: number,
): NormalizedWord {
  return {
    ...target,
    id: `invented:${target.id}:${index}:${surfaceKey(form)}`,
    cz: form,
    vi: form,
    en: '',
    czPron: undefined,
    viPron: undefined,
    czAudio: undefined,
    viAudio: undefined,
    czHint: undefined,
    viHint: undefined,
    acceptedKnown: undefined,
    acceptedTarget: undefined,
    canonicalWordId: null,
    comment: null,
  };
}

/**
 * Lookalikes of the answer, ready to compete with the real candidates.
 *
 * Nothing the learner could defend as a correct answer is allowed through: every
 * spelling anywhere in their lists, on this side, is off limits — both the words
 * themselves and the alternative spellings each one accepts.
 */
function buildInventedCandidates({
  target,
  pool,
  side,
  band,
  limit,
  random,
}: {
  target: NormalizedWord;
  pool: NormalizedWord[];
  side: WordSide;
  /** Decides the kind of edit: a swapped letter for II, an accent for III. */
  band: SimilarityBand;
  limit: number;
  random: () => number;
}): ScoredCandidate[] {
  if (limit <= 0) return [];

  const taken = new Set<string>();
  for (const word of pool) {
    taken.add(surfaceKey(termOnSide(word, side)));
    for (const accepted of acceptedOnSide(word, side)) taken.add(surfaceKey(accepted));
  }

  const forms = inventLookalikeForms({
    term: termOnSide(target, side),
    alphabet: scriptAlphabet(scanSlice(pool, target.id).map((word) => termOnSide(word, side))),
    isTaken: (candidate) => taken.has(surfaceKey(candidate)),
    limit,
    random,
    band,
  });

  return forms.map((form, index) => ({
    word: inventedWord(target, form, index),
    // The generator guarantees one small written edit, the definition of III.
    band: 'III' as SimilarityBand,
    inScope: true,
    invented: true,
  }));
}

const BAND_RANK: Record<SimilarityBand, number> = { I: 0, II: 1, III: 2 };

function takeDeterministic<T>(items: T[], count: number, random: () => number): T[] {
  if (items.length <= count) return [...items];
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(Math.min(index, pool.length - 1), 1)[0]);
  }
  return picked;
}

/**
 * Build the distractor set for one exercise, stepping the difficulty down only
 * as far as the available vocabulary forces.
 *
 * Returns `null` only when the list does not hold `count` usable words at all —
 * band I accepts any other word, so failure means there is nothing to ask with,
 * not that the words were too dissimilar.
 */
export function resolveVariantDistractors({
  target,
  pool,
  count,
  band,
  minInBand,
  random,
  side,
  allowInvented = false,
}: {
  target: NormalizedWord;
  pool: NormalizedWord[];
  count: number;
  band: SimilarityBand;
  minInBand: (count: number) => number;
  random: () => number;
  /** The side the options are shown on, when the exercise fixes one. */
  side?: WordSide;
  /**
   * Let band II/III be filled with invented lookalikes of the answer when the
   * list cannot supply real near-twins. Needs `side`: a bent word only exists in
   * the one language the options are written in, so an exercise that has not
   * fixed a direction — matching, bubbles — can never use them.
   */
  allowInvented?: boolean;
}): ResolvedDistractors | null {
  if (count <= 0) {
    return { distractors: [], requestedBand: band, effectiveBand: band, inventedCount: 0 };
  }

  const candidates = scoreCandidates(target, pool, side);
  if (candidates.length < count) return null;

  const inventedByBand = new Map<SimilarityBand, ScoredCandidate[]>();
  const inventedFor = (attempt: SimilarityBand): ScoredCandidate[] => {
    if (!allowInvented || !side || attempt === 'I') return [];
    const cached = inventedByBand.get(attempt);
    if (cached) return cached;
    const built = buildInventedCandidates({
      target,
      pool,
      side,
      band: attempt,
      limit: MAX_INVENTED_OPTIONS(count),
      random,
    });
    inventedByBand.set(attempt, built);
    return built;
  };

  const required = minInBand(count + 1);
  const startAt = BAND_DEGRADATION_ORDER.indexOf(band);

  for (let step = startAt < 0 ? 0 : startAt; step < BAND_DEGRADATION_ORDER.length; step += 1) {
    const attempt = BAND_DEGRADATION_ORDER[step];
    // A near-twin also satisfies band II. It is preferable to invent a safe
    // harder option than to silently render a round below its configured floor.
    const usableInvented = inventedFor(attempt);
    // Band I asks for words that are plainly *different*, so it is the one band
    // read as an exact match rather than a floor: taking whatever the list holds
    // would let an easy round hand out near-twins by accident. It stays a
    // fallback rather than a filter, because "any other word" must never be the
    // reason a round cannot be built at all.
    const inBand =
      attempt === 'I'
        ? preferDistinct(candidates, count)
        : candidates.filter((candidate) => bandAtLeast(candidate.band, attempt));
    if (inBand.length + usableInvented.length < Math.min(required, count)) continue;

    // Real vocabulary first: an invented form is a fabricated word, worth
    // showing only for the slots the list itself cannot fill in this band.
    const chosenReal = takeDeterministic(
      preferInScope(inBand),
      Math.min(count, inBand.length),
      random,
    );
    // Already in random order from the generator, and already capped by
    // MAX_INVENTED_OPTIONS when it was built.
    const chosenInvented = usableInvented.slice(0, Math.max(0, count - chosenReal.length));
    const chosen = [...chosenReal, ...chosenInvented];
    const chosenIds = new Set(chosen.map((candidate) => candidate.word.id));

    // Fill the remaining slots with the next-best words available: they keep the
    // option count intact without pretending to be part of the harder band. For
    // band I "next-best" runs the other way — the least similar word left.
    const filler = candidates
      .filter((candidate) => !chosenIds.has(candidate.word.id))
      .sort((a, b) => {
        const byBand =
          attempt === 'I'
            ? BAND_RANK[a.band] - BAND_RANK[b.band]
            : BAND_RANK[b.band] - BAND_RANK[a.band];
        if (byBand !== 0) return byBand;
        return Number(b.inScope) - Number(a.inScope);
      });

    const distractors = [...chosen, ...filler.slice(0, count - chosen.length)];
    if (distractors.length < count) continue;

    return {
      distractors: distractors.map((candidate) => candidate.word),
      requestedBand: band,
      effectiveBand: attempt,
      inventedCount: distractors.filter((candidate) => candidate.invented).length,
    };
  }

  return null;
}

function preferInScope(candidates: ScoredCandidate[]): ScoredCandidate[] {
  return [...candidates].sort((left, right) => Number(right.inScope) - Number(left.inScope));
}

/** The plainly different words, as long as there are enough to fill the round. */
function preferDistinct(candidates: ScoredCandidate[], count: number): ScoredCandidate[] {
  const distinct = candidates.filter((candidate) => candidate.band === 'I');
  return distinct.length >= count ? distinct : candidates;
}

/**
 * Cheap feasibility probe used while filtering a stage's allowed variants —
 * same rules as `resolveVariantDistractors`, without building the set.
 */
export function canBuildVariant({
  target,
  pool,
  count,
}: {
  target: NormalizedWord;
  pool: NormalizedWord[];
  count: number;
}): boolean {
  if (count <= 0) return true;
  return scoreCandidates(target, pool).length >= count;
}
