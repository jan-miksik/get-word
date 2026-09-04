'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { useStandaloneStatus } from '@/hooks/usePWAInstallState';
import type { I18nKey } from '@/lib/i18n/messages';
import { getInstallPlatform, isAndroid } from '@/lib/pwa-install';
import { getStoreDownloadUrl, type StoreTarget } from '@/lib/store-listing';
import { IconApple, IconArrow, IconGooglePlay } from './LandingIcons';
import { AppStoreBadge, GooglePlayBadge } from './LandingStoreBadges';

/* ------------------------------------------------------------------ *
 * Which device is reading this
 * ------------------------------------------------------------------ */

type DevicePlatform = 'ios' | 'android' | 'other';

const noopSubscribe = () => () => {};

/**
 * The visitor's platform, used only to decide which of the two store buttons is
 * offered first.
 *
 * There is no reliable way to ask a browser "which app store serves you", and
 * the platform APIs that come close (`navigator.userAgentData`) are Chromium-
 * only and give no answer at all on the one platform that most needs one, iOS.
 * So this is user-agent sniffing — but it is the mild kind: getting it wrong
 * reorders two links that are both on the page either way, rather than hiding
 * the one the visitor needed. That is what makes it good enough here and would
 * not make it good enough for gating a feature.
 *
 * The server snapshot is `'other'`, which renders both stores as equals. So the
 * HTML a crawler, a store reviewer, or a no-JS visitor sees always contains
 * both listings, and the reorder happens after mount with no hydration drift.
 */
function useDevicePlatform(): DevicePlatform {
  return useSyncExternalStore(noopSubscribe, readDevicePlatform, () => 'other' as const);
}

function readDevicePlatform(): DevicePlatform {
  // Android first: an Android tablet reporting "Tablet" must not fall through
  // to the iPad branch of getInstallPlatform.
  if (isAndroid()) return 'android';
  return getInstallPlatform().isIOS ? 'ios' : 'other';
}

/* ------------------------------------------------------------------ *
 * The links themselves
 * ------------------------------------------------------------------ */

interface StoreLink {
  target: StoreTarget;
  url: string;
  labelKey: I18nKey;
  Icon: (props: { className?: string }) => React.ReactNode;
}

const STORE_LINKS: StoreLink[] = (
  [
    { target: 'play', labelKey: 'landing.stores.play', Icon: IconGooglePlay },
    { target: 'appStore', labelKey: 'landing.stores.appStore', Icon: IconApple },
  ] as const
).flatMap((link) => {
  const url = getStoreDownloadUrl(link.target);
  // A store with no id configured yet is dropped rather than linked into a 404.
  return url ? [{ ...link, url }] : [];
});

/** The store this platform actually buys apps from, or null on a desktop. */
function preferredTarget(platform: DevicePlatform): StoreTarget | null {
  if (platform === 'android') return 'play';
  if (platform === 'ios') return 'appStore';
  return null;
}

interface StoreChoice {
  /** The store this device installs from; null when neither is "the" one. */
  primary: StoreLink | null;
  /** Everything else on offer — the store this device is not on. */
  rest: StoreLink[];
}

const NOTHING_TO_OFFER: StoreChoice = { primary: null, rest: [] };

/**
 * The device's own store, and whatever is left over — or nothing at all for
 * someone who already has the app (installed, or reading this inside one of
 * the shipped apps), where a store button is an offer they have already taken.
 */
function useStoreChoice(): StoreChoice {
  const platform = useDevicePlatform();
  const alreadyInstalled = useStandaloneStatus();
  if (alreadyInstalled) return NOTHING_TO_OFFER;

  const preferred = preferredTarget(platform);
  if (!preferred) return { primary: null, rest: STORE_LINKS };
  return {
    primary: STORE_LINKS.find((link) => link.target === preferred) ?? null,
    rest: STORE_LINKS.filter((link) => link.target !== preferred),
  };
}

function StoreLinkButton({ link, stacked }: { link: StoreLink; stacked: boolean }) {
  const { t } = useI18n();
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`lp-store-link group ${stacked ? 'lp-store-link--stacked' : ''}`}
    >
      <link.Icon className="lp-store-icon" />
      <span>{t(link.labelKey)}</span>
      <IconArrow className="lp-btn-arrow" />
    </a>
  );
}

/**
 * The Play listing on its own, for the Firefox-on-Android notice: that is the
 * one audience whose sign-in is hidden entirely, so the store is not a nicety
 * for them but the only working way in.
 */
