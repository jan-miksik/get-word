import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { ChatStep } from '../ChatStep';
import type { WordChatHistory } from '../../hooks/useWordChat';

function renderChatStep({
  uiLanguage = 'en',
  languageFrom = 'cs',
  history = null,
  withReadyMade = true,
  onSend,
  onUseReadyMade,
}: {
  uiLanguage?: string;
  languageFrom?: string;
  history?: WordChatHistory | null;
  withReadyMade?: boolean;
  onSend?: (text: string) => void;
  onUseReadyMade?: () => void;
} = {}) {
  const send = onSend ?? vi.fn<(text: string) => void>();
  const useReadyMade = onUseReadyMade ?? vi.fn<() => void>();
  render(
    <I18nProvider language={uiLanguage}>
      <ChatStep
        languageFrom={languageFrom}
        languageTo="vi"
        messages={[]}
        suggestions={[]}
        busy={null}
        history={history}
        onSend={send}
        onUseReadyMade={withReadyMade ? useReadyMade : undefined}
      />
    </I18nProvider>,
  );
  return { onSend: send, onUseReadyMade: useReadyMade };
}

describe('ChatStep', () => {
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
