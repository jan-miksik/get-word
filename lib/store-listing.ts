// Single source of truth for the app's public store identity, used by the
// rate-the-app entry in Settings and by the study-deck rating prompt.

// The Android package name, as registered in Play Console. It is permanent
// after the first upload, so it is a constant rather than a setting.
export const PLAY_PACKAGE_ID = 'app.getword';

// Apple assigns the numeric app id when the app record is created in App Store
// Connect (Apple ID, on the App Information page). Until it is filled in here,
// the iOS rate entry stays hidden rather than linking somewhere that 404s.
export const APPLE_APP_ID: string | null = '6796635158';

export type StoreTarget = 'play' | 'appStore';

export interface StoreEnvironment {
  runtime: 'web' | 'native';
  isAndroid: boolean;
  isInstalled: boolean;
}

/**
 * Which store listing, if any, this runtime can send the user to.
 *
 * A plain browser tab has no store entry behind it, so it resolves to `null`
 * and the rate entry stays hidden. On Android we require the app to be
 * installed: an installed build is either the Play TWA or a home-screen
 * install, and only the former can actually leave a rating — but both have a
 * real listing to open, whereas a browser visitor has nothing to rate.
 */
export function resolveStoreTarget(env: StoreEnvironment): StoreTarget | null {
  if (env.runtime === 'native') return env.isAndroid ? 'play' : 'appStore';
  if (env.isAndroid && env.isInstalled) return 'play';
  return null;
}

/**
 * The https listing URL for a store. Both platforms deep-link these into the
 * native store app, so there is no need for `market://` or `itms-apps://`
 * schemes — which fail visibly when no store app is installed.
 *
 * Play's `showAllReviews` parameter opens the listing with the review sheet in
 * view. It is a hint, not a guarantee: Play ignores it on some versions, in
 * which case the user lands on the normal listing.
 */
export function getStoreListingUrl(target: StoreTarget): string | null {
  if (target === 'play') {
    return `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE_ID}&showAllReviews=true`;
  }
  if (!APPLE_APP_ID) return null;
  return `https://apps.apple.com/app/id${APPLE_APP_ID}?action=write-review`;
}

/**
 * The plain listing URL, for "get the app" links rather than "rate the app"
 * ones — no `showAllReviews` / `action=write-review`, which would open a
 * visitor who has never used Get Word straight on a review sheet.
 *
 * Deliberately without an `hl=` / country segment: both stores localize the
 * listing from the visitor's own account and Accept-Language, and pinning a
 * language would serve every visitor the Czech page.
 */
export function getStoreDownloadUrl(target: StoreTarget): string | null {
  if (target === 'play') {
    return `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE_ID}`;
  }
  if (!APPLE_APP_ID) return null;
  return `https://apps.apple.com/app/id${APPLE_APP_ID}`;
}
