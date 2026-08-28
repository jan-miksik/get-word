import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompactStoreCta } from '../LandingAppStores';

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

function stubStandalone(standalone: boolean) {
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

describe('CompactStoreCta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers both stores with the browser kept as a quiet line', () => {
    stubStandalone(false);
    renderCta();

    expect(screen.getByRole('link', { name: /Google Play/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /App Store/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Or use it in the browser' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  // Firefox on Android: the stores work there, signing in does not.
  it('drops the browser line where signing in does not work', () => {
    stubStandalone(false);
    renderCta(false);

    expect(screen.getByRole('link', { name: /Google Play/ })).toBeInTheDocument();
    expect(screen.queryByText('Or use it in the browser')).not.toBeInTheDocument();
  });

  // On a phone this is the only call to action on the screen, so it must never
  // resolve to nothing at all.
  it('falls back to the sign-in button once the app is installed', () => {
    stubStandalone(true);
    renderCta();

    expect(screen.queryByRole('link', { name: /Google Play/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/login');
  });
});
