'use client';

import { useSyncExternalStore } from 'react';
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

function StoreLinkButton({ link, primary }: { link: StoreLink; primary: boolean }) {
  const { t } = useI18n();
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`lp-store-link group ${primary ? 'lp-store-link--primary' : ''}`}
    >
      <link.Icon className="lp-store-icon" />
      <span>{t(link.labelKey)}</span>
      <IconArrow className="lp-btn-arrow" />
    </a>
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
  const platform = useDevicePlatform();
  const alreadyInstalled = useStandaloneStatus();
  if (alreadyInstalled || STORE_LINKS.length === 0) return null;

  const preferred = preferredTarget(platform);
  const ordered = preferred
    ? [...STORE_LINKS].sort((left, right) => {
        if (left.target === preferred) return -1;
        if (right.target === preferred) return 1;
        return 0;
      })
    : STORE_LINKS;

  return (
    <section className="lp-section lp-haze lp-section--quiet lp-reveal">
      <div className="lp-section-head">
        <h2 className="lp-section-title lp-display">{t('landing.stores.title')}</h2>
      </div>
      <p className="lp-prose">{t('landing.stores.body')}</p>
      <div className="lp-stores">
        {ordered.map((link) => (
          <StoreLinkButton
            key={link.target}
            link={link}
            // On a desktop neither store is "the" one, so both stay quiet
            // rather than arbitrarily promoting Play over the App Store.
            primary={link.target === preferred}
          />
        ))}
      </div>
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
  return <StoreLinkButton link={link} primary />;
}
