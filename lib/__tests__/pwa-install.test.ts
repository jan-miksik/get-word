import { afterEach, describe, expect, it } from 'vitest';
import { getInstallPlatform, isMobileDevice } from '@/lib/pwa-install';

// A desktop-mode iPad and a MacBook send the same user agent; only the touch
// point count tells them apart. See https://bugs.webkit.org/show_bug.cgi?id=212937.
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function setNavigator(userAgent: string, maxTouchPoints: number) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    value: maxTouchPoints,
    configurable: true,
  });
}

afterEach(() => {
  setNavigator(IPHONE_UA, 5);
});

describe('iPadOS desktop mode', () => {
  it('reads a touch-capable Macintosh as iOS', () => {
    setNavigator(MAC_UA, 5);

    expect(getInstallPlatform().isIOS).toBe(true);
    expect(isMobileDevice()).toBe(true);
  });

  it('leaves an actual Mac alone', () => {
    setNavigator(MAC_UA, 0);

    expect(getInstallPlatform().isIOS).toBe(false);
    expect(isMobileDevice()).toBe(false);
  });

  it('still recognises the devices that name themselves', () => {
    setNavigator(IPHONE_UA, 5);

    expect(getInstallPlatform().isIOS).toBe(true);
    expect(isMobileDevice()).toBe(true);
  });
});
