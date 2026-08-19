'use client';

import { useState } from 'react';
import { STAGES } from '@/lib/words';
import { useI18n } from '@/components/I18nProvider';
import type { I18nKey } from '@/lib/i18n/messages';
import { useAppStateContext } from '@/context/AppStateContext';
import { Section } from '@/components/settings/primitives';
import { SIMILARITY_BANDS, type SimilarityBand } from '@/features/learning/minigames/similarity';
import {
  CHOICE_OPTION_COUNTS,
  MATCH_PAIR_COUNTS,
  METHOD_IDS,
  REVEAL_VARIANTS,
  TYPING_VARIANTS,
  choiceVariant,
  matchVariant,
  type ChoiceOptionCount,
  type ChoiceVariant,
  type FineTuneConfig,
  type MatchPairCount,
  type MatchVariant,
  type MethodId,
  type StageConfig,
} from '@/features/learning/fine-tune/types';
import {
  PRESET_IDS,
  activeMethods,
  detectPreset,
  methodShares,
  normalizeFineTuneConfig,
  presetConfig,
  type PresetId,
} from '@/features/learning/fine-tune/config';
import { TypingOptionsSubsection } from './TypingOptionsSubsection';

const METHOD_LABEL_KEY: Record<MethodId, I18nKey> = {
  reveal: 'settings.fineTuneMethodReveal',
  choice: 'settings.fineTuneMethodChoice',
  typing: 'settings.fineTuneMethodTyping',
};

const PRESET_LABEL_KEY: Record<PresetId | 'custom', I18nKey> = {
  calm: 'settings.fineTunePresetCalm',
  balanced: 'settings.fineTunePresetBalanced',
  demanding: 'settings.fineTunePresetDemanding',
  custom: 'settings.fineTunePresetCustom',
};

const REVEAL_LABEL_KEY = {
  foreign: 'settings.fineTuneRevealForeign',
  known: 'settings.fineTuneRevealKnown',
} as const;

const TYPING_LABEL_KEY = {
  firstLetterWithHint: 'settings.fineTuneTypingFirstLetterWithHint',
  hint: 'settings.fineTuneTypingHint',
  bare: 'settings.fineTuneTypingBare',
} as const;

// Coarse on purpose: sliders that renormalise against each other are unusable
// on a phone, and the live percentage next to each method shows the effect.
const WEIGHT_CHOICES = [
  { weight: 1, key: 'settings.fineTuneWeightLow' },
  { weight: 2, key: 'settings.fineTuneWeightMedium' },
  { weight: 4, key: 'settings.fineTuneWeightHigh' },
] as const;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

