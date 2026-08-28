'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';
import { useStandaloneStatus } from '@/hooks/usePWAInstallState';
import type { I18nKey } from '@/lib/i18n/messages';
import { getInstallPlatform, isAndroid } from '@/lib/pwa-install';
import { getStoreDownloadUrl, type StoreTarget } from '@/lib/store-listing';
import { IconApple, IconArrow, IconGooglePlay } from './LandingIcons';

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

interface OrderedStoreLinks {
  links: StoreLink[];
  /** The store this device installs from, or null when neither is "the" one. */
  preferred: StoreTarget | null;
}

/**
 * Both listings, the device's own store first — or nothing at all for someone
 * who already has the app (installed, or reading this inside one of the shipped
 * apps), where a store button would be an offer they have already taken.
 */
function useOrderedStoreLinks(): OrderedStoreLinks {
  const platform = useDevicePlatform();
  const alreadyInstalled = useStandaloneStatus();
  if (alreadyInstalled) return { links: [], preferred: null };

  const preferred = preferredTarget(platform);
  const links = preferred
    ? [...STORE_LINKS].sort((left, right) => {
        if (left.target === preferred) return -1;
        if (right.target === preferred) return 1;
        return 0;
      })
    : STORE_LINKS;
  return { links, preferred };
}

function StoreLinkButton({
  link,
  primary,
  stacked,
}: {
  link: StoreLink;
  primary: boolean;
  stacked: boolean;
}) {
  const { t } = useI18n();
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`lp-store-link group ${primary ? 'lp-store-link--primary' : ''} ${
        stacked ? 'lp-store-link--stacked' : ''
      }`}
    >
      <link.Icon className="lp-store-icon" />
      <span>{t(link.labelKey)}</span>
      <IconArrow className="lp-btn-arrow" />
    </a>
  );
}

/**
 * The two store buttons on their own, for the places that are *only* a call to
 * action — the hero and the closing block below the desktop breakpoint, where
 * they stand in for the sign-in button rather than sitting under a heading.
 *
 * Returns null when there is nothing to offer, which callers must handle: on a
 * phone this is the whole call to action, and a screen with no action on it is
 * worse than one with the browser button the desktop shows.
 */
function StoreButtons({ stacked = false }: { stacked?: boolean }) {
  const { links, preferred } = useOrderedStoreLinks();
  if (links.length === 0) return null;
  return (
    <div className={`lp-stores ${stacked ? 'lp-stores--stacked' : ''}`}>
      {links.map((link) => (
        <StoreLinkButton
          key={link.target}
          link={link}
          // On a desktop neither store is "the" one, so both stay quiet rather
          // than arbitrarily promoting Play over the App Store.
          primary={link.target === preferred}
          stacked={stacked}
        />
      ))}
    </div>
  );
}

/**
 * "Get the app" — both listings, with the one this device can actually install
 * from put first and given the filled button.
 *
 * Rendered for signed-out web visitors only. Inside the shipped apps (the
 * Capacitor iOS build, the Play TWA) and for anyone who already installed the
 * PWA it is hidden: they have the app, and an iOS build that advertises a rival
 * marketplace is a review rejection rather than a feature.
 */
export function AppStores() {
  const { t } = useI18n();
  const { links } = useOrderedStoreLinks();
  if (links.length === 0) return null;

  return (
    <section className="lp-section lp-haze lp-section--quiet lp-reveal">
      <div className="lp-section-head">
        <h2 className="lp-section-title lp-display">{t('landing.stores.title')}</h2>
      </div>
      <p className="lp-prose">{t('landing.stores.body')}</p>
      <StoreButtons />
    </section>
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
  return <StoreLinkButton link={link} primary stacked={false} />;
}

/**
 * What the hero and the closing block show below 960px, where the page stops
 * being a desktop: the store buttons, with the browser kept as a quiet line
 * underneath rather than removed.
 *
 * Someone who already has the app installed gets no store buttons — for them
 * this falls back to the same primary button the desktop shows, because a
 * phone screen whose only call to action has vanished is the one outcome worse
 * than showing the browser path.
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
  const { links } = useOrderedStoreLinks();

  if (links.length === 0) {
    return showLogin ? (
      <Link href="/login" className={loginClassName} onClick={onBeforeLogin}>
        {loginLabel}
        <IconArrow className="lp-btn-arrow" />
      </Link>
    ) : null;
  }

  return (
    <div className="lp-compact-cta">
      <StoreButtons stacked />
      {showLogin ? (
        <Link href="/login" className="lp-browser-link" onClick={onBeforeLogin}>
          {t('landing.stores.useInBrowser')}
        </Link>
      ) : null}
    </div>
  );
}
