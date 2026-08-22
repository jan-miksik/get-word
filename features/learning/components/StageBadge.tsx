'use client';

import { useI18n } from '@/components/I18nProvider';
import type { SimilarityBand } from '@/features/learning/minigames/similarity';
import { STAGES } from '@/lib/words';

const stageMessageKeys = [
  'stage.0',
  'stage.1',
  'stage.2',
  'stage.3',
  'stage.4',
  'stage.5',
  'stage.6',
  'stage.7',
] as const;

/**
 * A quiet reminder of the prompt word's SRS stage and exercise difficulty.
 *
 * Laid out in flow — the card places it by wrapping it in `CardTopControls`,
 * which is what keeps it from colliding with the other top-right controls.
 */
export function StageBadge({
  stageIndex = 0,
  difficultyBand,
  className = '',
}: {
  stageIndex?: number;
  difficultyBand?: SimilarityBand;
  className?: string;
}) {
  const { t } = useI18n();
  const normalizedStageIndex = Math.max(0, Math.min(Math.floor(stageIndex), STAGES.length - 1));
  const stageLabel = normalizedStageIndex === 0
    ? t('game.newStage')
    : t(stageMessageKeys[normalizedStageIndex]);
  const label = difficultyBand ? `${stageLabel} · ${difficultyBand}` : stageLabel;

  return (
    <span
      className={`pointer-events-none inline-flex items-center rounded-full border border-[#2A2218]/10 bg-[#FFF8E8]/45 px-2.5 py-1 text-[0.65rem] font-bold tracking-wide text-[#2A2218]/55 ${className}`}
      role="img"
      aria-label={label}
    >
      {label}
    </span>
  );
}
