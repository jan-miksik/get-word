import Link from 'next/link';
import { AppLogo } from '@/components/AppLogo';
import { useI18n } from '@/components/I18nProvider';
import { FACEBOOK_URL } from '@/lib/social-links';
import type { I18nKey } from '@/lib/i18n/messages';
import { CompactStoreCta, DesktopStoreNote } from './LandingAppStores';
import { LandingPaceSlider } from './LandingPaceSlider';
import { useDoubleActivate } from './LandingScratchBackground';
import {
  IconArrow,
  IconBot,
  IconCamera,
  IconGithub,
  IconMic,
  IconPen,
} from './LandingIcons';

const GITHUB_URL = 'https://github.com/jan-miksik/get-word';
const CONTACT_EMAIL = 'contact@getword.app';

/**
 * One shape for every section: a very large centred heading and prose held to a
 * single measure, with anything interactive allowed to run wider than the text.
 * That contrast is the page's only structural device — earlier versions gave
 * each section its own container and staggered the containers, which reads as
 * five equal boxes in a random order rather than as an argument with a shape.
 *
 * The sections are not equally important and are not dressed to look it: the
 * two carrying something to play with (the pace equation, the four ways in)
 * take up room, the supporting paragraphs stay quiet, and open source is the
 * smallest thing on the page.
 */
function Section({
  title,
  children,
  aside,
  asideFirst,
  quiet,
}: {
  title: string;
  children: React.ReactNode;
  /** Runs wider than the prose column: milestones, the ways, the language web. */
  aside?: React.ReactNode;
  /** Put the interactive part above the prose, where it is the actual argument. */
  asideFirst?: boolean;
  /** A closing note rather than a beat of the argument — smaller heading. */
  quiet?: boolean;
}) {
  const asideBlock = aside ? (
    <div className={`lp-section-aside ${asideFirst ? 'lp-section-aside--first' : ''}`}>{aside}</div>
  ) : null;
  return (
    <section className={`lp-section lp-haze ${quiet ? 'lp-section--quiet' : ''} lp-reveal`}>
      <div className="lp-section-head">
        <h2 className="lp-section-title lp-display">{title}</h2>
      </div>
      {asideFirst ? asideBlock : null}
      {children}
      {asideFirst ? null : asideBlock}
    </section>
  );
}

/**
 * "It is more of a marathon" — the pace of the thing, as an adjustable equation.
 * The equation comes first and the paragraph reads as a note under it: the
 * numbers are what makes the point, the prose only qualifies them.
 */
export function Marathon() {
  const { t } = useI18n();
  return (
    <Section title={t('landing.marathon.title')} aside={<LandingPaceSlider />} asideFirst>
      <p className="lp-prose">{t('landing.marathon.body')}</p>
    </Section>
  );
}

/** "You steer the selection". */
export function Choice() {
  const { t } = useI18n();
  return (
    <Section title={t('landing.choice.title')}>
      <p className="lp-prose">{t('landing.choice.body')}</p>
    </Section>
  );
}

const GROWTH_WAYS: Array<{
  title: I18nKey;
  body: I18nKey;
  Icon: (props: { className?: string }) => React.ReactNode;
  inProgress?: boolean;
}> = [
  {
    title: 'landing.growth.photo.title',
    body: 'landing.growth.photo.body',
    Icon: IconCamera,
  },
  {
    title: 'landing.growth.typing.title',
    body: 'landing.growth.typing.body',
    Icon: IconPen,
  },
  {
    title: 'landing.growth.bot.title',
    body: 'landing.growth.bot.body',
    Icon: IconBot,
  },
  {
    title: 'landing.growth.conversation.title',
    body: 'landing.growth.conversation.body',
    Icon: IconMic,
    inProgress: true,
  },
];

/** "Growing from several sides" — the four ways words get into a list. */
export function Growth() {
  const { t } = useI18n();
  return (
    <Section
      title={t('landing.growth.title')}
      aside={
        <ul className="lp-ways">
          {GROWTH_WAYS.map((way, index) => (
            <li
              key={way.title}
              className={`lp-way lp-reveal ${way.inProgress ? 'lp-way--soon' : ''}`}
              style={{ '--d': `${index * 60}ms` } as React.CSSProperties}
            >
              {/* The icon sits inside the heading line rather than above it:
                  stacked, it opened a band of empty space across all four cards
                  and the titles lost the top of the card to nothing. */}
              <h3 className="lp-way-title lp-display">
                <span className="lp-way-icon">
                  <way.Icon className="h-[1.35rem] w-[1.35rem]" />
                </span>
                <span className="lp-way-name">{t(way.title)}</span>
                {way.inProgress ? (
                  <span className="lp-badge lp-mono">{t('landing.growth.inProgress')}</span>
                ) : null}
              </h3>
              <p className="lp-way-body">{t(way.body)}</p>
            </li>
          ))}
        </ul>
      }
    >
      <p className="lp-prose">{t('landing.growth.intro')}</p>
    </Section>
  );
}

/**
 * "Almost everything with everything". The little web of language codes is
 * decorative: it says any-to-any faster than the paragraph can, and carries no
 * information the text does not already give, so it stays out of the a11y tree.
 */
export function Pairs() {
  const { t } = useI18n();
  return (
    <Section title={t('landing.pairs.title')} aside={<PairWeb />}>
      <p className="lp-prose">{t('landing.pairs.body')}</p>
    </Section>
  );
}

/**
 * Flags rather than language codes: the point of the picture is "any of these
 * with any of these", and a flag is read at a glance where "VI" has to be
 * decoded. Windows has no flag glyphs and falls back to the two regional
 * letters, which lands on roughly what this used to show anyway.
 */
