import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { RateAppLink } from '../RateAppLink';
import { PLAY_PACKAGE_ID } from '@/lib/store-listing';
import {
  PlatformCapabilitiesProvider,
  type PlatformCapabilities,
} from '@/packages/product/shared/platform/capabilities';

const WEB: PlatformCapabilities = {
  runtime: 'web',
  canInstallPwa: true,
  hasSecureTokenStorage: false,
  hasNativeHaptics: false,
};

function renderLink(capabilities: PlatformCapabilities = WEB) {
  return render(
    <PlatformCapabilitiesProvider value={capabilities}>
      <I18nProvider language="cs">
        <RateAppLink />
      </I18nProvider>
    </PlatformCapabilitiesProvider>
  );
}

function setAndroidInstalled(installed: boolean) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124 Mobile',
    configurable: true,
  });
  window.matchMedia = ((query: string) => ({
    matches: query === '(display-mode: standalone)' ? installed : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe('RateAppLink', () => {
  it('renders nothing in an Android browser tab', () => {
    setAndroidInstalled(false);
    const { container } = renderLink();
    expect(container).toBeEmptyDOMElement();
  });

  it('links to the Play listing from the installed Android app', () => {
    setAndroidInstalled(true);
    renderLink();
    const link = screen.getByRole('link', { name: /ohodnotit aplikaci/i });
    expect(link.getAttribute('href')).toContain(`id=${PLAY_PACKAGE_ID}`);
  });
});
