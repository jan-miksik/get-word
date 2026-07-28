import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { ChatStep } from '../ChatStep';
import type { WordChatPreferencePatch } from '../../hooks/useWordChat';

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
import type { WordChatHistory } from '../../hooks/useWordChat';

function renderChatStep({
  uiLanguage = 'en',
  languageFrom = 'cs',
  history = null,
  withReadyMade = true,
  addressRegister = 'casual',
  salutationGender = 'neutral',
  languageLevel = 'B1',
  preferencesComplete = true,
  messages = [],
  onSend,
  onUseReadyMade,
  onPreferencesChange,
}: {
  uiLanguage?: string;
  languageFrom?: string;
  history?: WordChatHistory | null;
  withReadyMade?: boolean;
  addressRegister?: 'casual' | 'formal' | null;
  salutationGender?: 'female' | 'male' | 'neutral' | null;
  languageLevel?: 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | null;
  preferencesComplete?: boolean;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onSend?: (text: string) => void;
  onUseReadyMade?: () => void;
  onPreferencesChange?: (patch: WordChatPreferencePatch) => void;
} = {}) {
  const send = onSend ?? vi.fn<(text: string) => void>();
  const useReadyMade = onUseReadyMade ?? vi.fn<() => void>();
  const changePreferences = onPreferencesChange ?? vi.fn<(patch: WordChatPreferencePatch) => void>();
  render(
    <I18nProvider language={uiLanguage}>
      <ChatStep
        languageFrom={languageFrom}
        languageTo="vi"
        messages={messages}
        suggestions={[]}
        addressRegister={addressRegister}
        salutationGender={salutationGender}
        languageLevel={languageLevel}
        preferencesComplete={preferencesComplete}
        preferencesLoading={false}
        preferencesSaving={false}
        addressRegisterApplies={languageFrom === 'cs'}
        salutationGenderApplies={languageFrom === 'cs'}
        onPreferencesChange={changePreferences}
        busy={null}
        history={history}
        onSend={send}
        onUseReadyMade={withReadyMade ? useReadyMade : undefined}
      />
    </I18nProvider>,
  );
  return { onSend: send, onUseReadyMade: useReadyMade, onPreferencesChange: changePreferences };
}

describe('ChatStep', () => {
  it('asks for chat preferences before the actual chat without preselecting casual address', () => {
    const { onPreferencesChange } = renderChatStep({
      addressRegister: null,
      salutationGender: null,
      languageLevel: null,
      preferencesComplete: false,
    });

    expect(screen.getByText(/You can change this later/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Tell me about your situation…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use casual address' })).not.toHaveClass(
      'onboarding-option-highlight',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use formal address' }));
    fireEvent.click(screen.getByRole('button', { name: 'Neutral' }));
    fireEvent.click(screen.getByRole('button', { name: /A1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onPreferencesChange).toHaveBeenCalledWith({
      addressRegister: 'formal',
      salutationGender: 'neutral',
      languageLevel: 'A1',
    });
  });

  it('sends a starter brief in the known language even when the UI is English', () => {
    const { onSend } = renderChatStep();

    fireEvent.click(screen.getByRole('button', { name: 'Talking to customers' }));

    expect(onSend).toHaveBeenCalledWith(
      'Pracuju se zákazníky — salon, obchod, kavárna — a chci s nimi mluvit pořádně.',
    );
  });

  it('presents the ready-made list as a quiet escape link, not a starter chip', () => {
    const { onUseReadyMade } = renderChatStep();
    const link = screen.getByRole('button', { name: 'Use a ready-made list instead' });

    expect(link).toHaveClass('opacity-50');
    expect(screen.queryByRole('button', { name: 'Common everyday words' })).not.toBeInTheDocument();

    fireEvent.click(link);
    expect(onUseReadyMade).toHaveBeenCalledOnce();
  });

  it('keeps address switching under a settings icon after the initial choice', () => {
    const { onPreferencesChange } = renderChatStep({ addressRegister: 'formal' });

    expect(screen.queryByRole('button', { name: 'Use formal address' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chat settings' }));
    expect(
      screen.getByRole('radiogroup', { name: 'Chat address' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Use casual address' }));

    expect(onPreferencesChange).toHaveBeenCalledWith({ addressRegister: 'casual' });
  });

  it('renders assistant replies as static text without the blue option hover', async () => {
    renderChatStep({
      messages: [
        {
          role: 'assistant',
          content: 'Zaměříme se na formuláře a jednání u přepážky.',
        },
      ],
    });

    const reply = (
      await screen.findByText('Zaměříme se na formuláře a jednání u přepážky.')
    ).closest('p');
    expect(reply).toHaveClass('word-chat-assistant-message');
    expect(reply).not.toHaveClass('onboarding-option');
  });

  it('uses formal Czech intro copy after the learner chooses vykání', () => {
    renderChatStep({
      uiLanguage: 'cs',
      addressRegister: 'formal',
      history: {
        hasHistory: true,
        goals: [],
        coveredTopics: ['Úřední slovníček'],
        missingTopics: [],
      },
    });

    expect(screen.getByText(/Napište mi, co potřebujete teď/)).toBeInTheDocument();
    expect(screen.queryByText(/Napiš mi, co potřebuješ teď/)).not.toBeInTheDocument();
  });

  it('picks a returning learner up from the last session instead of introducing the feature', () => {
    const { onSend } = renderChatStep({
      withReadyMade: false,
      history: {
        hasHistory: true,
        goals: ['talk to salon clients'],
        coveredTopics: ['Salon small talk'],
        missingTopics: ['Booking appointments'],
      },
    });

    expect(screen.getByText(/Last time we did: Salon small talk/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Talking to customers' })).not.toBeInTheDocument();
    // Inside the app there is no ready-made-list offer: the learner has lists.
    expect(
      screen.queryByRole('button', { name: 'Use a ready-made list instead' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Booking appointments' }));
    expect(onSend).toHaveBeenCalledWith("I'd like to work on: Booking appointments");
  });

  it('autofocuses a field that is visually distinct from the option buttons', () => {
    renderChatStep();
    const input = screen.getByPlaceholderText('Tell me about your situation…');

    expect(input).toHaveFocus();
    expect(input).toHaveClass('word-chat-input');
    expect(input).not.toHaveClass('onboarding-option');
  });
});