export function FineTuneSection() {
  const { t } = useI18n();
  const { learningFineTune, setLearningFineTune } = useAppStateContext();
  const [openStage, setOpenStage] = useState<number | null>(null);

  // Never trust the context to be populated: harnesses and older cached state
  // can leave this undefined, and a settings panel must not take the app down.
  const config = normalizeFineTuneConfig(learningFineTune as FineTuneConfig | undefined);
  const preset = detectPreset(config);

  const updateStage = (stageIndex: number, next: StageConfig) => {
    setLearningFineTune({
      ...config,
      stages: config.stages.map((stage, index) => (index === stageIndex ? next : stage)),
    });
  };

  return (
    <Section label={t('settings.fineTune')}>
      <p className="m-0 text-xs text-text-soft">{t('settings.fineTuneIntro')}</p>

      <div
        role="radiogroup"
        aria-label={t('settings.fineTunePreset')}
        className="inline-flex w-full gap-1 rounded-xl border border-border-subtle bg-background/30 p-1"
      >
        {PRESET_IDS.map((id) => {
          const selected = preset === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setLearningFineTune(presetConfig(id))}
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                selected
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-soft hover:bg-background-elevated/40 hover:text-text'
              }`}
            >
              {t(PRESET_LABEL_KEY[id])}
            </button>
          );
        })}
        {preset === 'custom' && (
          <span className="flex-1 rounded-lg bg-accent px-2 py-2 text-center text-xs font-medium text-white shadow-sm">
            {t('settings.fineTunePresetCustom')}
          </span>
        )}
      </div>

      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {STAGES.map((stage, stageIndex) => {
          const stageConfig = config.stages[stageIndex];
          if (!stageConfig) return null;
          const isOpen = openStage === stageIndex;
          const methods = activeMethods(stageConfig);
          return (
            <li key={stage.id} className="rounded-lg border border-border-subtle/60">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenStage(isOpen ? null : stageIndex)}
                className="flex w-full items-center justify-between gap-3 rounded-lg bg-transparent px-3 py-2.5 text-left transition-colors hover:bg-background-elevated/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <span className="text-sm font-medium text-text">
                  {t(`stage.${stage.id}` as I18nKey)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-text-soft">
                    {methods.length > 0
                      ? methods.map((id) => t(METHOD_LABEL_KEY[id])).join(' · ')
                      : t('settings.fineTuneNoneAtStage')}
                  </span>
                  <span
                    aria-hidden
                    className={`text-text-soft/70 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  >
                    ›
                  </span>
                </span>
              </button>

              {isOpen && (
                <StageDetail
                  stageConfig={stageConfig}
                  onChange={(next) => updateStage(stageIndex, next)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function StageDetail({
  stageConfig,
  onChange,
}: {
  stageConfig: StageConfig;
  onChange: (next: StageConfig) => void;
}) {
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const methods = activeMethods(stageConfig);
  const shares = methodShares(stageConfig);

  const setVariants = <K extends MethodId>(id: K, variants: StageConfig[K]['variants']) => {
    // Emptying a method's variants is how it is switched off, but the stage
    // still has to be able to render something.
    if (variants.length === 0 && methods.length === 1 && methods[0] === id) return;
    onChange({ ...stageConfig, [id]: { ...stageConfig[id], variants } });
  };

  return (
    <div className="flex flex-col gap-4 border-t border-border-subtle/60 px-3 py-3">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wider text-text-soft/70">
          {t('settings.fineTuneMethodReveal')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {REVEAL_VARIANTS.map((variant) => (
            <Chip
              key={variant}
              selected={stageConfig.reveal.variants.includes(variant)}
              label={t(REVEAL_LABEL_KEY[variant])}
              onClick={() => setVariants('reveal', toggle(stageConfig.reveal.variants, variant))}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wider text-text-soft/70">
          {t('settings.fineTuneMethodTyping')}
        </p>
        <div className="flex flex-col gap-1.5">
          {TYPING_VARIANTS.map((variant) => (
            <Chip
              key={variant}
              selected={stageConfig.typing.variants.includes(variant)}
              label={t(TYPING_LABEL_KEY[variant])}
              onClick={() => setVariants('typing', toggle(stageConfig.typing.variants, variant))}
            />
          ))}
        </div>
        <p className="m-0 text-[0.65rem] text-text-soft/70">{t('settings.fineTuneTypingNote')}</p>
      </div>

      <VariantGrid
        title={t('settings.fineTuneMethodChoice')}
        countLabel={t('settings.fineTuneOptions')}
        counts={CHOICE_OPTION_COUNTS}
        selected={stageConfig.choice.variants}
        makeVariant={(count, band) => choiceVariant(count as ChoiceOptionCount, band)}
        onToggle={(variant) =>
          setVariants('choice', toggle(stageConfig.choice.variants, variant as ChoiceVariant))
        }
      />

      <div className="flex flex-col gap-2">
        <VariantGrid
          title={t('settings.fineTuneMethodMatch')}
          countLabel={t('settings.fineTunePairs')}
          counts={MATCH_PAIR_COUNTS}
          selected={stageConfig.match.variants}
          makeVariant={(count, band) => matchVariant(count as MatchPairCount, band)}
          onToggle={(variant) =>
            onChange({
              ...stageConfig,
              match: { variants: toggle(stageConfig.match.variants, variant as MatchVariant) },
            })
          }
        />
        <p className="m-0 text-[0.65rem] text-text-soft/70">{t('settings.fineTuneMatchNote')}</p>
      </div>

      <p className="m-0 text-[0.65rem] text-text-soft/70">{t('settings.fineTuneBandLegend')}</p>

      <div>
        <button
          type="button"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex items-center gap-1.5 rounded-lg bg-transparent px-0 py-1 text-xs font-medium text-text-soft transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <span aria-hidden className={`transition-transform ${advancedOpen ? 'rotate-90' : ''}`}>
            ›
          </span>
          {t('settings.fineTuneAdvanced')}
        </button>

        {advancedOpen && (
          <div className="mt-2 flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wider text-text-soft/70">
                {t('settings.fineTuneWeight')}
              </p>
              {METHOD_IDS.filter((id) => stageConfig[id].variants.length > 0).map((id) => (
                <div key={id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-text">
                    {t(METHOD_LABEL_KEY[id])}
                    <span className="ml-1.5 tabular-nums text-text-soft/70">
                      {Math.round((shares[id] ?? 0) * 100)}%
                    </span>
                  </span>
                  <div className="flex gap-1">
                    {WEIGHT_CHOICES.map((choice) => (
                      <Chip
                        key={choice.weight}
                        selected={stageConfig[id].weight === choice.weight}
                        label={t(choice.key)}
                        onClick={() =>
                          onChange({
                            ...stageConfig,
                            [id]: { ...stageConfig[id], weight: choice.weight },
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <TypingOptionsSubsection />
          </div>
        )}
      </div>
    </div>
  );
}

function VariantGrid({
  title,
  countLabel,
  counts,
  selected,
  makeVariant,
  onToggle,
}: {
  title: string;
  countLabel: string;
  counts: readonly number[];
  selected: readonly string[];
  makeVariant: (count: number, band: SimilarityBand) => string;
  onToggle: (variant: string) => void;
}) {
  const selectedSet = new Set(selected);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wider text-text-soft/70">
        {title}
      </p>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `minmax(2.5rem, auto) repeat(${SIMILARITY_BANDS.length}, 1fr)` }}
      >
        <span aria-hidden className="text-[0.6rem] uppercase tracking-wide text-text-soft/60">
          {countLabel}
        </span>
        {SIMILARITY_BANDS.map((band) => (
          <span
            key={band}
            aria-hidden
            className="text-center text-[0.6rem] font-semibold uppercase tracking-wide text-text-soft/60"
          >
            {band}
          </span>
        ))}
        {counts.map((count) => (
          <Row
            key={count}
            count={count}
            selectedSet={selectedSet}
            makeVariant={makeVariant}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  count,
  selectedSet,
  makeVariant,
  onToggle,
}: {
  count: number;
  selectedSet: Set<string>;
  makeVariant: (count: number, band: SimilarityBand) => string;
  onToggle: (variant: string) => void;
}) {
  return (
    <>
      <span className="self-center text-xs tabular-nums text-text-soft">{count}</span>
      {SIMILARITY_BANDS.map((band) => {
        const variant = makeVariant(count, band);
        const selected = selectedSet.has(variant);
        return (
          <button
            key={band}
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={`${count} · ${band}`}
            onClick={() => onToggle(variant)}
            className={`h-7 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
              selected
                ? 'border-accent bg-accent text-white'
                : 'border-border-subtle bg-background/40 hover:border-accent/60'
            }`}
          >
            <span aria-hidden className="text-xs">
              {selected ? '✓' : ''}
            </span>
          </button>
        );
      })}
    </>
  );
}

function Chip({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
        selected
          ? 'border-accent bg-accent text-white'
          : 'border-border-subtle bg-background/40 text-text-soft hover:border-accent/60 hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}
