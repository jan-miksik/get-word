import { STAGES } from '@/lib/words';
import { SIMILARITY_BANDS } from '@/features/learning/minigames/similarity';
import {
  CHOICE_OPTION_COUNTS,
  MATCH_PAIR_COUNTS,
  MAX_WEIGHT,
  METHOD_IDS,
  MIN_WEIGHT,
  REVEAL_VARIANTS,
  TYPING_VARIANTS,
  type ChoiceVariant,
  type FineTuneConfig,
  type MatchVariant,
  type MethodConfig,
  type MethodId,
  type RevealVariant,
  type StageConfig,
  type TypingVariant,
} from './types';

const STAGE_COUNT = STAGES.length;

export const PRESET_IDS = ['calm', 'balanced', 'demanding'] as const;
export type PresetId = (typeof PRESET_IDS)[number];
const DEFAULT_PRESET: PresetId = 'balanced';

const method = <V extends string>(weight: number, variants: V[]): MethodConfig<V> => ({
  weight,
  variants,
});

const NO_REVEAL = method<RevealVariant>(1, []);
const NO_CHOICE = method<ChoiceVariant>(1, []);
const NO_TYPING = method<TypingVariant>(1, []);

/**
 * The "balanced" ladder, and the single table the other presets are derived
 * from — there is deliberately no second hand-written list to keep in sync.
 *
 * Reveal holds half the weight while a word is still settling and disappears
 * from 14 days on: passively uncovering an answer is the weakest memory signal
 * we have, and long intervals are exactly where recall matters. Typing grows
 * the other way and ends up alone at 60 days, because writing a word with no
 * scaffolding is the strongest evidence that it really stuck.
 *
 * 3 days and 7 days share their weights on purpose. The step up between them
 * comes from the allowed variants getting harder (`4:II` → `4:III`, `5:I` →
 * `5:II`), not from reshuffling how often each method appears.
 */
export const BALANCED_STAGE_CONFIGS: StageConfig[] = [
  // 0 — now / forgotten
  {
    reveal: method<RevealVariant>(2, ['foreign']),
    choice: NO_CHOICE,
    typing: NO_TYPING,
    match: { variants: [] },
  },
  // 1 — 5 minutes
  {
    reveal: method<RevealVariant>(2, ['foreign']),
    choice: method<ChoiceVariant>(2, ['2:I']),
    typing: NO_TYPING,
    match: { variants: ['4:I'] },
  },
  // 2 — 1 day
  {
    reveal: method<RevealVariant>(2, ['foreign']),
    choice: method<ChoiceVariant>(2, ['2:II', '3:I', '4:I']),
    typing: NO_TYPING,
    match: { variants: ['4:II', '6:I'] },
  },
  // 3 — 3 days
  {
    reveal: method<RevealVariant>(2, ['known']),
    choice: method<ChoiceVariant>(1, ['2:III', '3:II', '4:II', '5:I', '6:I', '7:I', '8:I']),
    typing: method<TypingVariant>(1, ['firstLetterWithHint']),
    match: { variants: ['4:III', '6:II', '8:I'] },
  },
  // 4 — 7 days
  {
    reveal: method<RevealVariant>(2, ['known']),
    choice: method<ChoiceVariant>(1, ['3:III', '4:III', '5:II', '6:II', '7:II', '8:II']),
    typing: method<TypingVariant>(1, ['firstLetterWithHint']),
    match: { variants: ['6:III', '8:II'] },
  },
  // 5 — 14 days
  {
    reveal: NO_REVEAL,
    choice: method<ChoiceVariant>(2, ['5:III', '6:III', '7:III', '8:III']),
    typing: method<TypingVariant>(2, ['hint']),
    match: { variants: ['8:III'] },
  },
  // 6 — 30 days
  {
    reveal: NO_REVEAL,
    choice: method<ChoiceVariant>(2, ['8:III']),
    typing: method<TypingVariant>(4, ['bare']),
    match: { variants: [] },
  },
  // 7 — 60 days
  {
    reveal: NO_REVEAL,
    choice: NO_CHOICE,
    typing: method<TypingVariant>(2, ['bare']),
    match: { variants: [] },
  },
];

function cloneStage(stage: StageConfig): StageConfig {
  return {
    reveal: { weight: stage.reveal.weight, variants: [...stage.reveal.variants] },
    choice: { weight: stage.choice.weight, variants: [...stage.choice.variants] },
    typing: { weight: stage.typing.weight, variants: [...stage.typing.variants] },
    match: { variants: [...stage.match.variants] },
  };
}

/**
 * Calm and demanding are the balanced ladder shifted by one stage — easier
 * means "treat a 7-day word the way balanced treats a 3-day one", harder means
 * the opposite. Derivation keeps all three presets honest against one table.
 */
function presetStageConfigs(preset: PresetId): StageConfig[] {
  const shift = preset === 'calm' ? -1 : preset === 'demanding' ? 1 : 0;
  return BALANCED_STAGE_CONFIGS.map((stage, index) => {
    if (shift === 0) return cloneStage(stage);
    const source = index + shift;
    if (source < 0 || source >= BALANCED_STAGE_CONFIGS.length) return cloneStage(stage);
    return cloneStage(BALANCED_STAGE_CONFIGS[source]);
  });
}

export function presetConfig(preset: PresetId): FineTuneConfig {
  return { version: 1, stages: presetStageConfigs(preset) };
}