export function PlayStoreLink() {
  const link = STORE_LINKS.find((candidate) => candidate.target === 'play');
  if (!link) return null;
  return <StoreLinkButton link={link} stacked={false} />;
}

/**
 * A desktop-only line saying the phone apps exist, with both listings.
 *
 * Below 960px the stores *are* the call to action, so there is nothing to
 * mention. A desktop reader was the one visitor the page never told: the
 * picker and the closing button both lead to the browser build, which is the
 * right answer for the machine they are reading on, and left the phone
 * unsaid.
 *
 * Quiet on purpose — small type, both listings as equals, no "this device's
 * store" reordering, because a desktop is on neither. It carries no visibility
 * class of its own: the callers already sit inside a `.lp-desktop-only`
 * wrapper, and adding a second `display` rule to that element is what the
 * breakpoint comment in the stylesheet warns against.
 */
export function DesktopStoreNote() {
  const { t } = useI18n();
  const { primary, rest } = useStoreChoice();
  // On a desktop `primary` is null and `rest` is both stores; the branch is
  // only for a narrow desktop window on a phone-shaped UA, where CSS hides
  // this anyway. Someone already in the app gets neither.
  const links = primary ? [primary, ...rest] : rest;
  if (links.length === 0) return null;

  return (
    <div className="lp-store-note">
      <p className="lp-store-note-label">{t('landing.stores.desktopNote')}</p>
      <div className="lp-stores">
        {links.map((link) => (
          <StoreLinkButton key={link.target} link={link} stacked={false} />
        ))}
      </div>
    </div>
  );
}

/**
 * Anchor on the hero's store links, so a link further down the page can bring
 * the visitor back up to them.
 */
export const STORE_CTA_ANCHOR_ID = 'lp-store-cta';

/**
 * The two official badges, side by side, right under the hero tagline.
 *
 * Every other store link on this page (`StoreLinkButton`) is deliberately
 * recoloured to match the site's ink/paper palette. This one spot is the
 * opposite choice on purpose: the exact black lockup a visitor has already
 * seen on someone else's phone, so "this is a real app you install" reads on
 * sight, before a single word of copy does. Shown on every device — a desktop
 * reader is still one QR-scan-free way from finding out the app exists on
 * their phone too.
 *
 * On a phone these badges are the hero's only store offer, which is why they
 * carry the scroll anchor: the compact button block that used to sit below the
 * pitch is gone, and the demo card's closing link scrolls back here.
 */
export function HeroStoreBadges() {
  const { t } = useI18n();
  if (STORE_LINKS.length === 0) return null;

  return (
    <div id={STORE_CTA_ANCHOR_ID} className="lp-hero-badges">
      {STORE_LINKS.map((link) => (
        <a
          key={link.target}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t(link.labelKey)}
          className="lp-hero-badge-link"
        >
          {link.target === 'play' ? (
            <GooglePlayBadge className="lp-hero-badge" />
          ) : (
            <AppStoreBadge className="lp-hero-badge" />
          )}
        </a>
      ))}
    </div>
  );
}

function scrollToStoreCta(event: React.MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById(STORE_CTA_ANCHOR_ID);
  // Nothing to scroll to — a layout without the compact block, or no JS at all.
  // Leaving the click alone lets the href carry the visitor to /login instead
  // of swallowing the tap and doing nothing.
  if (!target) return;
  event.preventDefault();

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  if (reduced) {
    target.scrollIntoView({ block: 'center' });
    return;
  }

  const startedAt = window.scrollY;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // A smooth request is a request, not a promise: some engines drop it, and
  // every engine drops it while the tab is not being painted. A smooth scroll
  // that took the request is already moving well inside this window, so a
  // position that has not budged means it was ignored — and a tap that does
  // nothing at all is the one outcome worth guarding against here.
  window.setTimeout(() => {
    if (window.scrollY === startedAt) target.scrollIntoView({ block: 'center' });
  }, 250);
}

/**
 * A "start here" link that follows the same store-first rule as the rest of the
 * page once the window stops being a desktop.
 *
 * The header button and the demo card's closing link were the last two places
 * that walked a phone straight into the browser app, past the store buttons
 * every other call to action leads with. Desktop visitors, platforms we ship no
 * store build for, and anyone who already has the app keep the browser path
 * exactly as it was.
 *
 * The two get different compact treatment. The header button opens the listing,
 * because someone tapping it at the top of the page has decided already. The
 * demo card's link scrolls back to the store block instead: that tap comes
 * straight after playing, and answering it by throwing the visitor out of the
 * page into a store app is a bigger jump than showing them the choice they
 * scrolled past on the way down.
 *
 * Two elements rather than one link with a switched href: the breakpoint lives
 * in CSS, so deciding it in JS here would mean a media query that has to agree
 * with the stylesheet — including on the first paint, before hydration. The
 * visibility class sits on wrappers because it sets `display`, which on the
 * link itself would overwrite the inline-flex that keeps a label and its arrow
 * on one line.
 */
