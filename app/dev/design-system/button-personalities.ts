import type { Accent } from './tokens';

/**
 * Seventeen candidate button languages for the app, dev-only.
 *
 * `duo` is the baseline: it is what the app already draws today
 * (`ContinueButton`'s `lift` variant and every `StudyOptionButton`), and it is
 * also exactly Duolingo's recipe — fat radius, hard `0 4px 0` bottom shadow,
 * uppercase black caps. The other five are attempts at something the app can
 * own, all drawn from the material it already sits on: warm paper, ink,
 * printing. The second batch (`marker` … `bleed`) pushes the same material
 * further: a felt-tip stroke, a keycap in its socket, a perforated stub, a
 * sticker, and a press that knows where your thumb landed. The third batch
 * (`stencil` … `circle`) stops being polite about it — a misregistered riso
 * pass, a page that turns, a torn edge, a hold-to-confirm sweep, and a
 * teacher's pen looping around the label.
 *
 * Every personality reads the same nine skin variables and only decides
 * *geometry and press physics*. That split is the actual proposal — tone and
 * colour come from tokens, shape comes from the personality, and no component
 * ever writes a hex again.
 */
export type PersonalityKey =
  | 'duo'
  | 'letterpress'
  | 'stamp'
  | 'ruled'
  | 'notch'
  | 'underline'
  | 'marker'
  | 'keycap'
  | 'ticket'
  | 'sticker'
  | 'bleed'
  | 'stencil'
  | 'riso'
  | 'leaf'
  | 'tear'
  | 'hold'
  | 'circle';

export type Personality = {
  key: PersonalityKey;
  label: string;
  pitch: string;
  /** Honest note on what this costs or risks. */
  caveat: string;
  /** Which round this was drawn in; 1 is the original six. */
  batch?: 2 | 3;
  /** Needs its label as a `data-label` attribute (the riso overprint). */
  needsLabelAttr?: boolean;
  /** Needs the hand-drawn annotation SVG rendered inside the button. */
  needsAnnotation?: boolean;
};

