import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import {
  AppStateProvider,
  type AppStateContextValue,
} from '@/context/AppStateContext';
import type { WordChatPreferencePatch } from '../../hooks/useWordChat';
import { ChatSettingsModal } from '../ChatSettingsModal';

function renderModal() {
  const onChange = vi.fn<(patch: WordChatPreferencePatch) => void>();
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
          addressRegister="formal"
          salutationGender="male"
          languageLevel="B1"
          addressRegisterApplies
          salutationGenderApplies
          saving={false}
          onChange={onChange}
          onClose={onClose}
        />
      </I18nProvider>
    </AppStateProvider>,
  );

  return { onChange, onClose };
}

describe('ChatSettingsModal', () => {
  it('groups chat preferences and the interface language in a modal', () => {
    const { onChange } = renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Nastavení chatu' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass('max-w-2xl', 'overflow-visible');
    expect(dialog).toHaveStyle('--ob-surface: #F4EFE2');
    expect(screen.getByText('Jazyk rozhraní')).toBeInTheDocument();
    expect(screen.getByTestId('interface-language-selector')).toBeInTheDocument();
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
      screen.getByRole('dialog', { name: 'Nastavení chatu' }),
    ).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const { onClose } = renderModal();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
