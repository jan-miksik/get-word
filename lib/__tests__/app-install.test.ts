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
    expect(resolveAppInstallPlan({ ...MOBILE_WEB, isMobile: false, isIOS: true })).toBeNull();
    expect(resolveAppInstallPlan({ ...MOBILE_WEB, runtime: 'native', isAndroid: true })).toBeNull();
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