export const PERSONALITIES: Personality[] = [
  {
    key: 'duo',
    label: 'Lift (dnešní stav)',
    pitch:
      'Tvrdý spodní stín, tučné verzálky. Fyzické, čitelné, okamžitě srozumitelné.',
    caveat:
      'Je to doslova Duolingo. Tenhle tvar má obsazený — na hřišti hraček nevyhrajeme.',
  },
  {
    key: 'letterpress',
    label: 'Letterpress',
    pitch:
      'Přesný opak: stisk se zaboří do papíru místo aby plastová deska spadla. Klid, hloubka, papírová logika.',
    caveat:
      'Tišší signál — na dotykovém displeji je zapuštění hůř vidět než skok. Potřebuje ještě barvu nebo haptiku.',
  },
  {
    key: 'stamp',
    label: 'Razítko',
    pitch:
      'Bloček inkoustu s dvojitým rámečkem a širokým prostrkáním. Stisk otiskne — malý posun a nepatrné natočení.',
    caveat:
      'Rotace se musí vypnout při prefers-reduced-motion a nesmí se používat všude, jinak to je gimmick.',
  },
  {
    key: 'ruled',
    label: 'Kartotéka',
    pitch:
      'Ostrá kartička: 2px inkoustový rám, uvnitř tenká přerušovaná linka. Stisk kartu zalije inkoustem.',
    caveat:
      'Nejblíž tomu, co už máš v outline variantě. Bezpečné, ale samo o sobě to není podpis.',
  },
  {
    key: 'notch',
    label: 'Uřízlý roh',
    pitch:
      'Tvarový podpis: dva protilehlé rohy uříznuté, žádný stín, plochá výplň. Stisk zvětší řez.',
    caveat:
      'Nejsilnější vlastní znak, ale musí se pak protáhnout i do karet a panelů, jinak vypadá jako nehoda.',
  },
  {
    key: 'underline',
    label: 'Podtržení',
    pitch:
      'Žádná krabice — jen text a silná linka pod ním. Stisk nechá inkoust vystoupat a zalít popisek. Nejvíc „čtenářská“ varianta.',
    caveat:
      'Slabý cíl pro palec, dokud se nezvětší plocha. Hodí se spíš na sekundární akce než na hlavní.',
  },
  {
    key: 'marker',
    label: 'Zvýrazňovač',
    batch: 2,
    pitch:
      'Žádná krabice — jen tah fixou pod popiskem, s roztřepenými konci a nerovným horním okrajem. Stisk tah rozšíří přes celé tlačítko a text zůstane ležet uvnitř.',
    caveat:
      'Tah kreslí ze světlého washe, takže primární a ghost varianta vypadají skoro stejně. Hierarchii pak musí nést velikost a umístění, ne barva.',
  },
  {
    key: 'keycap',
    label: 'Klávesa',
    batch: 2,
    pitch:
      'Čepička s vyklenutým vrškem sedí v lůžku. Stisk ji propadne o 5 px na doraz a lůžko zůstane stát — jediná varianta, kde je vidět, kam tlačítko dosedlo. Sedí k psacímu režimu.',
    caveat:
      'Nejbližší příbuzný dnešního liftu; na malém tlačítku se rozdíl může ztratit. Potřebuje kolem sebe ~8 px na lůžko, jinak koliduje se sousedem.',
  },
  {
    key: 'ticket',
    label: 'Jízdenka',
    batch: 2,
    pitch:
      'Perforace a útržek: dva výřezy s přerušovanou linkou mezi nimi. Stisk zakousne perforaci hlouběji a linku prošije natvrdo — jako když ti průvodčí štípne lístek.',
    caveat:
      'Maska ořezává i rámeček, takže kolem výřezů linka mizí. Útržek je navíc režie na krátký popisek — snese to jedna velká akce, ne čtyři odpovědi pod sebou.',
  },
  {
    key: 'sticker',
    label: 'Nálepka',
    batch: 2,
    pitch:
      'Papírový keyline kolem dokola, ohnutý roh a lehké natočení. Stisk nálepku přilepí: narovná ji, zmáčkne a stín splaskne.',
    caveat:
      'Natočení se musí vypnout při reduced-motion a nesmí být na víc tlačítkách vedle sebe — stránka pak vypadá rozsypaně. Keyline si bere 6 px okolo.',
  },
  {
    key: 'bleed',
    label: 'Rozpitý inkoust',
    batch: 2,
    pitch:
      'Klidný světlý blok, dokud se ho nedotkneš — pak se inkoust rozlije z místa dotyku přes celé tlačítko. Jediná varianta, která ví, kam jsi klikl.',
    caveat:
      'Potřebuje JS na předání souřadnice dotyku a rozliv trvá ~380 ms; při reduced-motion musí přepnout na okamžité obarvení. Bez pointeru (klávesnice) se rozlije ze středu.',
  },
  {
    key: 'stencil',
    label: 'Šablona',
    batch: 3,
    pitch:
      'Popisek je vystříkaný přes šablonu — svislé můstky přerušují písmena a prosvítá jimi barva bloku. Stisk můstky zalije a písmo se scelí.',
    caveat:
      'Můstky ukrajují čitelnost, hlavně u diakritiky a krátkých slov. Použitelné jen na verzálky a krátké popisky, nikdy na cizojazyčné slovo, které se člověk teprve učí.',
  },
  {
    key: 'riso',
    label: 'Soutisk (riso)',
    batch: 3,
    needsLabelAttr: true,
    pitch:
      'Dva průchody tiskem, které nesedí na sebe: druhá barva je posunutá o 2 px — u bloku i u písmen. Stisk soutisk srovná do rejstříku, jako by se stroj konečně trefil.',
    caveat:
      'Zdvojený popisek se kreslí z `data-label`, takže funguje jen na textovém tlačítku — ikona nebo React fragment se nezdvojí. A rozostření může vypadat jako vada renderu.',
  },
  {
    key: 'leaf',
    label: 'List ze sešitu',
    batch: 3,
    pitch:
      'Dvě děrované dírky a okrajová linka vlevo. Stisk stránku otočí v perspektivě kolem levé hrany — jediný tvar, který se hýbe do třetího rozměru.',
    caveat:
      'Perspektiva na dotykovém displeji rozmaže text během otáčení a musí zmizet při reduced-motion. Vlevo si bere 28 px, takže krátký popisek vypadá vycentrovaně blbě.',
  },
  {
    key: 'tear',
    label: 'Utržený okraj',
    batch: 3,
    pitch:
      'Spodní hrana je natržená, jako když vytrhneš stránku z bloku. Stisk trhlinu posune do jiné fáze — papír se dotrhne.',
    caveat:
      'Nepravidelná hrana znamená nepravidelný dotykový cíl a spodních ~10 px je jen ozdoba. Nesmí stát ve sloupci nad sebe, jinak to vypadá jako rozpadlá stránka.',
  },
  {
    key: 'hold',
    label: 'Přidržet',
    batch: 3,
    pitch:
      'Ne tvar, ale chování: potvrzení se musí podržet. Nálev přejede za 900 ms zleva doprava a teprve pak naskočí prstenec „hotovo“. Náhrada za potvrzovací dialog u mazání.',
    caveat:
      'Vizuál je čistě CSS, ale skutečné potvrzení musí odpálit JS na stejném čase — jinak lže. A nesmí se použít nikde, kde je akce vratná; jinak jen zdržuje.',
  },
  {
    key: 'circle',
    label: 'Zakroužkování',
    batch: 3,
    needsAnnotation: true,
    pitch:
      'Holý text, dokud na něj nesáhneš — pak kolem popisku dokreslí ručně tažená elipsa s přetahem, jako když učitel zakroužkuje správnou odpověď. Při najetí se pero rozjede, stisk smyčku dotáhne.',
    caveat:
      'Nejslabší dotykový cíl z celé sady a smyčka přetahuje přes okraj, takže potřebuje 10 px vzduchu kolem. Elipsa se kreslí v SVG uvnitř tlačítka — jediná varianta, která si žádá vlastní značku.',
  },
];

