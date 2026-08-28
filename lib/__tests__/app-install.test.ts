import { describe, expect, it } from 'vitest';
import { resolveAppInstallPlan, type AppInstallEnvironment } from '@/lib/app-install';

const MOBILE_WEB: AppInstallEnvironment = {
  runtime: 'web',
  isInstalled: false,
  isMobile: true,
  isIOS: false,
  isAndroid: false,
};

describe('resolveAppInstallPlan', () => {
  it('offers nothing on a desktop or inside the shipped apps', () => {
    expect(resolveAppInstallPlan({ ...MOBILE_WEB, isMobile: false })).toBeNull();
    expect(resolveAppInstallPlan({ ...MOBILE_WEB, isMobile: false, isAndroid: true })).toBeNull();
    expect(resolveAppInstallPlan({ ...MOBILE_WEB, runtime: 'native', isAndroid: true })).toBeNull();
  });

  // iPadOS Safari runs in desktop mode, so an iPad reports a window wider than
  // any phone breakpoint. It still installs from the App Store, so the width
  // gate must not swallow it — that is what left iPads with the home-screen
  // hint, or with nothing at all in landscape.
  it('offers the App Store to an iPad whatever the window width', () => {
    const plan = resolveAppInstallPlan({ ...MOBILE_WEB, isMobile: false, isIOS: true });

    expect(plan?.store?.target).toBe('appStore');
    expect(plan?.offerHomeScreen).toBe(false);
  });

  // Whoever already added Get Word to their home screen keeps it, on both
  // platforms. Dropping the iOS install flow changed what we *offer*; it must
  // never reach back and pester someone whose install already works — least of
  // all on iOS, where that install can no longer be recreated.
  it('leaves an existing home-screen install alone', () => {
    expect(resolveAppInstallPlan({ ...MOBILE_WEB, isInstalled: true, isIOS: true })).toBeNull();
    expect(resolveAppInstallPlan({ ...MOBILE_WEB, isInstalled: true, isAndroid: true })).toBeNull();
  });

  // The iOS half of "drop the PWA": add-to-home-screen is not offered at all
  // now that the App Store build exists.
  it('offers only the App Store on iOS', () => {
    const plan = resolveAppInstallPlan({ ...MOBILE_WEB, isIOS: true });

    expect(plan?.store?.target).toBe('appStore');
    expect(plan?.store?.url).toContain('apps.apple.com');
    expect(plan?.offerHomeScreen).toBe(false);
  });

  // Play does not serve every Android device, so the fallback has to survive.
  it('leads with Play on Android but keeps the home-screen fallback', () => {
    const plan = resolveAppInstallPlan({ ...MOBILE_WEB, isAndroid: true });

    expect(plan?.store?.target).toBe('play');
    expect(plan?.store?.url).toContain('play.google.com');
    expect(plan?.offerHomeScreen).toBe(true);
  });

  it('falls back to the home screen on a mobile browser with no store build', () => {
    expect(resolveAppInstallPlan(MOBILE_WEB)).toEqual({ store: null, offerHomeScreen: true });
  });
});
