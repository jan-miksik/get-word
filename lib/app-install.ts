// Which install path Get Word offers a given device.
//
// This used to be one answer — add to home screen — and every surface worked it
// out for itself from `getInstallPlatform()`. Now that the app ships in both
// stores, the answer differs per platform and has to be the same everywhere it
// is asked (top menu, Settings, the intro card, the onboarding step), so it
// lives here as one pure function over an explicit environment.

import { getStoreDownloadUrl, type StoreTarget } from './store-listing';

export interface AppInstallEnvironment {
  /** 'native' means we are already running inside one of the shipped apps. */
  runtime: 'web' | 'native';
  isInstalled: boolean;
  /** Phone-sized: nothing here is offered on a desktop. */
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
}

export interface AppInstallPlan {
  /** The store listing to send this device to, when one serves it. */
  store: { target: StoreTarget; url: string } | null;
  /** Whether add-to-home-screen is still worth offering underneath. */
  offerHomeScreen: boolean;
}

/**
 * What to offer, or `null` for "offer nothing" — a desktop, a device that
 * already has the app, or one of the shipped apps itself.
 *
 * The two platforms are deliberately not symmetrical:
 *
 *   iOS      — the App Store build replaces add-to-home-screen outright. A PWA
 *              on iOS is a second, worse copy of an app the visitor can simply
 *              install, and keeping both on offer only splits the choice.
 *   Android  — Play leads, but add-to-home-screen stays available underneath.
 *              Play does not serve every Android device (degoogled builds,
 *              Huawei), and those visitors would otherwise have no install at
 *              all. They report the same UA, so they land on this branch and
 *              find the fallback already sitting there.
 */
export function resolveAppInstallPlan(env: AppInstallEnvironment): AppInstallPlan | null {
  if (env.runtime === 'native' || env.isInstalled || !env.isMobile) return null;

  if (env.isIOS) {
    const url = getStoreDownloadUrl('appStore');
    // No listing configured means nothing to offer: on iOS there is no longer a
    // home-screen path to fall back to.
    return url ? { store: { target: 'appStore', url }, offerHomeScreen: false } : null;
  }

  if (env.isAndroid) {
    const url = getStoreDownloadUrl('play');
    return {
      store: url ? { target: 'play', url } : null,
      offerHomeScreen: true,
    };
  }

  // Neither platform — a mobile browser we have no store build for.
  return { store: null, offerHomeScreen: true };
}