export const PERSONALITY_BY_KEY: Record<PersonalityKey, Personality> =
  PERSONALITIES.reduce(
    (acc, p) => ({ ...acc, [p.key]: p }),
    {} as Record<PersonalityKey, Personality>,
  );

export type Tone = 'primary' | 'secondary' | 'ghost';

/** The six skin variables every personality reads. */
export type Skin = {
  '--btn-bg': string;
  '--btn-fg': string;
  '--btn-line': string;
  '--btn-bg-press': string;
  '--btn-fg-press': string;
  '--btn-line-press': string;
  /** An ink that stays legible on paper whatever the tone is. */
  '--btn-ink': string;
  /** Pale wash for highlighter-style fills that carry `--btn-ink` on top. */
  '--btn-mark': string;
  /** The sheet itself, for keylines that cut the button out of the page. */
  '--btn-paper': string;
};

/* Handles, not values. The dev page publishes the palette as `--ds-*`
   variables so the colour picker in section 1 repaints every personality
   without any of them re-rendering; the defaults live in `tokens.ts`. */
const PAPER = 'var(--ds-paper)';
const INK = 'var(--ds-ink)';
const PAPER_EDGE = 'var(--ds-paper-edge)';
/** The neutral tone's highlighter stroke — a warm marker, not an accent one. */
const PAPER_MARK = 'var(--ds-paper-mark)';

export function skinFor(accent: Accent, tone: Tone): Skin {
  if (tone === 'primary') {
    return {
      '--btn-bg': accent.base,
      '--btn-fg': PAPER,
      '--btn-line': accent.deep,
      '--btn-bg-press': accent.deep,
      '--btn-fg-press': PAPER,
      '--btn-line-press': accent.deep,
      '--btn-ink': accent.deep,
      '--btn-mark': accent.wash,
      '--btn-paper': PAPER,
    };
  }
  if (tone === 'secondary') {
    return {
      '--btn-bg': PAPER,
      '--btn-fg': INK,
      '--btn-line': PAPER_EDGE,
      '--btn-bg-press': accent.wash,
      '--btn-fg-press': accent.deep,
      '--btn-line-press': accent.base,
      '--btn-ink': INK,
      '--btn-mark': PAPER_MARK,
      '--btn-paper': PAPER,
    };
  }
  return {
    '--btn-bg': 'transparent',
    '--btn-fg': accent.base,
    '--btn-line': accent.base,
    '--btn-bg-press': accent.base,
    '--btn-fg-press': PAPER,
    '--btn-line-press': accent.deep,
    '--btn-ink': accent.deep,
    '--btn-mark': accent.wash,
    '--btn-paper': PAPER,
  };
}

/**
 * The whole button language as one stylesheet. It lives in a string (rendered
 * into a `<style>` tag by the dev page) because the personalities need real
 * `:hover` / `:active` states while their colours arrive as inline variables —
 * something Tailwind's static utilities cannot express for a runtime-chosen
 * accent.
 */