export function StoreFirstStartLink({
  label,
  className,
  onBeforeLogin,
  compactAction = 'openStore',
}: {
  label: string;
  className: string;
  onBeforeLogin: () => void;
  compactAction?: 'openStore' | 'scrollToStores';
}) {
  const { primary, rest } = useStoreChoice();

  const browserLink = (
    <Link href="/login" className={className} onClick={onBeforeLogin}>
      {label}
    </Link>
  );

  // Scrolling needs any store block at all; opening a listing needs this
  // device's own one. Neither survives an install: someone already running the
  // app is not being sent to fetch it again.
  const canScroll = Boolean(primary) || rest.length > 0;
  if (compactAction === 'scrollToStores' ? !canScroll : !primary) return browserLink;

  return (
    <>
      <span className="lp-desktop-only">{browserLink}</span>
      <span className="lp-compact-only">
        {compactAction === 'scrollToStores' ? (
          <a
            href="/login"
            className={className}
            onClick={(event) => {
              onBeforeLogin();
              scrollToStoreCta(event);
            }}
          >
            {label}
          </a>
        ) : (
          <a
            href={primary?.url}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
            // Still worth saving the pair they picked: it is waiting for them
            // when the installed app asks, or if they come back to this page.
            onClick={onBeforeLogin}
          >
            {label}
          </a>
        )}
      </span>
    </>
  );
}

/**
 * What the closing block shows below 960px, where the page stops being a
 * desktop. The hero used to carry a copy of this too; below the official
 * badges it was the same two listings offered a second time, so on a phone
 * this now appears once, at the end of the page.
 *
 * One button — the store this phone actually installs from — and everything
 * else folded away behind "other options": the store it is not on, and the
 * browser. A phone screen has room for one decision, and offering the App
 * Store to an Android is noise on the way to the only line that applies.
 *
 * The fold is a plain <details>, so it needs no state, no JavaScript to open,
 * and is keyboard-operable for free.
 *
 * Someone who already has the app installed gets no store buttons — for them
 * this falls back to the same button the desktop shows, because a phone screen
 * whose only call to action has vanished is the one outcome worse than showing
 * the browser path.
 */
export function CompactStoreCta({
  showLogin,
  onBeforeLogin,
  loginLabel,
  loginClassName,
}: {
  /** False on browsers where signing in does not work; see the Firefox notice. */
  showLogin: boolean;
  onBeforeLogin: () => void;
  loginLabel: string;
  loginClassName: string;
}) {
  const { t } = useI18n();
  const { primary, rest } = useStoreChoice();

  const browserLink = showLogin ? (
    <Link href="/login" className="lp-browser-link" onClick={onBeforeLogin}>
      {t('landing.stores.useInBrowser')}
    </Link>
  ) : null;

  if (!primary && rest.length === 0) {
    return showLogin ? (
      <Link href="/login" className={loginClassName} onClick={onBeforeLogin}>
        {loginLabel}
        <IconArrow className="lp-btn-arrow" />
      </Link>
    ) : null;
  }

  // No store is "this device's" one — an unrecognised mobile browser, or a
  // narrow desktop window. With nothing to promote there is nothing to fold
  // away either, so both listings stay in the open.
  if (!primary) {
    return (
      <div className="lp-compact-cta">
        <div className="lp-stores lp-stores--stacked">
          {rest.map((link) => (
            <StoreLinkButton key={link.target} link={link} stacked />
          ))}
        </div>
        {browserLink}
      </div>
    );
  }

  return (
    <div className="lp-compact-cta">
      <div className="lp-stores lp-stores--stacked">
        <StoreLinkButton link={primary} stacked />
      </div>
      <details className="lp-other-options">
        <summary className="lp-other-options-summary">
          {t('landing.stores.otherOptions')}
        </summary>
        <div className="lp-other-options-body">
          <div className="lp-stores lp-stores--stacked">
            {rest.map((link) => (
              <StoreLinkButton key={link.target} link={link} stacked />
            ))}
          </div>
          {browserLink}
        </div>
      </details>
    </div>
  );
}
