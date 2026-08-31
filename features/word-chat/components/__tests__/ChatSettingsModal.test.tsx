import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import {
  AppStateProvider,
  type AppStateContextValue,
} from '@/context/AppStateContext';
import type { WordChatPreferencePatch } from '../../hooks/useWordChat';
import { ChatSettingsModal } from '../ChatSettingsModal';

vi.mock('@/features/shared/languages/useSupportedLanguages', () => ({
  useSupportedLanguages: () => ({
    loading: false,
    languages: [
      { code: 'cs', name: 'Czech', flag: '🇨🇿' },
      { code: 'es', name: 'Spanish', flag: '🇪🇸' },
      { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
    ],
  }),
}));

function renderModal() {
  const onChange = vi.fn<(patch: WordChatPreferencePatch) => void>();
  const onLanguagePairChange =
    vi.fn<(pair: { from: string; to: string }) => void>();
  const onClose = vi.fn<() => void>();
  const appState = {
    settingsLanguage: 'cs',
    setSettingsLanguage: vi.fn(),
  } as unknown as AppStateContextValue;

  render(
    <AppStateProvider value={appState}>
      <I18nProvider language="cs">
        <ChatSettingsModal
          isOpen
          languageFrom="cs"
          languageTo="es"
          addressRegister="formal"
          salutationGender="male"
          languageLevel="B1"
          addressRegisterApplies
          salutationGenderApplies
          saving={false}
          onChange={onChange}
          onLanguagePairChange={onLanguagePairChange}
          onClose={onClose}
        />
      </I18nProvider>
    </AppStateProvider>,
  );

  return { onChange, onLanguagePairChange, onClose };
}

describe('ChatSettingsModal', () => {
  it('groups chat preferences and the interface language in a modal', () => {
    const { onChange } = renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Nastavení pro přidání vlastních slovíček' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass('max-w-2xl', 'overflow-visible');
    // The warm palette is handed over as var() handles now; the value itself
    // lives once, in styles/tokens.css.
    expect(dialog).toHaveStyle('--ob-surface: var(--paper)');
    expect(screen.getByText('Jazyk rozhraní')).toBeInTheDocument();
    expect(screen.getByTestId('interface-language-selector')).toBeInTheDocument();
    expect(screen.queryByText('Studijní jazyky')).not.toBeInTheDocument();
    expect(screen.getByText('Znám')).toBeInTheDocument();
    expect(screen.getByText('Učím se')).toBeInTheDocument();
    expect(
      screen.queryByRole('group', {
        name: 'Znám: čeština. Učím se: španělština.',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Oslovení v chatu' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Rod oslovení' })).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Jak moc umím cizí jazyk' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /B1 — Zvládnu běžný rozhovor/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Tykej mi' }));

    expect(onChange).toHaveBeenCalledWith({ addressRegister: 'casual' });
    expect(
      screen.getByRole('dialog', { name: 'Nastavení pro přidání vlastních slovíček' }),
    ).toBeInTheDocument();
  });

  it('edits the list and category names when the callbacks are provided', () => {
    const onListNameChange = vi.fn<(value: string) => void>();
    const onCategoryNameChange = vi.fn<(value: string) => void>();
    const appState = {
      settingsLanguage: 'cs',
      setSettingsLanguage: vi.fn(),
    } as unknown as AppStateContextValue;

    render(
      <AppStateProvider value={appState}>
        <I18nProvider language="cs">
          <ChatSettingsModal
            isOpen
            languageFrom="cs"
            languageTo="es"
            listName="Moje slovíčka"
            categoryName="Káva"
            onListNameChange={onListNameChange}
            onCategoryNameChange={onCategoryNameChange}
            addressRegister="formal"
            salutationGender="male"
            languageLevel="B1"
            addressRegisterApplies
            salutationGenderApplies
            saving={false}
            onChange={vi.fn()}
            onLanguagePairChange={vi.fn()}
            onClose={vi.fn()}
          />
        </I18nProvider>
      </AppStateProvider>,
    );

    const listInput = screen.getByDisplayValue('Moje slovíčka');
    fireEvent.change(listInput, { target: { value: 'Nový název' } });
    expect(onListNameChange).toHaveBeenCalledWith('Nový název');

    const categoryInput = screen.getByDisplayValue('Káva');
    fireEvent.change(categoryInput, { target: { value: 'Nápoje' } });
    expect(onCategoryNameChange).toHaveBeenCalledWith('Nápoje');
  });

  it('omits the naming fields when no naming callbacks are passed', () => {
    renderModal();
    expect(screen.queryByText('Název slovníku')).not.toBeInTheDocument();
    expect(screen.queryByText('Název kategorie')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const { onClose } = renderModal();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('changes the study pair as soon as a language is picked', async () => {
    const { onLanguagePairChange } = renderModal();

    const targetPicker = screen.getByRole('combobox', { name: 'Učím se language' });
    fireEvent.focus(targetPicker);
    fireEvent.click(screen.getByRole('option', { name: /vietnamština/i }));

    await waitFor(() => {
      expect(onLanguagePairChange).toHaveBeenCalledWith({ from: 'cs', to: 'vi' });
    });
    // The picked language is the decision; no separate confirmation step.
    expect(
      screen.queryByRole('button', { name: 'Použít tyto jazyky' }),
    ).not.toBeInTheDocument();
  });
});