export const BUTTON_CSS = `
.ds-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 22px;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
  text-align: center;
  border: 0;
  background: none;
  color: var(--btn-fg);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 140ms ease-out,
    color 140ms ease-out,
    box-shadow 140ms ease-out,
    transform 140ms ease-out,
    outline-offset 140ms ease-out,
    clip-path 140ms ease-out;
}

/* Every personality that paints a layer of its own (marker, bleed) puts it in
   a pseudo-element, so the label has to keep its own stacking context. */
.ds-btn__label {
  position: relative;
  z-index: 1;
  transition:
    transform 140ms ease-out,
    color 140ms ease-out;
}

.ds-btn:disabled {
  opacity: 0.38;
  cursor: default;
}

.ds-btn:focus-visible {
  outline: 2px solid var(--btn-line);
  outline-offset: 3px;
}

/* ── 1. Lift — today's button, and Duolingo's ────────────────── */
.ds-btn--duo {
  border-radius: 14px;
  background: var(--btn-bg);
  box-shadow: 0 4px 0 var(--btn-line);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 900;
}
.ds-btn--duo:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 0 var(--btn-line);
}
.ds-btn--duo:active:not(:disabled),
.ds-btn--duo[data-pressed='true']:not(:disabled) {
  transform: translateY(3px);
  box-shadow: none;
  background: var(--btn-bg-press);
  color: var(--btn-fg-press);
}

/* ── 2. Letterpress — the press sinks into the sheet ─────────── */
.ds-btn--letterpress {
  border-radius: 12px;
  background: var(--btn-bg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    inset 0 0 0 1px var(--btn-line),
    0 1px 2px rgba(42, 34, 24, 0.22);
}
.ds-btn--letterpress:hover:not(:disabled) {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.36),
    inset 0 0 0 1px var(--btn-line-press),
    0 2px 5px rgba(42, 34, 24, 0.26);
}
.ds-btn--letterpress:active:not(:disabled),
.ds-btn--letterpress[data-pressed='true']:not(:disabled) {
  background: var(--btn-bg-press);
  color: var(--btn-fg-press);
  box-shadow:
    inset 0 3px 7px rgba(42, 34, 24, 0.42),
    inset 0 0 0 1px var(--btn-line-press);
}
.ds-btn--letterpress:active:not(:disabled) > .ds-btn__label,
.ds-btn--letterpress[data-pressed='true']:not(:disabled) > .ds-btn__label {
  transform: translateY(1px);
}

/* ── 3. Stamp — an ink block inside its own frame ────────────── */
.ds-btn--stamp {
  /* The frame lives outside the box, so the button has to reserve room for it
     or it collides with whatever sits next to it. */
  margin: 6px;
  border-radius: 3px;
  background: var(--btn-bg);
  outline: 2px solid var(--btn-line);
  outline-offset: 3px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-weight: 800;
}
.ds-btn--stamp:hover:not(:disabled) {
  outline-offset: 5px;
}
.ds-btn--stamp:active:not(:disabled),
.ds-btn--stamp[data-pressed='true']:not(:disabled) {
  background: var(--btn-bg-press);
  color: var(--btn-fg-press);
  outline-color: var(--btn-line-press);
  outline-offset: 1px;
  transform: translate(1px, 1px) rotate(-0.5deg);
}

/* ── 4. Ruled — an index card that floods with ink ───────────── */
/* Both rules are drawn from currentColor, not from --btn-line: an index
   card's ruling has to read against whatever the card is filled with, and a
   deep-accent line on a base-accent fill disappeared entirely. */
.ds-btn--ruled {
  border-radius: 2px;
  background: var(--btn-bg);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, currentColor 72%, transparent);
}
.ds-btn--ruled::before {
  content: '';
  position: absolute;
  inset: 5px;
  border: 1px dashed color-mix(in srgb, currentColor 42%, transparent);
  pointer-events: none;
}
.ds-btn--ruled:hover:not(:disabled)::before {
  inset: 3px;
}
.ds-btn--ruled:active:not(:disabled),
.ds-btn--ruled[data-pressed='true']:not(:disabled) {
  background: var(--btn-bg-press);
  color: var(--btn-fg-press);
}

/* ── 5. Notch — the shape signature ─────────────────────────── */
.ds-btn--notch {
  border-radius: 0;
  background: var(--btn-bg);
  box-shadow: inset 0 0 0 2px var(--btn-line);
  clip-path: polygon(
    0 0,
    calc(100% - 14px) 0,
    100% 14px,
    100% 100%,
    14px 100%,
    0 calc(100% - 14px)
  );
}
.ds-btn--notch:hover:not(:disabled) {
  box-shadow: inset 0 0 0 2px var(--btn-line-press);
}
.ds-btn--notch:active:not(:disabled),
.ds-btn--notch[data-pressed='true']:not(:disabled) {
  background: var(--btn-bg-press);
  color: var(--btn-fg-press);
  clip-path: polygon(
    0 0,
    calc(100% - 22px) 0,
    100% 22px,
    100% 100%,
    22px 100%,
    0 calc(100% - 22px)
  );
}

/* ── 6. Underline — the ink rises and floods the label ───────── */
.ds-btn--underline {
  border-radius: 4px 4px 0 0;
  background: transparent;
  color: var(--btn-line);
  box-shadow: inset 0 -3px 0 var(--btn-line);
  transition:
    box-shadow 200ms cubic-bezier(0.22, 1, 0.36, 1),
    color 140ms ease-out;
}
.ds-btn--underline:hover:not(:disabled) {
  box-shadow: inset 0 -7px 0 var(--btn-line);
}
.ds-btn--underline:active:not(:disabled),
.ds-btn--underline[data-pressed='true']:not(:disabled) {
  color: var(--btn-fg-press);
  box-shadow: inset 0 -80px 0 var(--btn-line-press);
}

/* ── 7. Marker — a felt-tip stroke instead of a box ──────────── */
.ds-btn--marker {
  border-radius: 3px;
  background: transparent;
  color: var(--btn-ink);
  font-weight: 800;
}
.ds-btn--marker::before {
  content: '';
  position: absolute;
  left: 2px;
  right: 2px;
  top: 14%;
  bottom: 10%;
  background: var(--btn-mark);
  /* A felt tip does not stop square: the ends are ragged and the stroke runs
     slightly uphill. The numbers are deliberately uneven. */
  clip-path: polygon(0.8% 12%, 98.5% 0%, 100% 82%, 99% 100%, 1.6% 94%, 0% 26%);
  transition:
    background-color 140ms ease-out,
    inset 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
.ds-btn--marker:hover:not(:disabled)::before {
  top: 6%;
  bottom: 4%;
}
.ds-btn--marker:active:not(:disabled),
.ds-btn--marker[data-pressed='true']:not(:disabled) {
  color: var(--btn-fg-press);
}
.ds-btn--marker:active:not(:disabled)::before,
.ds-btn--marker[data-pressed='true']:not(:disabled)::before {
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--btn-bg-press);
}

/* ── 8. Keycap — a dished cap that bottoms out in its socket ─── */
/* The socket is drawn by ::before and has to stay put while the cap travels,
   so it gets an equal and opposite translate on press. */
.ds-btn--keycap {
  margin: 3px 3px 9px;
  border-radius: 11px 11px 14px 14px;
  background-color: var(--btn-bg);
  background-image: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.32),
    rgba(255, 255, 255, 0) 46%,
    rgba(42, 34, 24, 0.12)
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.42),
    inset 0 -3px 5px -2px rgba(42, 34, 24, 0.3),
    0 5px 0 var(--btn-line),
    0 8px 12px -5px rgba(42, 34, 24, 0.4);
}
.ds-btn--keycap::before {
  content: '';
  position: absolute;
  inset: -3px -4px -9px;
  border-radius: 15px;
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--btn-line) 45%, transparent);
  transition: transform 140ms ease-out;
  pointer-events: none;
}
.ds-btn--keycap:hover:not(:disabled) {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    inset 0 -3px 5px -2px rgba(42, 34, 24, 0.3),
    0 6px 0 var(--btn-line),
    0 10px 14px -5px rgba(42, 34, 24, 0.42);
  transform: translateY(-1px);
}
.ds-btn--keycap:active:not(:disabled),
.ds-btn--keycap[data-pressed='true']:not(:disabled) {
  transform: translateY(5px);
  background-color: var(--btn-bg-press);
  color: var(--btn-fg-press);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    inset 0 -1px 3px rgba(42, 34, 24, 0.32),
    0 0 0 var(--btn-line),
    0 1px 2px rgba(42, 34, 24, 0.3);
}
.ds-btn--keycap:active:not(:disabled)::before,
.ds-btn--keycap[data-pressed='true']:not(:disabled)::before {
  transform: translateY(-5px);
}

/* ── 9. Ticket — perforated stub, punched on press ───────────── */
.ds-btn--ticket {
  --tk-notch: 8px;
  --tk-stub: 34px;
  padding-left: calc(var(--tk-stub) + 14px);
  border-radius: 5px;
  background: var(--btn-bg);
  box-shadow: inset 0 0 0 1.5px var(--btn-line);
  -webkit-mask-image:
    radial-gradient(circle var(--tk-notch) at var(--tk-stub) 0, transparent 98%, #000 100%),
    radial-gradient(circle var(--tk-notch) at var(--tk-stub) 100%, transparent 98%, #000 100%);
  mask-image:
    radial-gradient(circle var(--tk-notch) at var(--tk-stub) 0, transparent 98%, #000 100%),
    radial-gradient(circle var(--tk-notch) at var(--tk-stub) 100%, transparent 98%, #000 100%);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}
.ds-btn--ticket::before {
  content: '';
  position: absolute;
  left: var(--tk-stub);
  top: 9px;
  bottom: 9px;
  border-left: 1.5px dashed color-mix(in srgb, currentColor 42%, transparent);
  pointer-events: none;
}
.ds-btn--ticket:hover:not(:disabled) {
  --tk-notch: 10px;
}
.ds-btn--ticket:active:not(:disabled),
.ds-btn--ticket[data-pressed='true']:not(:disabled) {
  --tk-notch: 12px;
  background: var(--btn-bg-press);
  color: var(--btn-fg-press);
}
.ds-btn--ticket:active:not(:disabled)::before,
.ds-btn--ticket[data-pressed='true']:not(:disabled)::before {
  border-left-style: solid;
  border-left-color: color-mix(in srgb, currentColor 85%, transparent);
}

/* ── 10. Sticker — a peeled label that flattens when stuck ───── */
.ds-btn--sticker {
  margin: 6px;
  border-radius: 16px;
  background: var(--btn-bg);
  transform: rotate(-1deg);
  box-shadow:
    0 0 0 4px var(--btn-paper),
    0 0 0 5px color-mix(in srgb, var(--btn-line) 45%, transparent),
    0 9px 16px -7px rgba(42, 34, 24, 0.5);
}
.ds-btn--sticker::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  border-bottom-right-radius: 16px;
  background: linear-gradient(
    315deg,
    var(--btn-paper) 0 46%,
    color-mix(in srgb, var(--btn-line) 60%, transparent) 48%,
    transparent 52%
  );
  transition:
    width 160ms ease-out,
    height 160ms ease-out;
  pointer-events: none;
}
.ds-btn--sticker:hover:not(:disabled) {
  transform: rotate(-1deg) translateY(-2px) scale(1.015);
  box-shadow:
    0 0 0 4px var(--btn-paper),
    0 0 0 5px color-mix(in srgb, var(--btn-line) 45%, transparent),
    0 14px 20px -8px rgba(42, 34, 24, 0.5);
}
.ds-btn--sticker:hover:not(:disabled)::after {
  width: 24px;
  height: 24px;
}
.ds-btn--sticker:active:not(:disabled),
.ds-btn--sticker[data-pressed='true']:not(:disabled) {
  transform: rotate(0deg) scale(0.985);
  background: var(--btn-bg-press);
  color: var(--btn-fg-press);
  box-shadow:
    0 0 0 4px var(--btn-paper),
    0 0 0 5px color-mix(in srgb, var(--btn-line-press) 55%, transparent),
    0 2px 4px -2px rgba(42, 34, 24, 0.45);
}
.ds-btn--sticker:active:not(:disabled)::after,
.ds-btn--sticker[data-pressed='true']:not(:disabled)::after {
  width: 9px;
  height: 9px;
}

/* ── 11. Bleed — ink spreads from where the thumb landed ─────── */
/* --btn-px / --btn-py are written by the dev page on pointerdown; without a
   pointer (keyboard activation) they fall back to the centre. */
.ds-btn--bleed {
  border-radius: 10px;
  overflow: hidden;
  background: var(--btn-mark);
  color: var(--btn-ink);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--btn-line) 65%, transparent);
}
.ds-btn--bleed::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--btn-bg-press);
  clip-path: circle(0 at var(--btn-px, 50%) var(--btn-py, 50%));
  transition: clip-path 380ms cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}
.ds-btn--bleed:hover:not(:disabled)::before {
  clip-path: circle(18px at var(--btn-px, 50%) var(--btn-py, 50%));
}
.ds-btn--bleed:active:not(:disabled),
.ds-btn--bleed[data-pressed='true']:not(:disabled) {
  color: var(--btn-fg-press);
}
.ds-btn--bleed:active:not(:disabled)::before,
.ds-btn--bleed[data-pressed='true']:not(:disabled)::before {
  clip-path: circle(150% at var(--btn-px, 50%) var(--btn-py, 50%));
}

/* ── 12. Stencil — the label sprayed through a cut sheet ─────── */
.ds-btn--stencil {
  border-radius: 6px;
  background: var(--btn-bg);
  box-shadow: inset 0 0 0 2px var(--btn-line);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 900;
}
/* The bridges are a mask on the label, so the gaps show the fill underneath —
   a real stencil, not a striped text colour. */
.ds-btn--stencil > .ds-btn__label {
  -webkit-mask-image: repeating-linear-gradient(
    92deg,
    #000 0 12px,
    transparent 12px 15px
  );
  mask-image: repeating-linear-gradient(92deg, #000 0 12px, transparent 12px 15px);
}
.ds-btn--stencil:hover:not(:disabled) {
  box-shadow: inset 0 0 0 2px var(--btn-line-press);
}
.ds-btn--stencil:active:not(:disabled),
.ds-btn--stencil[data-pressed='true']:not(:disabled) {
  background: var(--btn-bg-press);
  color: var(--btn-fg-press);
}
/* Pressed, the paint fills the bridges in and the word closes up. */
.ds-btn--stencil:active:not(:disabled) > .ds-btn__label,
.ds-btn--stencil[data-pressed='true']:not(:disabled) > .ds-btn__label {
  -webkit-mask-image: none;
  mask-image: none;
}

/* ── 13. Riso — two passes that miss register until pressed ──── */
.ds-btn--riso {
  border-radius: 8px;
  background: var(--btn-mark);
  color: var(--btn-ink);
  box-shadow:
    3px 3px 0 var(--btn-line),
    inset 0 0 0 1.5px var(--btn-ink);
}
/* The second impression of the label. It is drawn from data-label, which the
   dev page only sets when the child is a plain string. */
.ds-btn--riso .ds-btn__label::after {
  content: attr(data-label);
  position: absolute;
  left: 0;
  top: 0;
  z-index: -1;
  color: var(--btn-line);
  transform: translate(2px, 2px);
  mix-blend-mode: multiply;
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}
.ds-btn--riso:hover:not(:disabled) {
  box-shadow:
    5px 5px 0 var(--btn-line),
    inset 0 0 0 1.5px var(--btn-ink);
}
.ds-btn--riso:hover:not(:disabled) .ds-btn__label::after {
  transform: translate(4px, 4px);
}
.ds-btn--riso:active:not(:disabled),
.ds-btn--riso[data-pressed='true']:not(:disabled) {
  background: var(--btn-bg-press);
  color: var(--btn-fg-press);
  box-shadow:
    0 0 0 0 var(--btn-line),
    inset 0 0 0 1.5px var(--btn-line-press);
}
.ds-btn--riso:active:not(:disabled) .ds-btn__label::after,
.ds-btn--riso[data-pressed='true']:not(:disabled) .ds-btn__label::after {
  transform: translate(0, 0);
}

/* ── 14. Leaf — a punched page that turns on its spine ───────── */
.ds-btn--leaf {
  padding-left: 30px;
  border-radius: 2px 11px 11px 2px;
  background: var(--btn-bg);
  box-shadow: inset 0 0 0 1.5px var(--btn-line);
  transform-origin: left center;
  -webkit-mask-image:
    radial-gradient(circle 4.5px at 12px 27%, transparent 96%, #000 100%),
    radial-gradient(circle 4.5px at 12px 73%, transparent 96%, #000 100%);
  mask-image:
    radial-gradient(circle 4.5px at 12px 27%, transparent 96%, #000 100%),
    radial-gradient(circle 4.5px at 12px 73%, transparent 96%, #000 100%);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}
.ds-btn--leaf::before {
  content: '';
  position: absolute;
  left: 23px;
  top: 0;
  bottom: 0;
  border-left: 1.5px solid color-mix(in srgb, currentColor 28%, transparent);
  pointer-events: none;
}
.ds-btn--leaf:hover:not(:disabled) {
  transform: perspective(700px) rotateY(-4deg);
}
.ds-btn--leaf:active:not(:disabled),
.ds-btn--leaf[data-pressed='true']:not(:disabled) {
  transform: perspective(700px) rotateY(-13deg);
  background: var(--btn-bg-press);
  color: var(--btn-fg-press);
}

/* ── 15. Tear — a page ripped out of the pad ─────────────────── */
/* The jag eats the bottom ~10px, so the label gets that back as padding. */
.ds-btn--tear {
  min-height: 62px;
  padding-bottom: 10px;
  border-radius: 3px 3px 0 0;
  background: var(--btn-bg);
  clip-path: polygon(
    0 0,
    100% 0,
    100% 82%,
    92% 91%,
    85% 80%,
    77% 93%,
    69% 83%,
    61% 95%,
    53% 84%,
    45% 96%,
    37% 85%,
    29% 94%,
    21% 83%,
    13% 93%,
    6% 84%,
    0 93%
  );
}
.ds-btn--tear:hover:not(:disabled) {
  transform: translateY(-1px);
}
.ds-btn--tear:active:not(:disabled),
.ds-btn--tear[data-pressed='true']:not(:disabled) {
  background: var(--btn-bg-press);
  color: var(--btn-fg-press);
  /* The same rip, one phase further along — the paper gives way. */
  clip-path: polygon(
    0 0,
    100% 0,
    100% 88%,
    94% 78%,
    86% 92%,
    79% 81%,
    71% 94%,
    63% 82%,
    55% 93%,
    47% 83%,
    39% 95%,
    31% 84%,
    23% 92%,
    15% 81%,
    7% 93%,
    0 84%
  );
}

/* ── 16. Hold — the press has to be held to count ────────────── */
.ds-btn--hold {
  border-radius: 999px;
  overflow: hidden;
  background: var(--btn-mark);
  color: var(--btn-ink);
  box-shadow: inset 0 0 0 2px var(--btn-line);
}
.ds-btn--hold::before {
  content: '';
  position: absolute;
  inset: 0;
  /* A tint rather than the full ink, so the label stays readable the whole
     way across instead of going dark under its own progress bar. */
  background: color-mix(in srgb, var(--btn-bg-press) 34%, var(--btn-paper));
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 200ms ease-out;
  pointer-events: none;
}
.ds-btn--hold::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px;
  box-shadow: inset 0 0 0 3px var(--btn-line-press);
  opacity: 0;
  pointer-events: none;
}
.ds-btn--hold:active:not(:disabled)::before,
.ds-btn--hold[data-pressed='true']:not(:disabled)::before {
  transform: scaleX(1);
  transition: transform 900ms linear;
}
/* The ring is the commit: it can only appear once the sweep has finished. */
.ds-btn--hold:active:not(:disabled)::after,
.ds-btn--hold[data-pressed='true']:not(:disabled)::after {
  opacity: 1;
  transition: opacity 140ms linear 900ms;
}

/* ── 17. Circle — a pen loops around the answer ──────────────── */
.ds-btn--circle {
  padding: 0 26px;
  border-radius: 4px;
  background: transparent;
  color: var(--btn-ink);
  overflow: visible;
}
.ds-btn__annot {
  position: absolute;
  left: -8px;
  top: -6px;
  width: calc(100% + 16px);
  height: calc(100% + 12px);
  color: var(--btn-line-press);
  overflow: visible;
  pointer-events: none;
}
.ds-btn__annot path {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  /* No vector-effect: with preserveAspectRatio="none" the box is squashed
     unevenly, and a non-scaling stroke would put the dash maths in a different
     space than pathLength, so the loop could stop drawing short of itself.
     The cost is a stroke that thickens on wide buttons — which on a pen loop
     reads as pressure rather than as a bug.
     pathLength="1" on the element is what makes the dash maths independent of
     the button's width, which changes with the label. */
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  transition: stroke-dashoffset 460ms cubic-bezier(0.32, 0.9, 0.4, 1);
}
.ds-btn--circle:hover:not(:disabled) .ds-btn__annot path {
  stroke-dashoffset: 0.62;
}
.ds-btn--circle:active:not(:disabled) .ds-btn__annot path,
.ds-btn--circle[data-pressed='true']:not(:disabled) .ds-btn__annot path {
  stroke-dashoffset: 0;
}
.ds-btn--circle:disabled .ds-btn__annot {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .ds-btn,
  .ds-btn > .ds-btn__label {
    transition-duration: 1ms;
  }
  .ds-btn--stamp:active:not(:disabled),
  .ds-btn--stamp[data-pressed='true']:not(:disabled) {
    transform: none;
  }
  .ds-btn--sticker,
  .ds-btn--sticker:hover:not(:disabled),
  .ds-btn--sticker:active:not(:disabled),
  .ds-btn--sticker[data-pressed='true']:not(:disabled) {
    transform: none;
  }
  .ds-btn--marker::before,
  .ds-btn--bleed::before,
  .ds-btn--sticker::after,
  .ds-btn--riso .ds-btn__label::after,
  .ds-btn__annot path {
    transition-duration: 1ms;
  }
  /* The page turn is the one effect that has no quiet version — drop it. */
  .ds-btn--leaf:hover:not(:disabled),
  .ds-btn--leaf:active:not(:disabled),
  .ds-btn--leaf[data-pressed='true']:not(:disabled) {
    transform: none;
  }
  /* Hold still has to take 900 ms — it is a safety delay, not decoration. */
  .ds-btn--hold:active:not(:disabled)::before,
  .ds-btn--hold[data-pressed='true']:not(:disabled)::before {
    transition-duration: 900ms;
  }
}
`;
