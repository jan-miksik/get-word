import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { AddWordsScreen } from '../AddWordsScreen';
import type { WordChatEntryActions } from '../WordChatFlow';

/**
 * The flow below the tab bar is stubbed: what these tests are about is the way
 * in — which tab is showing, what pressing another one does, and where the
 * words picked off a photo end up. The flow's own steps have their own tests.
 */
const entryActions: WordChatEntryActions = {
  startManual: vi.fn(),
  startChat: vi.fn(),
  addPretranslatedItems: vi.fn(),
};

vi.mock('../WordChatFlow', () => ({
  WordChatFlow: ({
    onEntryActionsChange,
  }: {
    onEntryActionsChange?: (actions: WordChatEntryActions | null) => void;
  }) => {
    onEntryActionsChange?.(entryActions);
    return <div data-testid="word-chat-flow" />;
  },
}));

function renderScreen(props: Partial<Parameters<typeof AddWordsScreen>[0]> = {}) {
  return render(
    <I18nProvider language="en">
      <AddWordsScreen
        languageFrom="cs"
        languageTo="vi"
        onLanguagePairChange={vi.fn()}
        onClose={vi.fn()}
        onCommitted={vi.fn()}
        {...props}
      />
    </I18nProvider>,
  );
}

describe('AddWordsScreen tabs', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('offers typing and the conversation, and adds the photo tab only where the lab is on', () => {
    const { unmount } = renderScreen();

    expect(screen.getByRole('tab', { name: 'By typing' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'With AI' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'From a photo' })).not.toBeInTheDocument();
    unmount();

    renderScreen({ photoTabAvailable: true });
    expect(screen.getByRole('tab', { name: 'From a photo' })).toBeInTheDocument();
  });

  it('sends the learner to the surface the photo tab lives on, and opens the chat in place', () => {
    const onTabChange = vi.fn();
    renderScreen({ photoTabAvailable: true, onTabChange });

    fireEvent.click(screen.getByRole('tab', { name: 'From a photo' }));
    expect(onTabChange).toHaveBeenCalledExactlyOnceWith('photo');
    // The photo tab is an address of its own; the conversation is not.
    expect(entryActions.startChat).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'With AI' }));
    expect(entryActions.startChat).toHaveBeenCalledOnce();
  });

  it('drops the words picked off a photo into the basket and comes back to it', () => {
    const onTabChange = vi.fn();
    renderScreen({
      photoTabAvailable: true,
      photoTabActive: true,
      onTabChange,
      photoTab: ({ pickWords }) => (
        <button
          type="button"
          onClick={() =>
            pickWords([{ known: 'stůl', target: 'cái bàn', audioHash: 'abc' }])
          }
        >
          pick
        </button>
      ),
    });

    fireEvent.click(screen.getByRole('button', { name: 'pick' }));

    expect(entryActions.addPretranslatedItems).toHaveBeenCalledExactlyOnceWith([
      { textKnown: 'stůl', textTarget: 'cái bàn', audioHash: 'abc' },
    ]);
    // Picking is done; what matters now is the batch being built, not the photo.
    expect(onTabChange).toHaveBeenCalledWith('manual');
  });

  it('reopens on the conversation when that is where the learner left off', () => {
    window.localStorage.setItem('get-word-add-words-tab', 'ai');

    renderScreen();

    expect(entryActions.startChat).toHaveBeenCalledOnce();
  });

  it('lets an interrupted batch outrank the remembered tab', () => {
    window.localStorage.setItem('get-word-add-words-tab', 'ai');
    window.localStorage.setItem(
      'get-word-word-chat-draft:cs:vi',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        sessionId: 's',
        creationKey: 'c',
        step: 'select',
        messages: [],
        addressRegister: null,
        salutationGender: null,
        languageLevel: null,
        listName: 'Moje slovíčka',
        categoryName: '',
        reviewLabel: 'Manual entry',
        proposals: [],
        selectedKeys: [],
        customItems: [{ kind: 'word', text: 'káva' }],
        reviewItems: [],
        isPublic: null,
      }),
    );

    renderScreen();

    expect(entryActions.startChat).not.toHaveBeenCalled();
  });
});
