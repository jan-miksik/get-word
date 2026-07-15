'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { PhotoLabLabel } from '@/features/photo-lab/types';
import { resolveChipCollisions } from './resolveChipCollisions';

// Reveal interaction lives in its own component so future modes (scratch
// overlay, typed answer) can swap the chip body without touching the layout.
function LabelChip({
  label,
  revealed,
  onToggle,
}: {
  label: PhotoLabLabel;
  revealed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`absolute -translate-x-1/2 -translate-y-1/2 max-w-[45%] truncate rounded-full px-2.5 py-1 text-xs backdrop-blur-sm transition-colors ${
        revealed
          ? 'bg-accent/85 text-white shadow-md'
          : 'bg-black/60 text-white shadow'
      }`}
      style={{ left: `${label.x * 100}%`, top: `${label.y * 100}%` }}
      aria-pressed={revealed}
    >
      {revealed ? label.target : label.known}
      {!revealed && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-white/70 align-middle" />}
    </button>
  );
}

export function LabeledPhoto({
  imageUrl,
  labels,
}: {
  imageUrl: string;
  labels: PhotoLabLabel[];
}) {
  const { t } = useI18n();
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const placedLabels = useMemo(() => resolveChipCollisions(labels), [labels]);

  const toggle = (id: string) => {
    setRevealedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob/data URL, next/image cannot optimize it */}
        <img src={imageUrl} alt="" className="block w-full" />
        {placedLabels.map((label) => (
          <LabelChip
            key={label.id}
            label={label}
            revealed={revealedIds.has(label.id)}
            onToggle={() => toggle(label.id)}
          />
        ))}
      </div>
      {labels.length === 0 ? (
        <p className="m-0 text-sm text-text-soft">{t('photoLab.noLabels')}</p>
      ) : (
        <p className="m-0 text-xs text-text-soft/70">{t('photoLab.tapToReveal')}</p>
      )}
    </div>
  );
}
