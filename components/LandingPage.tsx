'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AppLogo } from '@/components/AppLogo';
import { SpeckledBackground } from '@/components/SpeckledBackground';
import {
  DEFAULT_LANDING_LANG,
  LANDING_CONTENT,
  LANDING_LANG_STORAGE_KEY,
  LANDING_LANGS,
  detectBrowserLang,
  resolveLandingLang,
  type LandingContent,
  type LandingLang,
} from '@/components/landing/translations';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const GITHUB_URL = 'https://github.com/jan-miksik/get-word';
const CONTACT_EMAIL = 'contact@getword.app';
/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */

const FEATURE_ICONS: ((props: { className?: string }) => React.ReactNode)[] = [
  IconBrain,
  IconCards,
  IconSpeaker,
  IconSpark,
  IconSync,
  IconInstall,
];

const FEATURE_ACCENTS: ('blue' | 'rust')[] = [
  'blue',
  'rust',
  'blue',
  'rust',
  'blue',
  'rust',
];

const STEP_NUMBERS = ['01', '02', '03'];

/* ------------------------------------------------------------------ *
 * Language preference
 * ------------------------------------------------------------------ */

/**
 * Resolve the visitor's preferred landing language. A manual choice saved in
 * localStorage wins; otherwise we fall back to the browser language, then to
 * the default. Runs only on the client (depends on navigator/localStorage).
 */
function readPreferredLang(): LandingLang {
  try {
    const saved = resolveLandingLang(localStorage.getItem(LANDING_LANG_STORAGE_KEY));
    if (saved) return saved;
  } catch {
    // localStorage may be unavailable (private mode) — fall through.
  }
  return detectBrowserLang();
}

/**
 * Tiny external store for the chosen landing language. Using
 * `useSyncExternalStore` keeps SSR/hydration honest: the server (and the first
 * client paint) render the default language, then React re-renders with the
 * visitor's resolved preference without a hydration mismatch.
 */
let currentLang: LandingLang | null = null;
const langListeners = new Set<() => void>();

function getLangSnapshot(): LandingLang {
  if (currentLang === null) currentLang = readPreferredLang();
  return currentLang;
}

function getLangServerSnapshot(): LandingLang {
  return DEFAULT_LANDING_LANG;
}

function subscribeLang(onChange: () => void): () => void {
  langListeners.add(onChange);
  return () => langListeners.delete(onChange);
}

