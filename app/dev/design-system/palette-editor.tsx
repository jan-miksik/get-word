'use client';

import { useEffect, useState, type ReactNode } from 'react';

import {
  ACCENTS,
  DEFAULT_PALETTE,
  EDITABLE_NEUTRALS,
  paletteCss,
  type AccentKey,
  type AccentPart,
  type NeutralName,
  type Palette,
} from './tokens';

const STORAGE_KEY = 'ds-palette-draft';

/**
 * Live editor for the palette the rest of `/dev/design-system` paints from.
 *
 * The point of this page is to judge colours, and a colour cannot be judged
 * from a swatch grid — it has to be judged on the buttons and the card. So the
 * palette is state, published as `--ds-*` variables on the page root, and every
 * knob here repaints the whole page under your hands.
 *
 * The draft survives a reload (localStorage) but never reaches the app: nothing
 * outside `app/dev/design-system/*` reads these variables. "Zkopírovat pro
 * tokens.css" is the only way out, and it is deliberately a copy rather than a
 * write — moving a colour into `styles/tokens.css` is a decision, not a save.
 */
export function usePaletteDraft() {
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);

  /* Read after mount, not during render: the server has no localStorage, and
     hydrating against a stored palette would mismatch the markup. */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as Partial<Palette>;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time restore from storage
      setPalette({
        neutrals: { ...DEFAULT_PALETTE.neutrals, ...(stored.neutrals ?? {}) },
        accents: Object.fromEntries(
          ACCENTS.map((a) => [
            a.key,
            { ...DEFAULT_PALETTE.accents[a.key], ...(stored.accents?.[a.key] ?? {}) },
          ]),
        ) as Palette['accents'],
      });
    } catch {
      /* A corrupt or blocked store just means the defaults. */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(palette));
    } catch {
      /* Private windows and blocked site data are fine; the draft is not precious. */
    }
  }, [palette]);

  return { palette, setPalette };
}

