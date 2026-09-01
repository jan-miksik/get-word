'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import type { Accent } from './tokens';

/**
 * Ten ways for a button to get smaller under a thumb.
 *
 * Section 2 asks what shape a button is; this asks the narrower question that
 * came out of it — the app likes the press-shrink, so *which* shrink. Every
 * variant below draws the same slab (52 px, radius 14, one accent) and changes
 * nothing but the physics, so the only thing on trial is the movement.
 *
 * Two knobs are shared by all of them and deliberately global: how far it
 * shrinks (`--pr-scale`) and how fast (`--pr-speed`, a slow-motion multiplier
 * so the timing differences are visible at all). Amount is not a personality —
 * if two variants only differ by a number, that number belongs on the slider.
 *
 * Nothing here is wired into the app.
 */

export type PressKey =
  | 'flat'
  | 'squish'
  | 'snap'
  | 'spring'
  | 'label'
  | 'origin'
  | 'inner'
  | 'paper'
  | 'hold'
  | 'radius';

export type PressVariant = {
  key: PressKey;
  label: string;
  pitch: string;
  /** Honest note on what this costs. */
  caveat: string;
};

export const PRESS_VARIANTS: PressVariant[] = [
  {
    key: 'flat',
    label: 'Rovnoměrné',
    pitch:
      'Základ, na kterém stojí všechny ostatní: celé tlačítko se stejnoměrně zmenší a stejně rychle se vrátí. Nic si nevymýšlí, funguje na kulatém i hranatém tvaru.',
    caveat:
      'Je to výchozí stav prohlížeče v hezčím kabátě — samo o sobě to není podpis aplikace.',
  },
  {
    key: 'squish',
    label: 'Zmáčknutí',
    pitch:
      'Nezmenší se do všech stran stejně: sedne si na výšku a nepatrně se roztáhne do šířky, jako by pod prstem povolil materiál. Nejvíc „hmatatelná“ varianta.',
    caveat:
      'Deformuje písmo. Na dlouhém popisku je to vidět, na dvou slovech ne — a přes 6 % je to gumové, ne papírové.',
  },
  {
    key: 'snap',
    label: 'Doraz',
    pitch:
      'Dolů okamžitě a natvrdo, zpátky pomalu. Asymetrie je celý trik — stisk se ohlásí dřív, než ho stihneš zaregistrovat, návrat nikam nespěchá.',
    caveat:
      'Pomalý návrat drží tlačítko „obsazené“ ještě chvíli po zvednutí prstu. Při rychlém klikání za sebou to zaostává.',
  },
  {
    key: 'spring',
    label: 'Pružina',
    pitch:
      'Návrat přestřelí přes klidový stav a doladí se zpátky. Nejvíc živé ze všech — tlačítko vypadá, že do něj někdo strčil.',
    caveat:
      'Přestřel je zábavný jednou. Na hlavním tlačítku, které za sezení zmáčkneš stokrát, začne být upovídaný.',
  },
  {
    key: 'label',
    label: 'Krabice ano, písmo ne',
    pitch:
      'Plocha se zmenší, popisek si dopočítá opačné měřítko a zůstane přesně tak velký, jak byl. Pohyb je vidět na okrajích, text se nehne a nerozmaže.',
    caveat:
      'Vyžaduje vlastní vrstvu pro popisek. Na tlačítku, které je z 90 % text, je ten pohyb skoro neviditelný.',
  },
  {
    key: 'origin',
    label: 'Ke prstu',
    pitch:
      'Nezmenšuje se ke svému středu, ale k místu, kam jsi ťukl. Na širokém tlačítku přes celou obrazovku je to jediná varianta, kde stisk vypadá, že reaguje zrovna na tebe.',
    caveat:
      'Na klávesnici nemá kam se zmenšit — musí spadnout zpátky do středu, takže se chová jinak podle vstupu.',
  },
  {
    key: 'inner',
    label: 'Výplň, ne plocha',
    pitch:
      'Zmenší se jen barevná výplň uvnitř; samotné tlačítko drží svůj rozměr. Prst tak neztratí cíl pod sebou — jediná varianta, ze které se nedá vyklouznout.',
    caveat:
      'Potřebuje vrstvu navíc a klidový stav vypadá stejně jako u ostatních, takže se prodává až na tom, co se nestane.',
  },
  {
    key: 'paper',
    label: 'Do papíru',
    pitch:
      'Zmenšení plus pokles: stín se složí, tlačítko si sedne o pixel níž a ztmavne. Souzní s letterpress jazykem ze sekce 2 — nic neskáče, všechno se zapouští.',
    caveat:
      'Stín je nejdražší část animace ze všech tady. Na slabém Androidu to je jediná varianta, která umí ztratit snímky.',
  },
  {
    key: 'hold',
    label: 'Dokud držíš',
    pitch:
      'Zmenšuje se dál, čím déle držíš, až na doraz. Zdarma tím vzniká náznak podržení — tlačítko samo napoví, že pod ním něco je (žebřík intervalů z návrhu 9).',
    caveat:
      'Slibuje akci navíc. Tam, kde po podržení nic nepřijde, je to lež — takže tohle nesmí být výchozí chování všech tlačítek.',
  },
  {
    key: 'radius',
    label: 'Stažené rohy',
    pitch:
      'Kromě měřítka se stáhnou i rohy — z 14 px na 6 px. Tlačítko pod tlakem ztuhne místo aby změklo. Nejtišší ze všech, ale oko to zaregistruje.',
    caveat:
      'Poloměr se neanimuje na kompozitoru jako transform, takže se to počítá při každém snímku. Na jednom tlačítku dobré, na mřížce možností ne.',
  },
];