const PAIR_WEB_FLAGS = ['🇬🇧', '🇨🇿', '🇺🇦', '🇻🇳', '🇪🇸', '🇩🇪', '🇵🇱', '🇯🇵'];

function PairWeb() {
  const cx = 170;
  const cy = 96;
  const rx = 116;
  const ry = 60;
  const nodes = PAIR_WEB_FLAGS.map((flag, index) => {
    const angle = (index / PAIR_WEB_FLAGS.length) * Math.PI * 2 - Math.PI / 2;
    return { flag, x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
  // Every chord, drawn once per unordered pair so the web reads as "each with
  // each" rather than a spoked wheel. The bow is negative — the curves arch
  // *away* from the middle — because 28 chords pulled inwards all pile up in the
  // centre and turn into a smudge; arching them out keeps the middle open.
  const bow = -0.34;
  const chords = nodes.flatMap((from, i) =>
    nodes.slice(i + 1).map((to) => {
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      return {
        key: `${from.flag}-${to.flag}`,
        d: `M${from.x.toFixed(1)} ${from.y.toFixed(1)} Q${(mx + (cx - mx) * bow).toFixed(1)} ${(
          my +
          (cy - my) * bow
        ).toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`,
      };
    })
  );
  return (
    <div className="lp-pairweb" aria-hidden="true">
      <svg viewBox="0 0 340 192" role="presentation" focusable="false">
        <g className="lp-pairweb-lines">
          {chords.map((chord) => (
            <path key={chord.key} d={chord.d} />
          ))}
        </g>
        {nodes.map((node) => (
          <g key={node.flag} className="lp-pairweb-node">
            <circle cx={node.x} cy={node.y} r="17" />
            <text x={node.x} y={node.y + 6}>
              {node.flag}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** "Open source" — the only outbound link on the page. */
export function OpenSource() {
  const { t } = useI18n();
  return (
    <Section quiet title={t('landing.openSource.title')}>
      <p className="lp-prose">{t('landing.openSource.body')}</p>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="lp-github-link group"
      >
        <IconGithub className="h-[1.15rem] w-[1.15rem]" />
        <span>github.com/jan-miksik/get-word</span>
        <IconArrow className="lp-btn-arrow" />
      </a>
    </Section>
  );
}

/**
 * The end: one big button, no headline. Everything that could be said has been
 * said above this point.
 *
 * Below the desktop breakpoint that button is the stores instead. Someone who
 * has read to the bottom of the page on a phone has decided; sending them to a
 * browser sign-in at that moment, when the app they would actually use is two
 * taps away, is the wrong close.
 */
export function FinalCta({ showLogin = true }: { showLogin?: boolean }) {
  const { t } = useI18n();
  return (
    <section className="lp-finish lp-reveal">
      {showLogin ? (
        // The toggle sits on a wrapper, not on the button: .lp-desktop-only
        // sets `display`, and on the button that would overwrite the
        // inline-flex that keeps its label and arrow on one line.
        <div className="lp-desktop-only lp-finish-desktop">
          <Link href="/login" className="lp-btn-primary lp-btn-finish group">
            {t('landing.cta.button')}
            <IconArrow className="lp-btn-arrow" />
          </Link>
          {/* The phone apps, mentioned once, after the browser close rather
              than instead of it: a desktop reader is being offered the build
              that runs on the screen in front of them first. */}
          <DesktopStoreNote />
        </div>
      ) : null}
      <div className="lp-compact-only lp-finish-compact">
        <CompactStoreCta
          showLogin={showLogin}
          onBeforeLogin={() => {}}
          loginLabel={t('landing.cta.button')}
          loginClassName="lp-btn-primary lp-btn-finish group"
        />
      </div>
    </section>
  );
}

export function SiteFooter({
  onLogoDoubleActivate,
}: {
  onLogoDoubleActivate?: () => void;
}) {
  const { t } = useI18n();
  const doubleActivate = useDoubleActivate(() => onLogoDoubleActivate?.());
  return (
    <footer className="flex flex-col gap-5 border-t border-[var(--line)] py-9 sm:flex-row sm:items-center sm:justify-between">
      {/* The second egg target, same gesture as the header one. The whole
          lockup answers to it — mark and wordmark — because "click the Get Word
          logo" reads as the thing with the name on it, not as the 28px square. */}
      <div className="lp-logo-egg flex items-center gap-3" {...doubleActivate}>
        <AppLogo size={28} />
        <span className="lp-display text-sm font-semibold text-[var(--ink)]">Get&nbsp;Word</span>
      </div>
      {/* No way into the app down here. The page leads with the store on a
          phone and with the picker on a desktop; a bare "Get started" among the
          legal links only offered a fourth, quieter answer to a question the
          rest of the page has already asked properly. */}
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="lp-foot-link">
          {t('landing.footer.github')}
        </a>
        <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="lp-foot-link">
          {t('social.facebook')}
        </a>
        <a href={`mailto:${CONTACT_EMAIL}`} className="lp-foot-link">{t('landing.footer.contact')}</a>
        <Link href="/support" className="lp-foot-link">{t('landing.footer.support')}</Link>
        <Link href="/privacy" className="lp-foot-link">{t('landing.footer.privacy')}</Link>
        <Link href="/terms" className="lp-foot-link">{t('landing.footer.terms')}</Link>
      </nav>
      <p className="lp-mono m-0 text-[0.72rem] text-[var(--ink-soft)]">
        © {new Date().getFullYear()} Get Word
      </p>
    </footer>
  );
}
