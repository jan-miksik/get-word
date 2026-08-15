import { describe, expect, it } from 'vitest';
import {
  APPLE_APP_ID,
  PLAY_PACKAGE_ID,
  getStoreListingUrl,
  resolveStoreTarget,
} from '@/lib/store-listing';

describe('resolveStoreTarget', () => {
  it('sends a browser tab nowhere', () => {
    expect(
      resolveStoreTarget({ runtime: 'web', isAndroid: true, isInstalled: false })
    ).toBeNull();
    expect(
      resolveStoreTarget({ runtime: 'web', isAndroid: false, isInstalled: false })
    ).toBeNull();
  });

  it('sends an installed Android app to Play', () => {
    expect(
      resolveStoreTarget({ runtime: 'web', isAndroid: true, isInstalled: true })
    ).toBe('play');
  });

  it('leaves an installed iOS home-screen PWA without a store', () => {
    // An iOS PWA is not an App Store install, so there is nothing to rate.
    expect(
      resolveStoreTarget({ runtime: 'web', isAndroid: false, isInstalled: true })
    ).toBeNull();
  });

  it('sends the native shells to their own stores', () => {
    expect(
      resolveStoreTarget({ runtime: 'native', isAndroid: false, isInstalled: true })
    ).toBe('appStore');
    expect(
      resolveStoreTarget({ runtime: 'native', isAndroid: true, isInstalled: true })
    ).toBe('play');
  });
});

describe('getStoreListingUrl', () => {
  it('builds the Play listing URL from the package id', () => {
    const url = getStoreListingUrl('play');
    expect(url).toContain(`id=${PLAY_PACKAGE_ID}`);
    expect(url?.startsWith('https://play.google.com/store/apps/details?')).toBe(true);
  });

  it('has no App Store URL until the numeric Apple id is filled in', () => {
    // Guards the placeholder: once APPLE_APP_ID is set, the URL must be built
    // from it rather than staying null and silently hiding the iOS entry.
    if (APPLE_APP_ID === null) {
      expect(getStoreListingUrl('appStore')).toBeNull();
    } else {
      expect(getStoreListingUrl('appStore')).toContain(`id${APPLE_APP_ID}`);
    }
  });
});