function setLandingLang(next: LandingLang) {
  currentLang = next;
  try {
    localStorage.setItem(LANDING_LANG_STORAGE_KEY, next);
  } catch {
    // Ignore storage failures — the choice still applies for this session.
  }
  langListeners.forEach((l) => l());
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

/**
 * Public marketing landing page shown to signed-out visitors at `/`.
 * Server-rendered in English so its content is crawlable / reviewable without
 * a login, then — on the client — it switches to the visitor's browser
 * language (or a remembered manual choice) and offers a language switcher.
 *
 * Aesthetic: the app's signature speckled-parchment "frame" (SpeckledBackground)
 * with bordered cream panels and an editorial serif, accented in ink-blue and
 * rust-red. All motion is pure-CSS on-load so content is never hidden for
 * no-JS crawlers/reviewers.
 */
export function LandingPage() {
  // Server + first client paint render the default language so hydration
  // matches; the store then resolves the visitor's browser/saved preference.
  const lang = useSyncExternalStore(
    subscribeLang,
    getLangSnapshot,
    getLangServerSnapshot
  );

  const t = LANDING_CONTENT[lang];

  return (
    <div className="lp-root" lang={t.htmlLang}>
      <LandingStyles />
      <SpeckledBackground snapRisingLettersToMouse={false} />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col px-4 sm:px-6">
        <SiteHeader t={t} lang={lang} onLangChange={setLandingLang} />
        <Hero t={t} />
        <Features t={t} />
        <HowItWorks t={t} />
        <OpenSource t={t} />
        <FinalCta t={t} />
        <SiteFooter t={t} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Language switcher
 * ------------------------------------------------------------------ */

function LanguageSwitcher({
  lang,
  label,
  onLangChange,
}: {
  lang: LandingLang;
  label: string;
  onLangChange: (next: LandingLang) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const current = LANDING_LANGS.find((l) => l.code === lang) ?? LANDING_LANGS[0];

  return (
    <div ref={ref} className="lp-lang">
      <button
        type="button"
        className="lp-lang-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="lp-lang-flag" aria-hidden>{current.flag}</span>
        <span className="lp-lang-label">{current.label}</span>
        <IconChevron className={`lp-lang-chevron${open ? ' lp-lang-chevron-open' : ''}`} />
      </button>
      {open && (
        <ul className="lp-lang-menu" role="listbox" aria-label={label}>
          {LANDING_LANGS.map((l) => (
            <li key={l.code} role="none">
              <button
                type="button"
                role="option"
                aria-selected={l.code === lang}
                className={`lp-lang-option${l.code === lang ? ' lp-lang-option-active' : ''}`}
                onClick={() => {
                  onLangChange(l.code);
                  setOpen(false);
                }}
              >
                <span className="lp-lang-row">
                  <span className="lp-lang-flag" aria-hidden>{l.flag}</span>
                  {l.label}
                </span>
                {l.code === lang && <IconCheck className="lp-lang-check" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

function SiteHeader({
  t,
  lang,
  onLangChange,
}: {
  t: LandingContent;
  lang: LandingLang;
  onLangChange: (next: LandingLang) => void;
}) {
  return (
    <header className="flex items-center justify-between gap-2 py-4 sm:gap-6 sm:py-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <AppLogo
          size={38}
          className="[&>svg]:h-[34px] [&>svg]:w-[34px] sm:[&>svg]:h-[38px] sm:[&>svg]:w-[38px]"
        />
        <span className="lp-display whitespace-nowrap text-base font-semibold tracking-tight text-[var(--ink)] sm:text-lg">
          Get&nbsp;Word
        </span>
      </div>
      <nav className="flex shrink-0 items-center gap-2.5 sm:gap-3">
        <LanguageSwitcher
          lang={lang}
          label={t.languagePicker}
          onLangChange={onLangChange}
        />
        <Link href="/login" className="lp-btn-ghost">
          {t.hero.getStarted}
        </Link>
      </nav>
    </header>
  );
}

function Hero({ t }: { t: LandingContent }) {
  return (
    <section className="lp-fade-in min-w-0 py-10 sm:py-16">
      <div className="lp-stagger">
        <h1
          className="lp-display m-0 text-[clamp(2.6rem,7vw,5rem)] font-bold leading-[1.02] tracking-[-0.025em] text-[var(--ink)]"
          style={{ '--i': 0 } as React.CSSProperties}
        >
          {t.hero.title}
        </h1>

        <p
          className="m-0 mt-6 max-w-2xl text-[1.05rem] leading-7 text-[var(--ink-2)] sm:text-[1.2rem] sm:leading-8"
          style={{ '--i': 1 } as React.CSSProperties}
        >
          {t.hero.subtitle}
        </p>

        <div
          className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
          style={{ '--i': 2 } as React.CSSProperties}
        >
          <Link href="/login" className="lp-btn-primary group">
            {t.hero.getStarted}
            <IconArrow className="lp-btn-arrow" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Features({ t }: { t: LandingContent }) {
  return (
    <section className="py-12 sm:py-20">
      <SectionHeading kicker={t.features.kicker} title={t.features.title} />
      <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-[26px] border-2 border-[var(--ink)] bg-[var(--ink)] sm:grid-cols-2 lg:grid-cols-3">
        {t.features.items.map((f, i) => {
          const Icon = FEATURE_ICONS[i];
          return (
            <article
              key={f.title}
              className="lp-reveal lp-feature group"
              style={{ '--d': `${i * 55}ms` } as React.CSSProperties}
            >
              <span className={`lp-feature-icon lp-accent-${FEATURE_ACCENTS[i]}`}>
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="lp-display mt-5 text-xl font-semibold text-[var(--ink)]">
                {f.title}
              </h3>
              <p className="mt-2 text-[0.95rem] leading-6 text-[var(--ink-2)]">{f.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function HowItWorks({ t }: { t: LandingContent }) {
  return (
    <section className="py-12 sm:py-20">
      <SectionHeading kicker={t.how.kicker} title={t.how.title} />
      <ol className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {t.how.steps.map((s, i) => (
          <li
            key={STEP_NUMBERS[i]}
            className="lp-reveal lp-step"
            style={{ '--d': `${i * 80}ms` } as React.CSSProperties}
          >
            <span className="lp-step-n lp-display">{STEP_NUMBERS[i]}</span>
            <h3 className="lp-display mt-4 text-xl font-semibold text-[var(--ink)]">
              {s.title}
            </h3>
            <p className="mt-2 text-[0.95rem] leading-6 text-[var(--ink-2)]">{s.body}</p>
            {i < t.how.steps.length - 1 && (
              <IconArrow className="lp-step-arrow" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function OpenSource({ t }: { t: LandingContent }) {
  return (
    <section className="lp-reveal py-6 sm:py-10">
      <div className="lp-opensource">
        <div className="flex items-start gap-4">
          <span className="lp-feature-icon lp-accent-rust shrink-0">
            <IconGithub className="h-6 w-6" />
          </span>
          <div>
            <h3 className="lp-display m-0 text-xl font-semibold text-[var(--ink)] sm:text-2xl">
              {t.openSource.title}
            </h3>
            <p className="m-0 mt-2 max-w-md text-[0.95rem] leading-6 text-[var(--ink-2)]">
              {t.openSource.body}
            </p>
          </div>
        </div>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="lp-btn-outline group shrink-0"
        >
          <IconGithub className="h-[1.05rem] w-[1.05rem]" />
          {t.openSource.cta}
          <IconArrow className="lp-btn-arrow" />
        </a>
      </div>
    </section>
  );
}

function FinalCta({ t }: { t: LandingContent }) {
  return (
    <section className="lp-reveal py-12 sm:py-20">
      <div className="lp-cta">
        <div aria-hidden className="lp-cta-halftone" />
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div>
            <h2 className="lp-display m-0 text-[clamp(1.7rem,4vw,2.6rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--card-2)]">
              {t.cta.title}
            </h2>
            <p className="m-0 mt-3 max-w-md text-[0.98rem] leading-6 text-[rgba(243,234,213,0.72)]">
              {t.cta.body}
            </p>
          </div>
          <Link href="/login" className="lp-btn-cream group shrink-0">
            {t.cta.button}
            <IconArrow className="lp-btn-arrow" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function SiteFooter({ t }: { t: LandingContent }) {
  return (
    <footer className="flex flex-col gap-5 border-t-2 border-[var(--line-strong)] py-9 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <AppLogo size={28} />
        <span className="lp-display text-sm font-semibold text-[var(--ink)]">
          Get&nbsp;Word
        </span>
      </div>
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/login" className="lp-foot-link">{t.hero.getStarted}</Link>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="lp-foot-link">
          {t.footer.github}
        </a>
        <a href={`mailto:${CONTACT_EMAIL}`} className="lp-foot-link">{t.footer.contact}</a>
        <Link href="/privacy" className="lp-foot-link">{t.footer.privacy}</Link>
        <Link href="/terms" className="lp-foot-link">{t.footer.terms}</Link>
      </nav>
      <p className="lp-mono m-0 text-[0.72rem] text-[var(--ink-soft)]">
        © {new Date().getFullYear()} Get Word
      </p>
    </footer>
  );
}

function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="lp-reveal flex max-w-2xl flex-col gap-3">
      <span className="lp-kicker lp-mono">
        <span className="lp-kicker-rule" /> {kicker}
      </span>
      <h2 className="lp-display m-0 text-[clamp(1.9rem,4.5vw,2.9rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--ink)]">
        {title}
      </h2>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Icons (ink line-work)
 * ------------------------------------------------------------------ */

function svgProps(className?: string) {
  return {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

function IconBrain({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 5.5a2.5 2.5 0 0 0-5 .2 2.4 2.4 0 0 0-2 3.3A2.5 2.5 0 0 0 5.5 14 2.4 2.4 0 0 0 8 17.5a2.5 2.5 0 0 0 4 .9Z" />
      <path d="M12 5.5a2.5 2.5 0 0 1 5 .2 2.4 2.4 0 0 1 2 3.3A2.5 2.5 0 0 1 18.5 14 2.4 2.4 0 0 1 16 17.5a2.5 2.5 0 0 1-4 .9Z" />
      <path d="M12 5.5v13" />
    </svg>
  );
}

function IconCards({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="6" width="13" height="13" rx="2.2" />
      <path d="M8 3.5h10.2A1.8 1.8 0 0 1 20 5.3V15" />
      <path d="M6.5 11h6M6.5 14.2h4" />
    </svg>
  );
}

function IconSpeaker({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 9v6h3l5 4V5L7 9Z" />
      <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 7a7 7 0 0 1 0 10" />
    </svg>
  );
}

function IconSpark({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3.5 13.7 9 19 10.5 13.7 12 12 17.5 10.3 12 5 10.5 10.3 9Z" />
      <path d="M18.5 4.5v3M20 6h-3M5.5 16v2.5M6.75 17.25h-2.5" />
    </svg>
  );
}

function IconSync({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" />
      <path d="M4 20v-4.5h4.5" />
    </svg>
  );
}

function IconInstall({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3.5v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 17.5v1A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-1" />
    </svg>
  );
}

function IconArrow({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h13" />
      <path d="m12.5 6 6 6-6 6" />
    </svg>
  );
}

function IconGithub({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 1.8a10.2 10.2 0 0 0-3.23 19.88c.51.1.7-.22.7-.49l-.01-1.92c-2.84.62-3.44-1.2-3.44-1.2-.46-1.18-1.13-1.5-1.13-1.5-.93-.63.07-.62.07-.62 1.03.07 1.57 1.06 1.57 1.06.91 1.57 2.4 1.12 2.99.85.09-.66.36-1.12.65-1.37-2.27-.26-4.66-1.14-4.66-5.06 0-1.12.4-2.03 1.05-2.74-.1-.26-.46-1.3.1-2.7 0 0 .86-.27 2.82 1.05a9.7 9.7 0 0 1 5.13 0c1.96-1.32 2.81-1.05 2.81-1.05.56 1.4.21 2.44.1 2.7.66.71 1.05 1.62 1.05 2.74 0 3.93-2.39 4.79-4.67 5.05.37.32.69.94.69 1.9l-.01 2.82c0 .27.19.6.71.49A10.2 10.2 0 0 0 12 1.8Z" />
    </svg>
  );
}

function IconChevron({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)} aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)} aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Scoped styles — riso/letterpress palette over the speckled "frame".
 * Tailwind handles layout/spacing; this owns the distinctive look that
 * utilities can't express (font bindings, keyframed motion, the cream
 * frame panel). Self-contained — no global CSS is touched.
 * ------------------------------------------------------------------ */

function LandingStyles() {
  return (
    <style>{`
.lp-root{
  --paper:#dcd1b9;
  --card:#f3ead5; --card-2:#fbf5e7;
  --ink:#211a0f; --ink-2:#52462f; --ink-soft:#857449;
  --blue:#1E6FA8; --blue-deep:#134f78;
  --rust:#bf472a; --rust-deep:#963620;
  --line:rgba(33,26,15,0.16); --line-strong:rgba(33,26,15,0.3);

  position:relative;
  isolation:isolate;
  min-height:100dvh;
  width:100%;
  color:var(--ink);
  background:var(--paper);
  font-family:var(--font-hanken),system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
  overflow-x:clip;
}
.lp-display{ font-family:system-ui,-apple-system,"Segoe UI",sans-serif; letter-spacing:-0.01em; }
.lp-mono{ font-family:var(--font-mono-accent),ui-monospace,monospace; }
.italic{ font-style:italic; }
.lp-root ::selection{ background:var(--blue); color:var(--card-2); }

/* --- Buttons & links --- */
.lp-btn-primary,.lp-btn-cream,.lp-btn-ghost,.lp-btn-outline{
  display:inline-flex; align-items:center; justify-content:center; gap:.55rem;
  font-weight:600; border-radius:999px; border:2px solid var(--ink);
  transition:transform .18s cubic-bezier(.2,.8,.3,1), background .18s, color .18s;
}
.lp-btn-primary{
  background:var(--blue); color:var(--card-2); border-color:var(--blue-deep);
  padding:.85rem 1.5rem; font-size:1rem;
}
.lp-btn-primary:hover{ background:var(--blue-deep); transform:translateY(-2px); }
.lp-btn-primary:active{ transform:translateY(0); }
.lp-btn-cream{
  background:var(--card-2); color:var(--ink); border-color:var(--card-2);
  padding:.85rem 1.6rem; font-size:1.02rem;
}
.lp-btn-cream:hover{ transform:translateY(-2px); }
.lp-btn-cream:active{ transform:translateY(0); }
.lp-btn-outline{
  background:var(--card-2); color:var(--ink); padding:.7rem 1.25rem; font-size:.92rem;
}
.lp-btn-outline:hover{ transform:translateY(-2px); background:#fff; }
.lp-btn-ghost{
  background:transparent; color:var(--ink); padding:.5rem 1.05rem; font-size:.92rem;
  min-height:2.75rem; white-space:nowrap;
}
.lp-btn-ghost:hover{ background:var(--ink); color:var(--card-2); }
.lp-btn-arrow{ width:1.05rem; height:1.05rem; transition:transform .2s ease; }
.group:hover .lp-btn-arrow{ transform:translateX(4px); }
.lp-link-quiet{
  font-size:.95rem; font-weight:600; color:var(--blue-deep);
  text-decoration:underline; text-underline-offset:5px; text-decoration-thickness:1.5px;
  text-decoration-color:rgba(19,79,120,.4); padding:.4rem .2rem; transition:text-decoration-color .2s,color .2s;
}
.lp-link-quiet:hover{ color:var(--rust); text-decoration-color:var(--rust); }

/* --- Language switcher --- */
.lp-lang{ position:relative; min-width:0; }
.lp-lang-btn{
  display:inline-flex; align-items:center; gap:.4rem;
  background:transparent; color:var(--ink);
  border:2px solid var(--line-strong); border-radius:999px;
  padding:.45rem .7rem .45rem .65rem; font-size:.88rem; font-weight:600;
  cursor:pointer; transition:border-color .18s, background .18s;
  min-height:2.75rem; max-width:100%; white-space:nowrap;
}
.lp-lang-btn:hover{ border-color:var(--ink); background:var(--card); }
.lp-lang-flag{ font-size:1.02em; line-height:1; }
.lp-lang-label{ display:inline; }
.lp-lang-row{ display:inline-flex; align-items:center; gap:.55rem; }
.lp-lang-chevron{ width:.85rem; height:.85rem; color:var(--ink-soft); transition:transform .2s ease; }
.lp-lang-chevron-open{ transform:rotate(180deg); }
.lp-lang-menu{
  position:absolute; right:0; top:calc(100% + .45rem); z-index:30;
  min-width:11rem; margin:0; padding:.35rem; list-style:none;
  background:var(--card-2); border:2px solid var(--ink); border-radius:16px;
  box-shadow:0 14px 34px -14px rgba(33,26,15,.5);
  animation:lp-menu-in .16s ease both;
}
@keyframes lp-menu-in{ from{ opacity:0; transform:translateY(-4px) } to{ opacity:1; transform:none } }
.lp-lang-option{
  display:flex; align-items:center; justify-content:space-between; gap:.6rem;
  width:100%; padding:.55rem .7rem; border:0; border-radius:11px;
  background:transparent; color:var(--ink); font-size:.92rem; font-weight:500;
  text-align:left; cursor:pointer; transition:background .14s, color .14s;
}
.lp-lang-option:hover{ background:var(--card); }
.lp-lang-option-active{ color:var(--blue-deep); font-weight:600; }
.lp-lang-check{ width:1rem; height:1rem; color:var(--blue); flex:none; }

@media (max-width:639px){
  .lp-btn-ghost{
    min-height:2.3rem; padding:.38rem .68rem; font-size:.8rem;
  }
  .lp-lang-btn{
    min-height:2.3rem; gap:0; padding:.38rem .52rem;
  }
  .lp-lang-label,.lp-lang-chevron{ display:none; }
  .lp-lang-flag{ font-size:1.08rem; }
}

/* --- Kicker --- */
.lp-kicker{
  display:inline-flex; align-items:center; gap:.6rem;
  font-size:.74rem; text-transform:uppercase; letter-spacing:.2em; color:var(--ink-soft);
}
.lp-kicker-rule{ width:26px; height:2px; background:var(--rust); }

/* --- Load / reveal animations (pure CSS, no JS) --- */
.lp-stagger > *{ opacity:0; transform:translateY(16px); animation:lp-rise .8s cubic-bezier(.2,.8,.25,1) both; animation-delay:calc(var(--i,0) * 95ms + 120ms); }
.lp-fade-in{ opacity:0; animation:lp-fade 1s ease forwards .15s; }
@keyframes lp-rise{ from{ opacity:0; transform:translateY(24px) } to{ opacity:1; transform:none } }
@keyframes lp-fade{ to{ opacity:1 } }
.lp-reveal{ animation:lp-rise .8s cubic-bezier(.2,.8,.25,1) both; animation-delay:var(--d,0ms); }

/* --- Features bento --- */
.lp-feature{ background:var(--card); padding:1.6rem 1.5rem 1.7rem; transition:background .25s; }
.lp-feature:hover{ background:var(--card-2); }
.lp-feature-icon{
  display:inline-flex; align-items:center; justify-content:center; width:46px; height:46px;
  border-radius:13px; border:2px solid var(--ink); transition:transform .3s cubic-bezier(.2,.8,.3,1);
}
.lp-feature:hover .lp-feature-icon{ transform:translateY(-3px) rotate(-4deg); }
.lp-accent-blue{ background:rgba(30,111,168,.14); color:var(--blue-deep); }
.lp-accent-rust{ background:rgba(191,71,42,.14); color:var(--rust-deep); }

/* --- Steps --- */
.lp-step{ position:relative; background:var(--card); border:2px solid var(--ink); border-radius:20px; padding:1.5rem 1.4rem 1.6rem; }
.lp-step-n{ font-size:2.4rem; font-weight:700; color:var(--rust); line-height:1; }
.lp-step-arrow{ position:absolute; right:-26px; top:50%; width:26px; height:26px; color:var(--ink-soft); transform:translateY(-50%); z-index:5; }
@media (max-width:639px){ .lp-step-arrow{ display:none } }

/* --- Open source band --- */
.lp-opensource{
  display:flex; flex-direction:column; gap:1.4rem; align-items:flex-start;
  background:var(--card); border:2px solid var(--ink); border-radius:24px;
  padding:clamp(1.5rem,4vw,2.2rem);
}
@media (min-width:720px){ .lp-opensource{ flex-direction:row; align-items:center; justify-content:space-between; } }

/* --- Final CTA --- */
.lp-cta{
  position:relative; overflow:hidden; border-radius:30px; border:2px solid var(--ink);
  background:linear-gradient(150deg,#243042,#16202f 60%,#101824);
  padding:clamp(2.2rem,6vw,4rem);
}
.lp-cta-halftone{
  position:absolute; inset:0; opacity:.5; pointer-events:none;
  background-image:radial-gradient(rgba(30,111,168,.5) 1.3px, transparent 1.6px);
  background-size:15px 15px;
  -webkit-mask-image:radial-gradient(80% 120% at 90% 110%, #000, transparent 70%);
  mask-image:radial-gradient(80% 120% at 90% 110%, #000, transparent 70%);
}

/* --- Footer --- */
.lp-foot-link{ font-size:.9rem; font-weight:500; color:var(--ink-2); text-decoration:none; transition:color .15s; }
.lp-foot-link:hover{ color:var(--rust); }

@media (prefers-reduced-motion:reduce){
  .lp-stagger > *,.lp-fade-in,.lp-reveal{
    animation:none !important; opacity:1 !important; transform:none !important;
  }
}
    `}</style>
  );
}
