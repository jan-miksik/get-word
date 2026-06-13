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
