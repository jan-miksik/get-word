'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  configFromSnapshot,
  getScratchServerSnapshot,
  getScratchSnapshot,
  NO_BASE,
  repaintScratchFields,
  setScratchConfig,
  subscribeScratchConfig,
} from './scratch-field/motif-store';
import { MotifGroup, SCRATCH_MOTIFS } from './scratch-field/motifs';
import { useScratchFieldEnabled } from './scratch-field/use-scratch-enabled';

/**
 * TEMPORARY experiment control: picks the cover motif, the motif revealed
 * underneath, and which of the two the rising letters float above — so the
 * combinations can be compared on the real page instead of in screenshots.
 *
 * Delete this component, the config store, and all but the chosen motifs once
 * the experiment is settled.
 */

const GROUPS: Array<[MotifGroup, string]> = [
  ['logo', 'From the logo'],
  ['fog', 'Fogged glass'],
  ['playful', 'Playful'],
  ['brushed', 'Brushed — colourways'],
  ['texture', 'Other textures'],
];

type Slot = 'cover' | 'base';

/** Two stacked sheets — the cover over the layer revealed beneath it. */
function IconLayers() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 16 9 5 9-5" />
    </svg>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  valueLabel,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-xl px-1 py-1.5">
      <span className="mb-1 flex items-baseline justify-between gap-3 text-xs font-semibold">
        <span>{label}</span>
        <span className="font-mono text-[0.68rem] text-[var(--ink-soft)]">{valueLabel}</span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="block h-5 w-full cursor-pointer accent-[var(--blue)]"
      />
    </label>
  );
}