export const DEFAULT_FINE_TUNE_CONFIG: FineTuneConfig = presetConfig(DEFAULT_PRESET);

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const REVEAL_SET = new Set<string>(REVEAL_VARIANTS);
const TYPING_SET = new Set<string>(TYPING_VARIANTS);
const BAND_SET = new Set<string>(SIMILARITY_BANDS);
const CHOICE_COUNT_SET = new Set<number>(CHOICE_OPTION_COUNTS);
const MATCH_COUNT_SET = new Set<number>(MATCH_PAIR_COUNTS);

function isChoiceVariant(value: unknown): value is ChoiceVariant {
  if (typeof value !== 'string') return false;
  const [count, band] = value.split(':');
  return CHOICE_COUNT_SET.has(Number(count)) && BAND_SET.has(band);
}

function isMatchVariant(value: unknown): value is MatchVariant {
  if (typeof value !== 'string') return false;
  const [count, band] = value.split(':');
  return MATCH_COUNT_SET.has(Number(count)) && BAND_SET.has(band);
}

function normalizeWeight(value: unknown, fallback: number): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, parsed));
}

function normalizeVariants<V extends string>(
  value: unknown,
  isValid: (candidate: unknown) => candidate is V,
): V[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<V>();
  for (const entry of value) {
    if (isValid(entry)) seen.add(entry);
  }
  return [...seen];
}

function normalizeMethod<V extends string>(
  value: unknown,
  fallback: MethodConfig<V>,
  isValid: (candidate: unknown) => candidate is V,
): MethodConfig<V> {
  if (!value || typeof value !== 'object') return { ...fallback, variants: [...fallback.variants] };
  const raw = value as { weight?: unknown; variants?: unknown };
  return {
    weight: normalizeWeight(raw.weight, fallback.weight),
    variants: normalizeVariants(raw.variants, isValid),
  };
}

function normalizeStage(value: unknown, fallback: StageConfig): StageConfig {
  if (!value || typeof value !== 'object') return cloneStage(fallback);
  const raw = value as Record<string, unknown>;

  const stage: StageConfig = {
    reveal: normalizeMethod(raw.reveal, fallback.reveal, (candidate): candidate is RevealVariant =>
      typeof candidate === 'string' && REVEAL_SET.has(candidate),
    ),
    choice: normalizeMethod(raw.choice, fallback.choice, isChoiceVariant),
    typing: normalizeMethod(raw.typing, fallback.typing, (candidate): candidate is TypingVariant =>
      typeof candidate === 'string' && TYPING_SET.has(candidate),
    ),
    match: {
      variants: normalizeVariants(
        (raw.match as { variants?: unknown } | undefined)?.variants,
        isMatchVariant,
      ),
    },
  };

  // A stage with no active review method has nothing to render. Rather than
  // failing later inside the card, fall back to the gentlest exercise there is.
  if (METHOD_IDS.every((id) => stage[id].variants.length === 0)) {
    stage.reveal = { weight: stage.reveal.weight, variants: ['foreign'] };
  }

  return stage;
}

/**
 * Turn anything at all into a usable config. Runs on the client AND on the
 * server: a hand-edited request must not be able to store something that later
 * blows up a card render.
 */
export function normalizeFineTuneConfig(value: unknown): FineTuneConfig {
  const raw =
    value && typeof value === 'object' ? (value as { stages?: unknown }) : { stages: undefined };
  const rawStages = Array.isArray(raw.stages) ? raw.stages : [];

  return {
    version: 1,
    stages: BALANCED_STAGE_CONFIGS.map((fallback, index) =>
      normalizeStage(rawStages[index], DEFAULT_FINE_TUNE_CONFIG.stages[index] ?? fallback),
    ),
  };
}

// ---------------------------------------------------------------------------
// Preset detection
// ---------------------------------------------------------------------------

function sameVariants(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((entry, index) => entry === right[index]);
}

function sameStage(a: StageConfig, b: StageConfig): boolean {
  const methodsMatch = METHOD_IDS.every((id) => {
    // Weight only matters while a method is actually in play; two stages that
    // both have reveal switched off are the same stage whatever its stored weight.
    const active = a[id].variants.length > 0;
    if (active && a[id].weight !== b[id].weight) return false;
    return sameVariants(a[id].variants, b[id].variants);
  });
  return methodsMatch && sameVariants(a.match.variants, b.match.variants);
}

export function detectPreset(config: FineTuneConfig): PresetId | 'custom' {
  for (const preset of PRESET_IDS) {
    const candidate = presetStageConfigs(preset);
    if (config.stages.every((stage, index) => sameStage(stage, candidate[index]))) {
      return preset;
    }
  }
  return 'custom';
}

function isMethodActive(stage: StageConfig, id: MethodId): boolean {
  return stage[id].variants.length > 0;
}

export function activeMethods(stage: StageConfig): MethodId[] {
  return METHOD_IDS.filter((id) => isMethodActive(stage, id));
}

/** Live percentages for the settings UI, normalised over the active methods. */
export function methodShares(stage: StageConfig): Partial<Record<MethodId, number>> {
  const active = activeMethods(stage);
  const total = active.reduce((sum, id) => sum + stage[id].weight, 0);
  if (total <= 0) return {};
  return Object.fromEntries(active.map((id) => [id, stage[id].weight / total]));
}

export function stageConfigAt(config: FineTuneConfig, stageIndex: number): StageConfig {
  const clamped = Math.min(
    STAGE_COUNT - 1,
    Math.max(0, Number.isFinite(stageIndex) ? Math.floor(stageIndex) : 0),
  );
  return config.stages[clamped] ?? DEFAULT_FINE_TUNE_CONFIG.stages[clamped];
}
