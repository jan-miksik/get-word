/**
 * Dev-only draft of a single palette for the whole app.
 *
 * This is deliberately NOT wired into `styles/tokens.css` yet — it is the
 * proposal the `/dev/design-system` page renders so the values can be judged
 * before anything migrates. Today the same seven colours are written down in
 * four places (`styles/tokens.css` dark defaults, `--game-*` in
 * `styles/minigames.css`, `--ob-*` in `features/shared/theme/warm-palette.ts`,
 * and ~730 raw hex literals across 74 components), which is why nothing here
 * invents new hues: every accent below already exists somewhere in the repo,
 * mostly quarantined inside the minigames' `--match-*` / `--rail-*` scales.
 */

/** The paper stack — the surfaces everything is printed on. */
export const NEUTRALS = [
  { name: 'sand', hex: '#DCD1B9', note: 'the sheet — app background' },
  { name: 'paper', hex: '#F4EFE2', note: 'card fill' },
  { name: 'paper-hi', hex: '#FFF8E8', note: 'raised / hover fill' },
  { name: 'paper-edge', hex: '#C9BBA3', note: 'hairline on paper' },
  { name: 'ink', hex: '#2A2218', note: 'text + borders' },
  { name: 'ink-soft', hex: '#6B5E48', note: 'secondary text' },
  { name: 'ink-faint', hex: '#BBAE98', note: 'tracks, rules, disabled' },
] as const;

export type AccentKey =
  | 'sea'
  | 'moss'
  | 'terracotta'
  | 'plum'
  | 'ochre'
  | 'rose'
  | 'brick';

export type Accent = {
  key: AccentKey;
  label: string;
  /** Resting fill / stroke. */
  base: string;
  /** Pressed + shadow colour. */
  deep: string;
  /** Pale wash for fills on paper. */
  wash: string;
  /** What this colour is allowed to mean, app-wide. */
  role: string;
};

/**
 * Seven inks with an assigned meaning. `sea` and `moss` are already the de
 * facto accent and correct colours; the rest are the match-pair inks promoted
 * out of the minigames so the rest of the app can stop being beige-and-blue.
 */
export const ACCENTS: Accent[] = [
  {
    key: 'sea',
    label: 'sea',
    base: '#1E6FA8',
    deep: '#14547F',
    wash: '#E2EDF5',
    role: 'primary action, opakování, odkazy',
  },
  {
    key: 'moss',
    label: 'moss',
    base: '#187A43',
    deep: '#125C32',
    wash: '#E3F3E7',
    role: 'správně, růst, nová slova',
  },
  {
    key: 'terracotta',
    label: 'terracotta',
    base: '#C2643C',
    deep: '#9A4C2C',
    wash: '#F8E9E0',
    role: 'druhá značková barva — přidávání, tvorba',
  },
  {
    key: 'plum',
    label: 'plum',
    base: '#7C5AA6',
    deep: '#5F4382',
    wash: '#EFE8F5',
    role: 'objevování — AI, foto lab, návrhy',
  },
  {
    key: 'ochre',
    label: 'ochre',
    base: '#B8763A',
    deep: '#8F5A2B',
    wash: '#F7EDDD',
    role: 'série, souhrn dne, odměny',
  },
  {
    key: 'rose',
    label: 'rose',
    base: '#BF4E7A',
    deep: '#97385D',
    wash: '#F9E6EC',
    role: 'měkké upozornění, zapomenutá slova',
  },
  {
    key: 'brick',
    label: 'brick',
    base: '#B91C1C',
    deep: '#8F1515',
    wash: '#FCE7E5',
    role: 'chyba, mazání — nic jiného',
  },
];

export const ACCENT_BY_KEY: Record<AccentKey, Accent> = ACCENTS.reduce(
  (acc, a) => ({ ...acc, [a.key]: a }),
  {} as Record<AccentKey, Accent>,
);

/**
 * The marker wash the neutral tone's highlighter strokes use. Not part of the
 * paper stack in `styles/tokens.css` — it only exists inside buttons — but the
 * editor below has to be able to reach it, so it is written down here with the
 * rest.
 */
export const PAPER_MARK = { name: 'paper-mark', hex: '#EADFC4', note: 'zvýrazňovač na papíru (jen tlačítka)' } as const;

export type NeutralName = (typeof NEUTRALS)[number]['name'] | 'paper-mark';

export const EDITABLE_NEUTRALS = [...NEUTRALS, PAPER_MARK] as ReadonlyArray<{
  name: NeutralName;
  hex: string;
  note: string;
}>;

export type AccentPart = 'base' | 'deep' | 'wash';

/**
 * A palette as the editor holds it: plain hex, one entry per knob.
 *
 * The page never paints from this directly. It publishes it as CSS variables
 * (`paletteCss`) and paints from `var()` handles, so a colour changes in one
 * place and every personality, swatch and mock-up follows without a re-render
 * of anything that draws.
 */
export type Palette = {
  neutrals: Record<NeutralName, string>;
  accents: Record<AccentKey, Record<AccentPart, string>>;
};

export const DEFAULT_PALETTE: Palette = {
  neutrals: Object.fromEntries(
    EDITABLE_NEUTRALS.map((n) => [n.name, n.hex]),
  ) as Record<NeutralName, string>,
  accents: Object.fromEntries(
    ACCENTS.map((a) => [a.key, { base: a.base, deep: a.deep, wash: a.wash }]),
  ) as Record<AccentKey, Record<AccentPart, string>>,
};

export const neutralVar = (name: NeutralName) => `--ds-${name}`;
export const accentVar = (key: AccentKey, part: AccentPart) => `--ds-${key}-${part}`;

/** The palette as a stylesheet, scoped to the page root. */
export function paletteCss(palette: Palette, selector = '.ds-root'): string {
  const lines = [
    ...EDITABLE_NEUTRALS.map((n) => `  ${neutralVar(n.name)}: ${palette.neutrals[n.name]};`),
    ...ACCENTS.flatMap((a) =>
      (['base', 'deep', 'wash'] as const).map(
        (part) => `  ${accentVar(a.key, part)}: ${palette.accents[a.key][part]};`,
      ),
    ),
  ];
  return `${selector} {\n${lines.join('\n')}\n}`;
}

/**
 * The accents as `var()` handles instead of hex, for everything that paints.
 * Same shape as `ACCENTS`, so `skinFor` and the mock-ups take them unchanged.
 */
export const ACCENT_VARS: Record<AccentKey, Accent> = ACCENTS.reduce(
  (acc, a) => ({
    ...acc,
    [a.key]: {
      ...a,
      base: `var(${accentVar(a.key, 'base')})`,
      deep: `var(${accentVar(a.key, 'deep')})`,
      wash: `var(${accentVar(a.key, 'wash')})`,
    },
  }),
  {} as Record<AccentKey, Accent>,
);