export function ScratchFieldSwitcher() {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<Slot>('cover');
  const enabled = useScratchFieldEnabled();
  const config = configFromSnapshot(
    useSyncExternalStore(
      subscribeScratchConfig,
      getScratchSnapshot,
      getScratchServerSnapshot
    )
  );

  const activeId = slot === 'cover' ? config.cover : config.base;
  const label = (id: string) =>
    id === NO_BASE
      ? 'page background'
      : (SCRATCH_MOTIFS.find((m) => m.id === id)?.label ?? id);

  // Nothing to switch where the field does not run.
  if (!enabled) return null;

  return (
    <div className="scratch-field-switcher fixed bottom-4 left-4 z-[60] flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2 text-[var(--ink)]">
      {open ? (
        <div className="max-h-[calc(100dvh-2rem)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border-2 border-[var(--ink)] bg-[var(--card-2)] p-2 shadow-[0_18px_40px_-22px_rgba(33,26,15,.7)]">
          {/* Which of the two layers the motif list below is editing. */}
          <div className="mb-2 flex rounded-xl border border-[var(--line)] p-0.5">
            {(
              [
                ['cover', '1st — cover'],
                ['base', '2nd — under'],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSlot(value)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                  slot === value
                    ? 'bg-[var(--ink)] text-[var(--card-2)]'
                    : 'hover:bg-[var(--card)]'
                }`}
              >
                {text}
              </button>
            ))}
          </div>

          <p className="m-0 px-1 pb-2 text-[0.68rem] leading-4 text-[var(--ink-soft)]">
            1st <strong className="font-semibold text-[var(--ink)]">{label(config.cover)}</strong>
            {' → '}
            2nd <strong className="font-semibold text-[var(--ink)]">{label(config.base)}</strong>
          </p>

          <div className="max-h-[min(58vh,26rem)] overflow-y-auto">
            {slot === 'base' ? (
              <button
                type="button"
                onClick={() => setScratchConfig({ base: NO_BASE })}
                className={`mb-1 flex w-full items-baseline justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors ${
                  config.base === NO_BASE
                    ? 'bg-[var(--blue)] font-semibold text-[var(--card-2)]'
                    : 'hover:bg-[var(--card)]'
                }`}
              >
                <span>None</span>
                <span
                  className={`text-[0.68rem] ${
                    config.base === NO_BASE ? 'text-[var(--card)]' : 'text-[var(--ink-soft)]'
                  }`}
                >
                  page background
                </span>
              </button>
            ) : null}

            {GROUPS.map(([group, heading]) => (
              <div key={group} className="mb-1">
                <p className="m-0 px-2 pb-1.5 pt-1 text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                  {heading}
                </p>
                <div className="flex flex-col gap-0.5">
                  {SCRATCH_MOTIFS.filter((motif) => motif.group === group).map((motif) => (
                    <button
                      key={motif.id}
                      type="button"
                      onClick={() => setScratchConfig({ [slot]: motif.id })}
                      className={`flex items-baseline justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors ${
                        motif.id === activeId
                          ? 'bg-[var(--blue)] font-semibold text-[var(--card-2)]'
                          : 'hover:bg-[var(--card)]'
                      }`}
                    >
                      <span>{motif.label}</span>
                      <span
                        className={`text-[0.68rem] ${
                          motif.id === activeId ? 'text-[var(--card)]' : 'text-[var(--ink-soft)]'
                        }`}
                      >
                        {motif.note}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 border-t border-[var(--line)] pt-2">
            <p className="m-0 px-1 pb-1 text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
              Surface & brush
            </p>
            <p className="m-0 px-1 pb-1 text-[0.64rem] leading-4 text-[var(--ink-soft)]">
              Density changes Topo and the new adjustable textures.
            </p>
            <RangeControl
              label="Texture density"
              value={config.textureDensity}
              min={0.35}
              max={1.6}
              step={0.05}
              valueLabel={`${config.textureDensity.toFixed(2)}×`}
              onChange={(textureDensity) => setScratchConfig({ textureDensity })}
            />
            <RangeControl
              label="Mobile brush"
              value={config.mobileBrushRadius}
              min={16}
              max={64}
              step={2}
              valueLabel={`≈ ${Math.round(config.mobileBrushRadius * 2)} px`}
              onChange={(mobileBrushRadius) => setScratchConfig({ mobileBrushRadius })}
            />
            <RangeControl
              label="Desktop brush"
              value={config.desktopBrushRadius}
              min={28}
              max={96}
              step={2}
              valueLabel={`≈ ${Math.round(config.desktopBrushRadius * 2)} px`}
              onChange={(desktopBrushRadius) => setScratchConfig({ desktopBrushRadius })}
            />
            <div className="mt-1 grid grid-cols-3 gap-1">
              {[
                {
                  label: 'Fine',
                  config: { textureDensity: 0.45, mobileBrushRadius: 22, desktopBrushRadius: 44 },
                },
                {
                  label: 'Balanced',
                  config: { textureDensity: 0.6, mobileBrushRadius: 32, desktopBrushRadius: 62 },
                },
                {
                  label: 'Bold',
                  config: { textureDensity: 1.15, mobileBrushRadius: 46, desktopBrushRadius: 80 },
                },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setScratchConfig(preset.config)}
                  className="rounded-lg border border-[var(--line)] px-1 py-1.5 text-[0.68rem] font-semibold hover:bg-[var(--card)]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 border-t border-[var(--line)] pt-2">
            <p className="m-0 px-1 pb-1.5 text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
              Rising letters on
            </p>
            <div className="flex rounded-xl border border-[var(--line)] p-0.5">
              {(
                [
                  ['base', '2nd (under)'],
                  ['cover', '1st (on top)'],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScratchConfig({ letters: value })}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                    config.letters === value
                      ? 'bg-[var(--ink)] text-[var(--card-2)]'
                      : 'hover:bg-[var(--card)]'
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 flex gap-1 border-t border-[var(--line)] pt-2">
            <button
              type="button"
              onClick={repaintScratchFields}
              className="flex-1 rounded-xl px-2.5 py-1.5 text-sm hover:bg-[var(--card)]"
            >
              Repaint
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl px-2.5 py-1.5 text-sm hover:bg-[var(--card)]"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={`${label(config.cover)} › ${label(config.base)}`}
          aria-label={`Background motifs — ${label(config.cover)} over ${label(config.base)}`}
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--ink)] bg-[var(--card-2)] opacity-70 shadow-[0_14px_30px_-20px_rgba(33,26,15,.7)] transition-opacity hover:opacity-100"
        >
          <IconLayers />
        </button>
      )}
    </div>
  );
}
