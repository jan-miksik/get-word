import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../I18nProvider';
import { InterfaceLanguageSelector } from '../InterfaceLanguageSelector';
import { PlatformCapabilitiesProvider } from '@/packages/product/shared/platform/capabilities';

describe('InterfaceLanguageSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ languageCode: 'de' }),
      }),
    );
  });

  it('shows flags in the trigger and language rows', async () => {
    render(
      <I18nProvider language="en">
        <InterfaceLanguageSelector value="en" onChange={vi.fn()} />
      </I18nProvider>,
    );

    expect(screen.getByRole('button', { name: 'App language' })).toHaveTextContent('🇬🇧');
    fireEvent.click(screen.getByRole('button', { name: 'App language' }));

    const czechOption = await screen.findByRole('option', { name: /Czech/i });
    expect(czechOption).toHaveTextContent('🇨🇿');
    expect(screen.getByText(/Auto means the interface translation/i)).toBeInTheDocument();
  });

  it('nudges the dropdown back inside narrow mobile viewports', async () => {
    const originalInnerWidth = window.innerWidth;
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    Element.prototype.getBoundingClientRect = function () {
      const className = String((this as Element).getAttribute('class') ?? '');
      if (className.includes('absolute') && className.includes('w-80')) {
        return {
          x: -8,
          y: 0,
          left: -8,
          right: 312,
          top: 0,
          bottom: 300,
          width: 320,
          height: 300,
          toJSON: () => ({}),
        };
      }
      return originalGetBoundingClientRect.call(this);
    };

    try {
      render(
        <I18nProvider language="en">
          <InterfaceLanguageSelector value="en" onChange={vi.fn()} align="right" />
        </I18nProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'App language' }));

      await waitFor(() => {
        const popup = document
          .querySelector('[data-testid="interface-language-selector"]')
          ?.querySelector('.absolute') as HTMLElement | null;
        expect(popup?.style.transform).toBe('translateX(20px)');
      });
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalInnerWidth,
      });
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it.each(['Czech', 'č', 'čeština', 'cestina'])('finds Czech by %s', async (query) => {
    render(
      <I18nProvider language="en">
        <InterfaceLanguageSelector value="en" onChange={vi.fn()} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'App language' }));
    fireEvent.change(await screen.findByRole('searchbox', { name: 'App language' }), {
      target: { value: query },
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Czech/i })).toBeInTheDocument();
    });
  });

  it('updates app language and public landing storage on selection', async () => {
    const onChange = vi.fn();
    render(
      <I18nProvider language="en">
        <InterfaceLanguageSelector value="en" onChange={onChange} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'App language' }));
    fireEvent.click(await screen.findByRole('option', { name: /Vietnamese/i }));

    expect(onChange).toHaveBeenCalledWith('vi');
    expect(localStorage.getItem('get-word-landing-lang')).toBe('vi');
  });

  it('shows only bundled languages and records a request for a missing one', async () => {
    render(
      <I18nProvider language="en">
        <InterfaceLanguageSelector value="en" onChange={vi.fn()} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'App language' }));
    expect(screen.queryByRole('option', { name: /German/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Request another app language/i }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search requestable languages' }), {
      target: { value: 'German' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /German/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/request for German has been saved/i);
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/ui-language-requests',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ languageCode: 'de' }),
      }),
    );
  });

  it('shows browser-translation help on web but not in the native app', () => {
    const { unmount } = render(
      <I18nProvider language="en">
        <InterfaceLanguageSelector value="en" onChange={vi.fn()} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'App language' }));
    expect(screen.getByText(/translate the whole page from your browser menu/i)).toBeInTheDocument();
    unmount();

    render(
      <PlatformCapabilitiesProvider
        value={{
          runtime: 'native',
          canInstallPwa: false,
          hasSecureTokenStorage: true,
          hasNativeHaptics: true,
        }}
      >
        <I18nProvider language="en">
          <InterfaceLanguageSelector value="en" onChange={vi.fn()} />
        </I18nProvider>
      </PlatformCapabilitiesProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'App language' }));
    expect(screen.queryByText(/translate the whole page from your browser menu/i)).not.toBeInTheDocument();
  });
});