/* ------------------------------------------------------------ button -- */

/** Progressive shrink for `hold`: how far it sinks and over how long. */
const HOLD_FLOOR = 0.9;
const HOLD_MS = 900;

function PressButton({
  variant,
  tone = 'primary',
  frozen,
  children,
}: {
  variant: PressKey;
  tone?: 'primary' | 'secondary';
  frozen: boolean;
  children: ReactNode;
}) {
  const [down, setDown] = useState(false);
  const [hold, setHold] = useState(1);
  const rafRef = useRef(0);

  const pressed = down || frozen;

  /* `hold` is the one variant CSS cannot state on its own — the scale is a
     function of how long the finger has been there, so a frame loop drives it
     and the transition is switched off while it runs. */
  useEffect(() => {
    if (variant !== 'hold' || !pressed) return undefined;
    let start: number | null = null;
    const step = (ts: number) => {
      start ??= ts;
      const p = Math.min((ts - start) / HOLD_MS, 1);
      setHold(1 - (1 - HOLD_FLOOR) * p);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [variant, pressed]);

  /* `origin` shrinks towards the touch point, so the coordinate goes straight
     onto the node — a re-render per pointerdown for a paint hint would be
     silly, and the value has to be there before the transition starts. */
  const trackOrigin = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (variant !== 'origin') return;
      const el = event.currentTarget;
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--pr-ox', `${((event.clientX - rect.left) / rect.width) * 100}%`);
      el.style.setProperty('--pr-oy', `${((event.clientY - rect.top) / rect.height) * 100}%`);
    },
    [variant],
  );

  const holdStyle: CSSProperties =
    variant === 'hold'
      ? pressed
        ? { transform: `scale(${hold})`, transition: 'none' }
        : { transform: 'scale(1)' }
      : {};

  return (
    <button
      type="button"
      data-press={variant}
      data-down={pressed ? 'true' : undefined}
      data-tone={tone}
      onPointerDown={(e) => {
        trackOrigin(e);
        /* The frame loop's first tick is a frame away, so the hold has to be
           rewound here or the next press starts where the last one ended. */
        setHold(1);
        setDown(true);
      }}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => setDown(false)}
      onPointerCancel={() => setDown(false)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') setDown(true);
      }}
      onKeyUp={() => setDown(false)}
      className="ds-press"
      style={holdStyle}
    >
      <span className="ds-press__label">{children}</span>
    </button>
  );
}

/* ------------------------------------------------------------- cards -- */

