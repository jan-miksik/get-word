'use client';

import {
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';

import {
  BUTTON_CSS,
  PERSONALITIES,
  PERSONALITY_BY_KEY,
  skinFor,
  type PersonalityKey,
  type Tone,
} from './button-personalities';
import { CONCEPT_CSS, InteractionConcepts } from './interaction-concepts';
import { PRESS_CSS, PRESS_VARIANTS, PressVariantsSection } from './press-variants';
import { PaletteEditor, usePaletteDraft } from './palette-editor';
import {
  ACCENTS,
  ACCENT_BY_KEY,
  ACCENT_VARS,
  paletteCss,
  type AccentKey,
} from './tokens';

/**
 * Dev playground for a single app-wide design system.
 *
 * Two questions get asked here and nowhere else yet:
 *   1. one palette — what the app's colours are when they are written down once
 *   2. one button language — what a button looks like when it is not Duolingo's
 *
 * Nothing on this page is imported by the app. It renders on the real sand
 * sheet so every candidate is judged where it would actually live.
 */

/* Handles, not values. The palette is state — see `palette-editor.tsx` — and
   it reaches the page as `--ds-*` variables, so a knob repaints every swatch,
   personality and mock-up without re-rendering any of them. The hex defaults
   live in `tokens.ts`. */
const SAND = 'var(--ds-sand)';
const PAPER = 'var(--ds-paper)';
const PAPER_HI = 'var(--ds-paper-hi)';
const INK = 'var(--ds-ink)';
const INK_SOFT = 'var(--ds-ink-soft)';
const PAPER_EDGE = 'var(--ds-paper-edge)';

/** The accents as `var()`, for everything that paints one. `ACCENT_BY_KEY` is
    still the place to read a label or a role from. */
const ACC = ACCENT_VARS;

/* A pen loop with an overshoot, for the `circle` personality. Drawn in a
   200×60 box that gets squashed to the button; `vector-effect` keeps the
   stroke even and `pathLength` keeps the dash maths width-independent. */
const PEN_LOOP =
  'M 26 12 C 78 3 150 5 182 20 C 199 28 190 46 150 52 C 104 59 44 57 18 46 C 2 39 6 20 40 11 C 58 6 96 4 130 6';

function Btn({
  personality,
  accent,
  tone = 'primary',
  pressed = false,
  disabled = false,
  children,
  style,
  className = '',
}: {
  personality: PersonalityKey;
  accent: AccentKey;
  tone?: Tone;
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  const skin = skinFor(ACC[accent], tone);
  /* `bleed` spreads its ink from the touch point, so the personality needs the
     coordinate as a variable. Written straight to the node — a re-render per
     pointermove would be absurd for what is only a paint hint. */
  const trackPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--btn-px', `${((event.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty('--btn-py', `${((event.clientY - rect.top) / rect.height) * 100}%`);
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={trackPointer}
      onPointerMove={trackPointer}
      data-pressed={pressed ? 'true' : undefined}
      className={`ds-btn ds-btn--${personality} ${className}`}
      style={{ ...(skin as CSSProperties), ...style }}
    >
      <span
        className="ds-btn__label"
        /* `riso` prints the label twice; the second impression is drawn from
           this attribute, so it only works on plain-text labels. */
        data-label={
          PERSONALITY_BY_KEY[personality].needsLabelAttr &&
          typeof children === 'string'
            ? children
            : undefined
        }
      >
        {children}
      </span>
      {PERSONALITY_BY_KEY[personality].needsAnnotation ? (
        <svg
          className="ds-btn__annot"
          viewBox="0 0 200 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={PEN_LOOP} pathLength={1} />
        </svg>
      ) : null}
    </button>
  );
}

function Section({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-5xl px-5 py-8">
      <h2
        className="text-[1.35rem] font-black tracking-tight"
        style={{ color: INK }}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className="mt-1.5 max-w-2xl text-[0.95rem] leading-relaxed"
          style={{ color: INK_SOFT }}
        >
          {lead}
        </p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function DesignSystemDevPreview() {
  const { palette, setPalette } = usePaletteDraft();
  const [accent, setAccent] = useState<AccentKey>('sea');
  const [freeze, setFreeze] = useState(false);
  const [contextPersonality, setContextPersonality] =
    useState<PersonalityKey>('letterpress');
  const [onPaper, setOnPaper] = useState(true);
  const [batch, setBatch] = useState<0 | 1 | 2 | 3 | 4>(0);
  const shown = PERSONALITIES.filter(
    (p) => batch === 0 || (p.batch ?? 1) === batch,
  );

  return (
    <div className="ds-root min-h-dvh pb-24" style={{ background: SAND, color: INK }}>
      {/* The palette first: every var() below resolves against it. */}
      <style>{paletteCss(palette)}</style>
      <style>{BUTTON_CSS}</style>
      <style>{CONCEPT_CSS}</style>
      <style>{PRESS_CSS}</style>

      <header className="mx-auto w-full max-w-5xl px-5 pt-10">
        <p
          className="text-[0.72rem] font-bold uppercase tracking-[0.18em]"
          style={{ color: INK_SOFT }}
        >
          dev · design system
        </p>
        <h1 className="mt-2 text-[2rem] font-black leading-tight tracking-tight">
          Jedna paleta, jeden jazyk tlačítek
        </h1>
        <p className="mt-3 max-w-2xl text-[0.98rem] leading-relaxed" style={{ color: INK_SOFT }}>
          Návrh, ne implementace. Aplikace se nic z téhle stránky nedotýká — je
          to plocha na rozhodnutí. Vybraný akcent přebarví celou stránku, ať jde
          posoudit, jestli aplikace unese víc barev než modrou a béžovou.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAccent(a.key)}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.82rem] font-bold transition-all"
              style={{
                background: accent === a.key ? ACC[a.key].base : PAPER,
                color: accent === a.key ? PAPER : INK,
                boxShadow:
                  accent === a.key
                    ? `0 0 0 2px ${ACC[a.key].deep}`
                    : `inset 0 0 0 1px ${PAPER_EDGE}`,
              }}
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{
                  background: ACC[a.key].base,
                  boxShadow: `inset 0 0 0 1px rgba(42,34,24,0.25)`,
                }}
              />
              {a.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.85rem]" style={{ color: INK_SOFT }}>
          <strong style={{ color: INK }}>{ACCENT_BY_KEY[accent].label}</strong> —{' '}
          {ACCENT_BY_KEY[accent].role}
        </p>
      </header>

      <Section
        title="1 · Paleta"
        lead="Žádná barva tu není nová. Papírová řada je to, na čem už aplikace stojí; sedm akcentů jsou inkousty, které dnes existují jen uvnitř miniher (--match-*, --rail-*). Design systém je hlavně o tom dát jim jméno a jeden význam — a pak je pustit i mimo hry. Všechno se tu dá přebarvit: každý knoflík překreslí celou stránku, ať jde barva posoudit na tlačítkách a kartě, ne na čtverečku."
      >
        <PaletteEditor
          palette={palette}
          setPalette={setPalette}
          accent={accent}
          onPickAccent={setAccent}
        />
      </Section>

      <Section
        title={`2 · ${PERSONALITIES.length} jazyků tlačítka`}
        lead="První je to, co aplikace kreslí dnes — a je to doslova Duolingo recept. Hned za ním jsou čtyři prosté: nic než klidový tvar a rovnoměrné zmenšení ze sekce 3, tedy varianta, u které se nedá nic pokazit. Zbytek hledá tvar, který si aplikace může přivlastnit — všechny vychází z papíru a tisku. Druhá várka je hmatatelnější, třetí přestává být slušná: je v ní i tvar, který se hýbe v perspektivě, a jeden, který není tvar, ale chování."
      >
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {/* The plain batch sits second in the list, so it sits second here too. */}
          {([0, 4, 1, 2, 3] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBatch(b)}
              className="rounded-full px-3 py-1 text-[0.78rem] font-bold"
              style={{
                background: batch === b ? INK : PAPER,
                color: batch === b ? PAPER : INK,
                boxShadow: `inset 0 0 0 1px ${PAPER_EDGE}`,
              }}
            >
              {b === 0 ? 'vše' : b === 4 ? 'prosté' : `${b}. várka`}
            </button>
          ))}
          <span className="ml-1 text-[0.78rem]" style={{ color: INK_SOFT }}>
            {shown.length} z {PERSONALITIES.length}
          </span>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[0.88rem] font-bold">
            <input
              type="checkbox"
              checked={freeze}
              onChange={(e) => setFreeze(e.target.checked)}
            />
            zmrazit stisknutý stav
          </label>
          <label className="flex items-center gap-2 text-[0.88rem] font-bold">
            <input
              type="checkbox"
              checked={onPaper}
              onChange={(e) => setOnPaper(e.target.checked)}
            />
            na papírové kartě (jinak přímo na písku)
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((p) => (
            <div
              key={p.key}
              className="rounded-2xl p-4"
              style={{
                background: onPaper ? PAPER : 'transparent',
                boxShadow: onPaper ? `inset 0 0 0 1px ${PAPER_EDGE}` : 'none',
              }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="flex items-baseline gap-2 text-[1.05rem] font-black">
                  {p.label}
                  {p.batch ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.12em]"
                      style={{
                        background:
                          p.batch === 4
                            ? ACC.sea.wash
                            : p.batch === 3
                              ? ACC.plum.wash
                              : ACC.terracotta.wash,
                        color:
                          p.batch === 4
                            ? ACC.sea.deep
                            : p.batch === 3
                              ? ACC.plum.deep
                              : ACC.terracotta.deep,
                      }}
                    >
                      {p.batch === 4 ? 'prosté' : `${p.batch}. várka`}
                    </span>
                  ) : null}
                </h3>
                <button
                  type="button"
                  onClick={() => setContextPersonality(p.key)}
                  className="shrink-0 text-[0.75rem] font-bold underline"
                  style={{ color: ACC[accent].base }}
                >
                  zkusit v kartě ↓
                </button>
              </div>
              <p className="mt-1 text-[0.85rem] leading-relaxed" style={{ color: INK_SOFT }}>
                {p.pitch}
              </p>
              <p
                className="mt-1.5 text-[0.8rem] leading-relaxed"
                style={{ color: ACC.brick.deep }}
              >
                ⚠ {p.caveat}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Btn personality={p.key} accent={accent} tone="primary" pressed={freeze}>
                  Pokračovat →
                </Btn>
                <Btn personality={p.key} accent={accent} tone="secondary" pressed={freeze}>
                  die Verabredung
                </Btn>
                <Btn personality={p.key} accent={accent} tone="ghost" pressed={freeze}>
                  Přeskočit
                </Btn>
                <Btn personality={p.key} accent={accent} tone="primary" disabled>
                  Nedostupné
                </Btn>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Btn personality={p.key} accent="moss" tone="primary" pressed>
                  ✓ Správně
                </Btn>
                <Btn personality={p.key} accent="brick" tone="primary" pressed>
                  ✗ Chyba
                </Btn>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title={`3 · Fyzika stisku — ${PRESS_VARIANTS.length} variant zmenšení`}
        lead="Sekce 2 se ptá, jaký má tlačítko tvar. Tady je jediná otázka to, co se stane pod prstem: zmenšení se osvědčilo, tak která jeho podoba. Všechny varianty kreslí stejný tvar a stejnou barvu — liší se jen pohybem. Kolik a jak rychle jsou společné knoflíky nahoře, protože to není povaha varianty, ale číslo."
      >
        <PressVariantsSection accent={ACC[accent]} />
      </Section>

      <Section
        title="4 · Interaktivní prvky"
        lead="Druhá várka návrhů z chatu, přenesená na náš papír — a pět nových. Tady se neptáme, jaký má tlačítko tvar, ale co umí dělat: každý prvek je chování, které aplikace opravdu má (odhalení, výslovnost, směr, undo, setření, žebřík intervalů, pomůcka, párování), nakreslené jako jediné gesto. Barvy berou z palety nahoře, takže si je jde přebarvit pod rukama."
      >
        <InteractionConcepts />
      </Section>

      <Section
        title="5 · V kontextu"
        lead="Tlačítko se nedá vybrat samo o sobě — vybírá se karta. Tohle je maketa studijní kartičky ve vybraném jazyce a vybraném akcentu."
      >
        <div className="mb-5 flex flex-wrap gap-2">
          {PERSONALITIES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setContextPersonality(p.key)}
              className="rounded-full px-3 py-1.5 text-[0.82rem] font-bold"
              style={{
                background: contextPersonality === p.key ? INK : PAPER,
                color: contextPersonality === p.key ? PAPER : INK,
                boxShadow: `inset 0 0 0 1px ${PAPER_EDGE}`,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="mb-2 flex items-center gap-2">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full"
              style={{ background: 'rgba(42,34,24,0.13)' }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: '62%', background: ACC[accent].base }}
              />
            </div>
            <span className="text-[0.75rem] font-bold" style={{ color: INK_SOFT }}>
              blok 2/3
            </span>
          </div>

          <div
            className="rounded-2xl p-5"
            style={{
              background: PAPER,
              boxShadow: `inset 0 0 0 2px ${INK}, 0 12px 30px rgba(42,34,24,0.16)`,
            }}
          >
            <p
              className="text-[0.72rem] font-bold uppercase tracking-[0.16em]"
              style={{ color: INK_SOFT }}
            >
              Vyber překlad
            </p>
            <p className="mt-2 text-[1.7rem] font-black leading-tight">schůzka</p>

            <div className="mt-5 grid gap-2.5">
              <Btn
                personality={contextPersonality}
                accent={accent}
                tone="secondary"
                style={{ background: PAPER_HI }}
              >
                die Abfahrt
              </Btn>
              <Btn
                personality={contextPersonality}
                accent="moss"
                tone="secondary"
                pressed
              >
                die Verabredung ✓
              </Btn>
              <Btn
                personality={contextPersonality}
                accent="brick"
                tone="secondary"
                pressed
              >
                die Umgebung ✗
              </Btn>
              <Btn
                personality={contextPersonality}
                accent={accent}
                tone="secondary"
                style={{ background: PAPER_HI }}
              >
                der Vorschlag
              </Btn>
            </div>

            <div className="mt-5 grid">
              <Btn
                personality={contextPersonality}
                accent={accent}
                tone="primary"
              >
                Pokračovat →
              </Btn>
            </div>
          </div>

          <div className="mt-4 flex justify-center gap-2">
            <Btn personality={contextPersonality} accent="terracotta" tone="ghost">
              + Přidat slova
            </Btn>
            <Btn personality={contextPersonality} accent="plum" tone="ghost">
              Z fotky
            </Btn>
            <Btn personality={contextPersonality} accent="ochre" tone="ghost">
              Série 6 dní
            </Btn>
          </div>
        </div>
      </Section>

      <Section
        title="6 · Co už je hotové"
        lead="Základ se dal položit bez rozhodnutí o paletě, tak je položený. Zbytek téhle stránky je pořád jen návrh."
      >
        <div
          className="rounded-2xl p-5 text-[0.92rem] leading-relaxed"
          style={{ background: PAPER, boxShadow: `inset 0 0 0 1px ${PAPER_EDGE}` }}
        >
          <p className="font-bold">Hotovo</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              Barvy jsou zapsané jednou — v bloku <code>THE PAPER PALETTE</code> v{' '}
              <code>styles/tokens.css</code>. Čtyři kopie (<code>--game-*</code>,{' '}
              <code>--ob-*</code>, <code>GAME_PALETTE</code>, čtvrtá v{' '}
              <code>InterfaceLanguageSelector</code>) jsou teď aliasy.
            </li>
            <li>
              Tailwind utility v <code>app/tailwind.css</code>:{' '}
              <code>bg-paper</code>, <code>text-ink</code>, <code>border-sea</code>{' '}
              — a nikdo je nepřemapovává, takže platí na každém povrchu.
            </li>
            <li>
              ~730 natvrdo psaných hexů kleslo na 103 jednorázových odstínů; ty
              hlídá ráčna <code>pnpm run check:design-tokens</code>.
            </li>
          </ul>

          <p className="mt-4 font-bold">Čeká to na rozhodnutí</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              Škály jsou zatím <em>inventura</em>, ne systém — appka kreslí čtyři
              zelené a přes deset krémových, některé se liší o jednu číslici
              (<code>#f4efe1</code> vs <code>#f4efe2</code>). Seznam vypíše{' '}
              <code>pnpm run check:design-tokens --report</code>.
            </li>
            <li>
              Akcenty z první sekce (terakota, švestková, okrová, růžová) v{' '}
              <code>tokens.css</code> zatím nejsou. Přidají se, až se rozhodne,
              jestli má appka mít druhou značkovou barvu.
            </li>
            <li>
              <code>:root</code> v <code>tokens.css</code> pořád nese mrtvý tmavě
              modrý motiv (<code>#060a18</code>, akcent <code>#38bdf8</code>).
              Vyhodit ho jde až s vybranou paletou.
            </li>
            <li>
              Jazyk tlačítka. Dnešní <code>lift</code> zůstává všude beze změny.
            </li>
          </ul>
        </div>
      </Section>

    </div>
  );
}
