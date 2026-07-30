import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import {
  AppStateProvider,
  type AppStateContextValue,
} from '@/context/AppStateContext';
import { WordChatSettingsControls } from '../WordChatSettingsControls';

const mocks = vi.hoisted(() => ({
  onListUpdated: null as ((list: { id: string; isPublic: boolean }) => void) | null,
}));

vi.mock('@/features/lists/components/ShareVisibilityDialog', () => ({
  ShareVisibilityDialog: ({ onListUpdated }: { onListUpdated?: (list: { id: string; isPublic: boolean }) => void }) => {
    mocks.onListUpdated = onListUpdated ?? null;
    return <div data-testid="share-dialog" />;
  },
}));

vi.mock('@/features/shared/languages/useSupportedLanguages', () => ({
  useSupportedLanguages: () => ({
    loading: false,
    languages: [
      { code: 'cs', name: 'Czech', flag: '🇨🇿' },
      { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    ],
  }),
}));

const appState = {
  settingsLanguage: 'cs',
  setSettingsLanguage: vi.fn(),
} as unknown as AppStateContextValue;

function renderControls(props: Partial<Parameters<typeof WordChatSettingsControls>[0]> = {}) {
  return render(
    <AppStateProvider value={appState}>
      <I18nProvider language="cs">
        <WordChatSettingsControls
          languageFrom="cs"
          languageTo="es"
          addressRegister="formal"
          salutationGender="male"
          languageLevel="B1"
          addressRegisterApplies
          salutationGenderApplies
          saving={false}
          onChange={vi.fn()}
          onLanguagePairChange={vi.fn()}
          {...props}
        />
      </I18nProvider>
    </AppStateProvider>,
  );
}

describe('WordChatSettingsControls', () => {
  it('reports open/close through onOpenChange when controlled', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    renderControls({ open: false, onOpenChange });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nastavení pro přidání vlastních slovíček' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('shows the modal open when the controlled state says so — surviving a remount', () => {
    // A remount with `open` still true is exactly what a language-pair change
    // produces; the modal must come back up rather than stay closed.
    renderControls({ open: true, onOpenChange: vi.fn() });
    expect(screen.getByRole('dialog', { name: 'Nastavení pro přidání vlastních slovíček' })).toBeInTheDocument();
  });

  it('forwards saved share metadata to its owner', () => {
    const onShareListUpdated = vi.fn();
    renderControls({
      shareList: {
        id: 'list-1',
        ownerId: null,
        name: 'Moje slovíčka',
        description: null,
        languageFrom: 'cs',
        languageTo: 'es',
        isPublic: false,
        isOwner: true,
      },
      onShareListUpdated,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sdílení a viditelnost' }));
    expect(screen.getByTestId('share-dialog')).toBeInTheDocument();

    mocks.onListUpdated?.({ id: 'list-1', isPublic: true });
    expect(onShareListUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'list-1', isPublic: true }),
    );
  });
});