function VariantCard({
  variant,
  frozen,
  frame,
  picked,
  onPick,
}: {
  variant: PressVariant;
  frozen: boolean;
  frame: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'var(--ds-paper)',
        boxShadow: picked
          ? 'inset 0 0 0 2px var(--pr-bg)'
          : 'inset 0 0 0 1px var(--ds-paper-edge)',
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[1.02rem] font-black leading-tight">{variant.label}</h3>
        <button
          type="button"
          onClick={onPick}
          className="shrink-0 text-[0.75rem] font-bold underline"
          style={{ color: 'var(--pr-bg)' }}
        >
          {picked ? 'v kartě ↓' : 'zkusit v kartě ↓'}
        </button>
      </div>

      <p className="mt-1 text-[0.85rem] leading-relaxed" style={{ color: 'var(--ds-ink-soft)' }}>
        {variant.pitch}
      </p>

      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <span className="ds-press-wrap" data-frame={frame ? 'true' : undefined}>
          <PressButton variant={variant.key} frozen={frozen}>
            Pokračovat →
          </PressButton>
        </span>
        <span className="ds-press-wrap" data-frame={frame ? 'true' : undefined}>
          <PressButton variant={variant.key} tone="secondary" frozen={frozen}>
            die Verabredung
          </PressButton>
        </span>
      </div>

      <p className="mt-2.5 text-[0.8rem] leading-relaxed" style={{ color: 'var(--ds-brick-deep)' }}>
        ⚠ {variant.caveat}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ section -- */

export function PressVariantsSection({ accent }: { accent: Accent }) {
  const [amount, setAmount] = useState(0.96);
  const [slow, setSlow] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [frame, setFrame] = useState(false);
  const [still, setStill] = useState(false);
  const [picked, setPicked] = useState<PressKey>('flat');

  const rootStyle = {
    '--pr-scale': amount,
    '--pr-speed': slow ? 5 : 1,
    '--pr-bg': accent.base,
    '--pr-bg-deep': accent.deep,
    '--pr-wash': accent.wash,
  } as CSSProperties;

  return (
    <div className="ds-press-root" data-still={still ? 'true' : undefined} style={rootStyle}>
      <div
        className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl p-4"
        style={{ background: 'var(--ds-paper)', boxShadow: 'inset 0 0 0 1px var(--ds-paper-edge)' }}
      >
        <label className="flex items-center gap-3 text-[0.88rem] font-bold">
          <span className="whitespace-nowrap">zmenšení</span>
          <input
            type="range"
            min={0.86}
            max={1}
            step={0.005}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-40"
          />
          <span className="font-mono text-[0.8rem]" style={{ color: 'var(--ds-ink-soft)' }}>
            {(amount * 100).toFixed(1).replace('.', ',')} %
          </span>
        </label>

        <label className="flex items-center gap-2 text-[0.88rem] font-bold">
          <input type="checkbox" checked={slow} onChange={(e) => setSlow(e.target.checked)} />
          zpomaleně (5×)
        </label>
        <label className="flex items-center gap-2 text-[0.88rem] font-bold">
          <input type="checkbox" checked={frozen} onChange={(e) => setFrozen(e.target.checked)} />
          zmrazit stisknutý stav
        </label>
        <label className="flex items-center gap-2 text-[0.88rem] font-bold">
          <input type="checkbox" checked={frame} onChange={(e) => setFrame(e.target.checked)} />
          vykreslit původní plochu dotyku
        </label>
        <label className="flex items-center gap-2 text-[0.88rem] font-bold">
          <input type="checkbox" checked={still} onChange={(e) => setStill(e.target.checked)} />
          bez pohybu (prefers-reduced-motion)
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {PRESS_VARIANTS.map((v) => (
          <VariantCard
            key={v.key}
            variant={v}
            frozen={frozen}
            frame={frame}
            picked={picked === v.key}
            onPick={() => setPicked(v.key)}
          />
        ))}
      </div>

      {/* One button in isolation is easy to like. A grid of four options plus a
          primary is where a shrink either reads as one system or as noise. */}
      <div className="mt-6 rounded-2xl p-4" style={{ background: 'var(--ds-paper)', boxShadow: 'inset 0 0 0 1px var(--ds-paper-edge)' }}>
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--ds-ink-soft)' }}>
          {PRESS_VARIANTS.find((v) => v.key === picked)?.label} — celá kartička
        </p>
        <p className="mt-1 text-[0.85rem] leading-relaxed" style={{ color: 'var(--ds-ink-soft)' }}>
          Stejná fyzika na čtyřech možnostech pod sebou a na hlavním tlačítku. Tady se pozná, jestli je pohyb podpis, nebo cukání.
        </p>
        <div className="mx-auto mt-4 w-full max-w-md">
          <div
            className="rounded-2xl p-5"
            style={{ background: 'var(--ds-paper)', boxShadow: 'inset 0 0 0 2px var(--ds-ink), 0 12px 30px rgba(42,34,24,0.16)' }}
          >
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ds-ink-soft)' }}>
              Vyber překlad
            </p>
            <p className="mt-2 text-[1.7rem] font-black leading-tight">schůzka</p>
            <div className="mt-5 grid gap-2.5">
              {['die Abfahrt', 'die Verabredung', 'die Umgebung', 'der Vorschlag'].map((o) => (
                <PressButton key={o} variant={picked} tone="secondary" frozen={false}>
                  {o}
                </PressButton>
              ))}
            </div>
            <div className="mt-5 grid">
              <PressButton variant={picked} frozen={false}>
                Pokračovat →
              </PressButton>
            </div>
          </div>
        </div>
      </div>

      <div
        className="mt-6 rounded-2xl p-5 text-[0.9rem] leading-relaxed"
        style={{ background: 'var(--ds-paper)', boxShadow: 'inset 0 0 0 1px var(--ds-paper-edge)' }}
      >
        <p className="font-bold">Co se při rozhodování musí vzít v potaz</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5" style={{ color: 'var(--ds-ink-soft)' }}>
          <li>
            <strong style={{ color: 'var(--ds-ink)' }}>Zmenšené tlačítko se zmenší i pro prst.</strong>{' '}
            <code>transform</code> mění i plochu, na kterou se dá ťuknout — u okraje tak stisk vypadne
            pod prstem, který se nehnul. Zapni „původní plochu dotyku“ a je to vidět. Proti tomu stojí
            jediná varianta: <em>Výplň, ne plocha</em>.
          </li>
          <li>
            <strong style={{ color: 'var(--ds-ink)' }}>Levné je jen měřítko.</strong>{' '}
            <code>transform</code> a <code>opacity</code> běží na kompozitoru; stín a poloměr se
            přepočítávají. <em>Do papíru</em> a <em>Stažené rohy</em> jsou proto dražší než zbytek.
          </li>
          <li>
            <strong style={{ color: 'var(--ds-ink)' }}>Pod 94 % už to není zpětná vazba, ale skok.</strong>{' '}
            Na tlačítku přes celou šířku je 4 % skoro 15 px pohybu na okraji. Táhni jezdcem dolů a
            v kartičce se to zlomí dřív než na jednom tlačítku.
          </li>
          <li>
            <strong style={{ color: 'var(--ds-ink)' }}>Musí to fungovat i bez pohybu.</strong> Poslední
            přepínač ukazuje, co uvidí někdo s <code>prefers-reduced-motion</code>: zbude jen ztmavnutí,
            takže barva stisku musí unést signál sama.
          </li>
        </ul>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- css -- */

/**
 * The variants as one stylesheet. They need real state selectors and a
 * runtime-chosen accent at the same time, which Tailwind's static utilities
 * cannot express — same reason `BUTTON_CSS` exists.
 */
export const PRESS_CSS = `
.ds-press-wrap {
  position: relative;
  display: inline-flex;
}
.ds-press-wrap[data-frame='true']::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1.5px dashed var(--ds-ink-faint);
  border-radius: 14px;
  pointer-events: none;
}

.ds-press {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 0 22px;
  border: 0;
  border-radius: 14px;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 800;
  line-height: 1;
  background: var(--pr-bg);
  color: var(--ds-paper);
  cursor: pointer;
  user-select: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transform-origin: center;
  transition:
    transform calc(110ms * var(--pr-speed)) cubic-bezier(0.2, 0, 0, 1),
    background-color calc(110ms * var(--pr-speed)) ease-out,
    box-shadow calc(110ms * var(--pr-speed)) ease-out,
    border-radius calc(110ms * var(--pr-speed)) ease-out;
}
.ds-press[data-tone='secondary'] {
  background: var(--ds-paper-hi);
  color: var(--ds-ink);
  box-shadow: inset 0 0 0 1.5px var(--ds-paper-edge);
}
.ds-press:focus-visible {
  outline: 2px solid var(--pr-bg-deep);
  outline-offset: 3px;
}
.ds-press__label {
  position: relative;
  z-index: 1;
  transition: transform calc(110ms * var(--pr-speed)) cubic-bezier(0.2, 0, 0, 1);
}

/* The colour half of the press is the same everywhere on purpose — it is the
   geometry that is on trial, and it is also the only thing left when motion
   is off. */
.ds-press[data-down='true'] {
  background: var(--pr-bg-deep);
}
.ds-press[data-tone='secondary'][data-down='true'] {
  background: var(--pr-wash);
  box-shadow: inset 0 0 0 1.5px var(--pr-bg);
}

/* ── 1. Rovnoměrné ───────────────────────────────────────────── */
.ds-press[data-press='flat'][data-down='true'] {
  transform: scale(var(--pr-scale));
}

/* ── 2. Zmáčknutí — sits down, spreads sideways ───────────────── */
.ds-press[data-press='squish'] {
  --pr-give: calc(1 - var(--pr-scale));
}
.ds-press[data-press='squish'][data-down='true'] {
  transform: scale(
    calc(1 + var(--pr-give) * 0.25),
    calc(var(--pr-scale) - var(--pr-give) * 0.4)
  );
}

/* ── 3. Doraz — instant down, unhurried back ──────────────────── */
.ds-press[data-press='snap'] {
  transition-duration: calc(300ms * var(--pr-speed));
  transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
}
.ds-press[data-press='snap'][data-down='true'] {
  transform: scale(var(--pr-scale));
  transition-duration: calc(45ms * var(--pr-speed));
  transition-timing-function: linear;
}

/* ── 4. Pružina — the release overshoots ──────────────────────── */
.ds-press[data-press='spring'] {
  transition-duration: calc(380ms * var(--pr-speed));
  transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
}
.ds-press[data-press='spring'][data-down='true'] {
  transform: scale(var(--pr-scale));
  transition-duration: calc(90ms * var(--pr-speed));
  transition-timing-function: ease-out;
}

/* ── 5. Krabice ano, písmo ne — label keeps its size ──────────── */
.ds-press[data-press='label'][data-down='true'] {
  transform: scale(var(--pr-scale));
}
.ds-press[data-press='label'][data-down='true'] > .ds-press__label {
  transform: scale(calc(1 / var(--pr-scale)));
}

/* ── 6. Ke prstu — origin follows the touch ───────────────────── */
.ds-press[data-press='origin'] {
  transform-origin: var(--pr-ox, 50%) var(--pr-oy, 50%);
}
.ds-press[data-press='origin'][data-down='true'] {
  transform: scale(var(--pr-scale));
}

/* ── 7. Výplň, ne plocha — the box never moves ────────────────── */
.ds-press[data-press='inner'] {
  background: transparent;
  box-shadow: none;
}
.ds-press[data-press='inner']::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--pr-bg);
  transform-origin: center;
  transition:
    transform calc(110ms * var(--pr-speed)) cubic-bezier(0.2, 0, 0, 1),
    background-color calc(110ms * var(--pr-speed)) ease-out;
}
.ds-press[data-press='inner'][data-tone='secondary'] {
  color: var(--ds-ink);
}
.ds-press[data-press='inner'][data-tone='secondary']::before {
  background: var(--ds-paper-hi);
  box-shadow: inset 0 0 0 1.5px var(--ds-paper-edge);
}
.ds-press[data-press='inner'][data-down='true'] {
  background: transparent;
}
.ds-press[data-press='inner'][data-down='true']::before {
  transform: scale(var(--pr-scale));
  background: var(--pr-bg-deep);
}
.ds-press[data-press='inner'][data-tone='secondary'][data-down='true']::before {
  background: var(--pr-wash);
  box-shadow: inset 0 0 0 1.5px var(--pr-bg);
}

/* ── 8. Do papíru — the shadow folds up ───────────────────────── */
.ds-press[data-press='paper'] {
  box-shadow: 0 6px 14px -8px rgba(42, 34, 24, 0.75);
}
.ds-press[data-press='paper'][data-tone='secondary'] {
  box-shadow:
    inset 0 0 0 1.5px var(--ds-paper-edge),
    0 6px 14px -8px rgba(42, 34, 24, 0.55);
}
.ds-press[data-press='paper'][data-down='true'] {
  transform: scale(var(--pr-scale)) translateY(1px);
  box-shadow: inset 0 2px 5px rgba(42, 34, 24, 0.38);
}
.ds-press[data-press='paper'][data-tone='secondary'][data-down='true'] {
  box-shadow:
    inset 0 0 0 1.5px var(--pr-bg),
    inset 0 2px 5px rgba(42, 34, 24, 0.22);
}

/* ── 9. Dokud držíš — the scale arrives inline, from a frame loop ─ */
.ds-press[data-press='hold'] {
  transition:
    transform calc(420ms * var(--pr-speed)) cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color calc(110ms * var(--pr-speed)) ease-out;
}

/* ── 10. Stažené rohy ─────────────────────────────────────────── */
.ds-press[data-press='radius'][data-down='true'] {
  transform: scale(var(--pr-scale));
  border-radius: 6px;
}

/* What someone with reduced motion actually gets: the colour, nothing else.
   Kept as a toggle rather than a media query so it can be judged by everyone. */
.ds-press-root[data-still='true'] .ds-press,
.ds-press-root[data-still='true'] .ds-press::before,
.ds-press-root[data-still='true'] .ds-press__label {
  transform: none !important;
  border-radius: 14px;
  transition: background-color 90ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .ds-press,
  .ds-press::before,
  .ds-press__label {
    transform: none !important;
    transition: background-color 90ms ease-out;
  }
}
`;
