import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStores } from '../LandingAppStores';
import { PLAY_PACKAGE_ID } from '@/lib/store-listing';

const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function stubUserAgent(userAgent: string) {
  vi.stubGlobal('navigator', { ...window.navigator, userAgent });
}

function stubDisplayMode(standalone: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: standalone && query.includes('standalone'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function storeLinks() {
  return Array.from(document.querySelectorAll('.lp-store-link')).map((node) => ({
    label: node.textContent?.trim(),
    primary: node.classList.contains('lp-store-link--primary'),
  }));
}

describe('AppStores', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers both listings, neither promoted, on a desktop', () => {
    stubUserAgent(MAC_UA);
    stubDisplayMode(false);
    render(<AppStores />);

    expect(storeLinks()).toEqual([
      { label: 'Google Play', primary: false },
      { label: 'App Store', primary: false },
    ]);
    expect(screen.getByRole('link', { name: /Google Play/ })).toHaveAttribute(
      'href',
      `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE_ID}`,
    );
  });

  it('puts Play first and fills it on Android', () => {
    stubUserAgent(ANDROID_UA);
    stubDisplayMode(false);
    render(<AppStores />);

    expect(storeLinks()).toEqual([
      { label: 'Google Play', primary: true },
      { label: 'App Store', primary: false },
    ]);
  });

  it('puts the App Store first and fills it on iOS', () => {
    stubUserAgent(IPHONE_UA);
    stubDisplayMode(false);
    render(<AppStores />);

    expect(storeLinks()).toEqual([
      { label: 'App Store', primary: true },
      { label: 'Google Play', primary: false },
    ]);
  });

  // Someone reading this already has the app; on the iOS build, advertising a
  // rival marketplace is also a review rejection.
  it('renders nothing once the app is installed', () => {
    stubUserAgent(ANDROID_UA);
    stubDisplayMode(true);
    const { container } = render(<AppStores />);

    expect(container).toBeEmptyDOMElement();
  });
});
