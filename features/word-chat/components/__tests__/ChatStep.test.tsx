import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  addressRegister = 'casual',
  salutationGender = 'neutral',
  languageLevel = 'B1',
  preferencesComplete = true,
  messages = [],
  busy = null,
  onSend,
  onPreferencesChange,
  active = true,
  embedded = false,
}: {
  uiLanguage?: string;
  languageFrom?: string;
  history?: WordChatHistory | null;
  addressRegister?: 'casual' | 'formal' | null;
  salutationGender?: 'female' | 'male' | 'neutral' | null;
  languageLevel?: 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | null;
  preferencesComplete?: boolean;
  messages?: Array<{
    role: 'user' | 'assistant';
    content: string;
    id?: string;
    incomplete?: boolean;
  }>;
  busy?: 'chat' | 'propose' | null;
  onSend?: (text: string) => void;
  onPreferencesChange?: (patch: WordChatPreferencePatch) => void;
  active?: boolean;
  embedded?: boolean;
} = {}) {
  const send = onSend ?? vi.fn<(text: string) => void>();
  const changePreferences = onPreferencesChange ?? vi.fn<(patch: WordChatPreferencePatch) => void>();
  const { container } = render(
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
        busy={busy}
        history={history}
        onSend={send}
        active={active}
        embedded={embedded}
      />
    </I18nProvider>,
  );
  return {
    container,
    onSend: send,
    onPreferencesChange: changePreferences,
  };
}

describe('ChatStep', () => {
  it('reveals chat preferences one at a time without preselecting casual address', () => {
    const { onPreferencesChange } = renderChatStep({
      addressRegister: 'casual',
      salutationGender: null,
      languageLevel: null,
      preferencesComplete: false,
    });

    expect(screen.queryByPlaceholderText('Tell me about your situation…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use casual address' })).not.toHaveClass(
      'onboarding-option-highlight',
    );
    expect(screen.queryByRole('button', { name: /A1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neutral' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use formal address' }));
    expect(screen.queryByRole('button', { name: 'Use formal address' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /A1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neutral' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /A1/ }));
    expect(screen.queryByRole('button', { name: /A1/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neutral' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Neutral' }));
    expect(onPreferencesChange).toHaveBeenCalledWith({
      addressRegister: 'formal',
      salutationGender: 'neutral',
      languageLevel: 'A1',
    });
  });

  it('uses the selected Czech address in the following questions', () => {
    renderChatStep({
      uiLanguage: 'cs',
      addressRegister: null,
      salutationGender: null,
      languageLevel: null,
      preferencesComplete: false,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tykej mi' }));
    expect(screen.getByRole('heading', { name: 'Kolik už toho v jazyce umíš?' }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^A0/ }));
    expect(screen.getByRole('heading', { name: 'Jak tě mám oslovovat?' }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jako ženu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jako muže' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neutrálně' })).toBeInTheDocument();
  });

  it('offers a clear back button and keeps earlier answers when revisiting a step', () => {
    renderChatStep({
      addressRegister: null,
      salutationGender: null,
      languageLevel: null,
      preferencesComplete: false,
    });

    expect(
      screen.queryByRole('button', { name: 'Back to the previous step' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use formal address' }));
    const backButton = screen.getByRole('button', { name: 'Back to the previous step' });
    expect(backButton).toHaveTextContent('←Back');

    fireEvent.click(backButton);
    expect(screen.getByRole('button', { name: 'Use formal address' })).toHaveClass(
      'onboarding-option-highlight',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use formal address' }));
    fireEvent.click(screen.getByRole('button', { name: /A2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to the previous step' }));
    expect(screen.getByRole('button', { name: /A2/ })).toHaveClass(
      'onboarding-option-highlight',
    );
  });

  it('sends a starter brief in the known language even when the UI is English', () => {
    const { onSend } = renderChatStep();

    fireEvent.click(screen.getByRole('button', { name: 'Talking to customers' }));

    expect(onSend).toHaveBeenCalledWith(
      'Pracuju se zákazníky — salon, obchod, kavárna — a chci s nimi mluvit pořádně.',
    );
  });

  it('keeps starter chips the same for every language level', () => {
    renderChatStep({ languageLevel: 'A0' });

    expect(screen.getByRole('button', { name: 'Talking to customers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'At the office' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "My partner's family" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vacation abroad' })).toBeInTheDocument();

    cleanup();
    renderChatStep({ languageLevel: 'B2' });

    expect(screen.getByRole('button', { name: 'Talking to customers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'At the office' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "My partner's family" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vacation abroad' })).toBeInTheDocument();
  });

  it('does not show the ready-made list shortcut in the normal chat', () => {
    renderChatStep();

    expect(
      screen.queryByRole('button', { name: 'Use a ready-made list instead' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Common everyday words' })).not.toBeInTheDocument();
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

  it('renders an existing assistant reply immediately without replaying its animation', () => {
    renderChatStep({
      messages: [
        {
          role: 'assistant',
          content: 'Zaměříme se na formuláře a jednání u přepážky.',
        },
      ],
    });

    const reply = screen
      .getByText('Zaměříme se na formuláře a jednání u přepážky.')
      .closest('p');
    expect(reply).toHaveClass('word-chat-assistant-message');
    expect(reply).not.toHaveClass('onboarding-option');
    expect(reply?.className).not.toContain('word-chat-message-in');
  });

  it('shows the thinking status without an empty assistant bubble or streaming caret', () => {
    const { container } = renderChatStep({
      busy: 'chat',
      messages: [
        { role: 'user', content: 'Letiště a doprava' },
        { role: 'assistant', content: '', id: 'reply-in-flight', incomplete: true },
      ],
    });

    expect(screen.getByRole('status', { name: 'Thinking…' })).toBeInTheDocument();
    expect(container.querySelectorAll('.word-chat-assistant-message')).toHaveLength(0);
    expect(container.querySelector('.word-chat-stream-caret')).not.toBeInTheDocument();
  });

  it('does not focus or auto-scroll an inactive embedded chat', () => {
    const scrollIntoView = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    scrollIntoView.mockClear();
    renderChatStep({
      active: false,
      embedded: true,
      messages: [{ role: 'assistant', content: 'Finished in the background.' }],
    });

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Tell me about your situation…')).not.toHaveFocus();
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
