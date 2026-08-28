import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompactStoreCta } from '../LandingAppStores';

const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function stubEnvironment({ ua, standalone = false }: { ua: string; standalone?: boolean }) {
  vi.stubGlobal('navigator', { ...window.navigator, userAgent: ua });
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

// The compact call to action is swapped in by a media query, which jsdom does
// not evaluate — so it is exercised directly rather than through the page.
function renderCta(showLogin = true) {
  return render(
    <CompactStoreCta
      showLogin={showLogin}
      onBeforeLogin={vi.fn()}
      loginLabel="Get started"
      loginClassName="lp-btn-primary"
    />,
  );
}

/** The fold, and whether it starts closed. */
function fold() {
  return document.querySelector('details') as HTMLDetailsElement | null;
}

describe('CompactStoreCta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows only Play on Android, with the rest folded away and closed', () => {
    stubEnvironment({ ua: ANDROID_UA });
    const { container } = renderCta();

    const details = fold();
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);

    // Play is the one button in the open; the App Store and the browser are
    // both inside the fold.
    const open = container.querySelector('.lp-stores') as HTMLElement;
    expect(within(open).getByRole('link', { name: /Google Play/ })).toBeInTheDocument();
    expect(within(open).queryByRole('link', { name: /App Store/ })).not.toBeInTheDocument();
    expect(within(details as HTMLElement).getByRole('link', { name: /App Store/ })).toBeInTheDocument();
    expect(
      within(details as HTMLElement).getByRole('link', { name: 'Or use it in the browser' }),
    ).toHaveAttribute('href', '/login');
  });

  it('shows only the App Store on iOS', () => {
    stubEnvironment({ ua: IPHONE_UA });
    const { container } = renderCta();

    const open = container.querySelector('.lp-stores') as HTMLElement;
    expect(within(open).getByRole('link', { name: /App Store/ })).toBeInTheDocument();
    expect(within(open).queryByRole('link', { name: /Google Play/ })).not.toBeInTheDocument();
  });

  // No store is "this device's" one, so there is nothing to promote — and
  // therefore nothing to fold away either.
  it('keeps both listings in the open when neither store is the device its own', () => {
    stubEnvironment({ ua: MAC_UA });
    renderCta();

    expect(fold()).toBeNull();
    expect(screen.getByRole('link', { name: /Google Play/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /App Store/ })).toBeInTheDocument();
  });

  // Firefox on Android: the stores work there, signing in does not.
  it('drops the browser line where signing in does not work', () => {
    stubEnvironment({ ua: ANDROID_UA });
    renderCta(false);

    expect(screen.getByRole('link', { name: /Google Play/ })).toBeInTheDocument();
    expect(screen.queryByText('Or use it in the browser')).not.toBeInTheDocument();
  });

  // On a phone this is the only call to action on the screen, so it must never
  // resolve to nothing at all.
  it('falls back to the sign-in button once the app is installed', () => {
    stubEnvironment({ ua: ANDROID_UA, standalone: true });
    renderCta();

    expect(screen.queryByRole('link', { name: /Google Play/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/login');
  });

  // The blue fill is gone: nothing here should read as an advert for itself.
  it('gives no store button an accent fill', () => {
    stubEnvironment({ ua: ANDROID_UA });
    const { container } = renderCta();

    expect(container.querySelector('.lp-store-link--primary')).toBeNull();
  });
});
