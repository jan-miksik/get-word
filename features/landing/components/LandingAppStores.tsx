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
 * What the hero and the closing block show below 960px, where the page stops
 * being a desktop.
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
