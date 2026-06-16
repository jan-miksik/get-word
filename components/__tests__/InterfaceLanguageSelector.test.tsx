import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../I18nProvider';
import { InterfaceLanguageSelector } from '../InterfaceLanguageSelector';

describe('InterfaceLanguageSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        languages: [
          { code: 'en', name: 'English', source: 'common', flag: '🇬🇧' },
          { code: 'cs', name: 'Czech', source: 'google', flag: '🇨🇿' },
          { code: 'de', name: 'German', source: 'google', flag: '🇩🇪' },
        ],
      }),
    }));
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
    fireEvent.click(await screen.findByRole('option', { name: /German/i }));

    expect(onChange).toHaveBeenCalledWith('de');
    expect(localStorage.getItem('get-word-landing-lang')).toBe('de');
  });
});