/** #rgb / #rrggbb → the 6-digit form `<input type="color">` insists on. */
function normalizeHex(value: string): string | null {
  const v = value.trim().replace(/^#?/, '');
  if (/^[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toUpperCase()}`;
  return null;
}

function srgb(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * srgb((n >> 16) & 255) +
    0.7152 * srgb((n >> 8) & 255) +
    0.0722 * srgb(n & 255)
  );
}

/** WCAG contrast, to one decimal — enough to see 4.5 coming. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
}

function ContrastBadge({ ratio, need = 4.5 }: { ratio: number; need?: number }) {
  const ok = ratio >= need;
  return (
    <span
      className="rounded px-1.5 py-0.5 font-mono text-[0.66rem] font-bold"
      style={{
        background: ok ? 'var(--ds-moss-wash)' : 'var(--ds-brick-wash)',
        color: ok ? 'var(--ds-moss-deep)' : 'var(--ds-brick-deep)',
      }}
      title={`kontrast ${ratio}:1, potřeba ${need}:1`}
    >
      {ratio}
    </span>
  );
}

function Knob({
  label,
  hex,
  fallback,
  onChange,
  children,
}: {
  label: string;
  hex: string;
  fallback: string;
  onChange: (hex: string) => void;
  children?: ReactNode;
}) {
  /* The text field is its own draft so a half-typed "#1E6" does not repaint the
     page — it commits on a valid hex, and snaps back on blur if it never was. */
  const [text, setText] = useState(hex);
  const [lastHex, setLastHex] = useState(hex);
  if (hex !== lastHex) {
    setLastHex(hex);
    setText(hex);
  }
  const dirty = hex.toUpperCase() !== fallback.toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={label}
        value={hex}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-9 w-9 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(42,34,24,0.25)' }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[0.78rem] font-bold" style={{ color: 'var(--ds-ink)' }}>
            {label}
          </span>
          {children}
          {dirty ? (
            <button
              type="button"
              onClick={() => onChange(fallback)}
              className="text-[0.68rem] font-bold underline"
              style={{ color: 'var(--ds-ink-soft)' }}
              title={`zpět na ${fallback}`}
            >
              zpět
            </button>
          ) : null}
        </div>
        <input
          type="text"
          value={text}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = normalizeHex(e.target.value);
            if (parsed) onChange(parsed);
          }}
          onBlur={() => setText(hex)}
          className="mt-0.5 w-full rounded px-1.5 py-0.5 font-mono text-[0.74rem]"
          style={{
            background: 'var(--ds-paper-hi)',
            color: 'var(--ds-ink-soft)',
            boxShadow: 'inset 0 0 0 1px rgba(42,34,24,0.15)',
          }}
        />
      </div>
    </div>
  );
}

export function PaletteEditor({
  palette,
  setPalette,
  accent,
  onPickAccent,
}: {
  palette: Palette;
  setPalette: (next: Palette) => void;
  accent: AccentKey;
  onPickAccent: (key: AccentKey) => void;
}) {
  const [copied, setCopied] = useState(false);

  const setNeutral = (name: NeutralName, hex: string) =>
    setPalette({ ...palette, neutrals: { ...palette.neutrals, [name]: hex } });

  const setAccentPart = (key: AccentKey, part: AccentPart, hex: string) =>
    setPalette({
      ...palette,
      accents: { ...palette.accents, [key]: { ...palette.accents[key], [part]: hex } },
    });

  const dirty =
    JSON.stringify(palette) !== JSON.stringify(DEFAULT_PALETTE);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(paletteCss(palette, ':root'));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
          className="rounded-full px-3.5 py-1.5 text-[0.8rem] font-bold"
          style={{ background: 'var(--ds-ink)', color: 'var(--ds-paper)' }}
        >
          {copied ? 'zkopírováno ✓' : 'Zkopírovat pro tokens.css'}
        </button>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => setPalette(DEFAULT_PALETTE)}
          className="rounded-full px-3.5 py-1.5 text-[0.8rem] font-bold disabled:opacity-40"
          style={{
            background: 'var(--ds-paper)',
            color: 'var(--ds-ink)',
            boxShadow: 'inset 0 0 0 1px var(--ds-paper-edge)',
          }}
        >
          Zpět na výchozí
        </button>
        <span className="text-[0.78rem]" style={{ color: 'var(--ds-ink-soft)' }}>
          {dirty
            ? 'Rozpracovaná paleta — drží se v prohlížeči, do aplikace nesahá.'
            : 'Výchozí paleta, přesně jak ji dnes kreslí tokens.css.'}
        </span>
      </div>

      <div
        className="rounded-2xl p-4"
        style={{
          background: 'var(--ds-paper)',
          boxShadow: 'inset 0 0 0 1px var(--ds-paper-edge)',
        }}
      >
        <p className="text-[0.8rem] font-black uppercase tracking-[0.14em]">Papír a inkoust</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {EDITABLE_NEUTRALS.map((n) => (
            <Knob
              key={n.name}
              label={n.name}
              hex={palette.neutrals[n.name]}
              fallback={n.hex}
              onChange={(hex) => setNeutral(n.name, hex)}
            >
              {n.name === 'ink' || n.name === 'ink-soft' ? (
                <ContrastBadge
                  ratio={contrast(palette.neutrals[n.name], palette.neutrals.paper)}
                />
              ) : null}
            </Knob>
          ))}
        </div>
        <p className="mt-3 text-[0.78rem]" style={{ color: 'var(--ds-ink-soft)' }}>
          Čísla u inkoustů jsou kontrast na papíru. Pod 4,5 je text pod hranicí
          čitelnosti podle WCAG AA.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ACCENTS.map((a) => {
          const live = palette.accents[a.key];
          const selected = accent === a.key;
          return (
            <div
              key={a.key}
              className="rounded-xl p-3"
              style={{
                background: 'var(--ds-paper)',
                boxShadow: selected
                  ? `inset 0 0 0 2px var(--ds-${a.key}-base)`
                  : 'inset 0 0 0 1px var(--ds-paper-edge)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[0.95rem] font-black">
                  <span
                    className="h-3.5 w-3.5 rounded-full"
                    style={{
                      background: `var(--ds-${a.key}-base)`,
                      boxShadow: 'inset 0 0 0 1px rgba(42,34,24,0.25)',
                    }}
                  />
                  {a.label}
                  <ContrastBadge ratio={contrast(live.base, palette.neutrals.paper)} need={3} />
                </span>
                <button
                  type="button"
                  onClick={() => onPickAccent(a.key)}
                  className="shrink-0 text-[0.75rem] font-bold underline"
                  style={{ color: `var(--ds-${a.key}-base)` }}
                >
                  {selected ? 'vybráno' : 'použít'}
                </button>
              </div>
              <p className="mt-1 text-[0.8rem]" style={{ color: 'var(--ds-ink-soft)' }}>
                {a.role}
              </p>
              <div className="mt-2.5 grid gap-2">
                {(['base', 'deep', 'wash'] as const).map((part) => (
                  <Knob
                    key={part}
                    label={part}
                    hex={live[part]}
                    fallback={DEFAULT_PALETTE.accents[a.key][part]}
                    onChange={(hex) => setAccentPart(a.key, part, hex)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
