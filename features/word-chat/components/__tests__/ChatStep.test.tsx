import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import type { WordList } from '@/features/lists/types';
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
  suggestions = [],
  busy = null,
  onSend,
  onStartManualEntry,
  onPreferencesChange,
  listName,
  categoryName,
  onListNameChange,
  onCategoryNameChange,
  shareList = null,
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
  suggestions?: string[];
  busy?: 'chat' | 'propose' | null;
  onSend?: (text: string) => void | boolean | Promise<void | boolean>;
  onStartManualEntry?: () => void;
  onPreferencesChange?: (patch: WordChatPreferencePatch) => void;
  listName?: string;
  categoryName?: string;
  onListNameChange?: (value: string) => void;
  onCategoryNameChange?: (value: string) => void;
  shareList?: WordList | null;
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
        suggestions={suggestions}
        addressRegister={addressRegister}
        salutationGender={salutationGender}
        languageLevel={languageLevel}
        preferencesComplete={preferencesComplete}
        preferencesLoading={false}
        preferencesSaving={false}
        addressRegisterApplies={languageFrom === 'cs'}
        salutationGenderApplies={languageFrom === 'cs'}
        onPreferencesChange={changePreferences}
        onLanguagePairChange={vi.fn()}
        listName={listName}
        categoryName={categoryName}
        onListNameChange={onListNameChange}
        onCategoryNameChange={onCategoryNameChange}
        shareList={shareList}
        busy={busy}
        history={history}
        onSend={send}
        onStartManualEntry={onStartManualEntry}
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
  it('lets the AI-chat settings edit the destination list and category names', () => {
    const onListNameChange = vi.fn();
    const onCategoryNameChange = vi.fn();
    renderChatStep({
      listName: 'My words — Vietnamese',
      categoryName: 'Coffee shop',
      onListNameChange,
      onCategoryNameChange,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Settings for adding words' }));
    fireEvent.change(screen.getByDisplayValue('My words — Vietnamese'), {
      target: { value: 'Useful Vietnamese' },
    });
    fireEvent.change(screen.getByDisplayValue('Coffee shop'), {
      target: { value: 'Ordering coffee' },
    });

    expect(onListNameChange).toHaveBeenCalledWith('Useful Vietnamese');
    expect(onCategoryNameChange).toHaveBeenCalledWith('Ordering coffee');
  });

  it('reveals chat preferences one at a time without preselecting casual address', () => {
    const { onPreferencesChange } = renderChatStep({
      addressRegister: 'casual',
      salutationGender: null,
      languageLevel: null,
      preferencesComplete: false,
    });

    expect(screen.queryByPlaceholderText('Tell me about your situation…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings for adding words' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /I know: Czech/ })).not.toBeInTheDocument();
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

  it('shows missing profile setup even when an older transcript was restored', () => {
    renderChatStep({
      preferencesComplete: false,
      languageLevel: null,
      messages: [{ role: 'user', content: 'Starší zpráva' }],
    });

    expect(
      screen.getByRole('progressbar', { name: 'Set up the chat first' }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Tell me about your situation…')).not.toBeInTheDocument();
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

  it('offers a first-time learner no topic chips at all', () => {
    // Generic situations were guesses that steered the conversation more than
    // they helped it. The only thing next to the input is the manual escape.
    renderChatStep({ onStartManualEntry: vi.fn() });

    expect(screen.queryByRole('button', { name: 'Talking to customers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'At the office' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vacation abroad' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'I already have my own words' }),
    ).toBeInTheDocument();
  });

  it('lets the learner skip the AI suggestions and enter words manually', () => {
    const onStartManualEntry = vi.fn();
    renderChatStep({ onStartManualEntry });

    fireEvent.click(screen.getByRole('button', { name: 'I already have my own words' }));

    expect(onStartManualEntry).toHaveBeenCalledOnce();
  });

  it('keeps the initial chat setup focused on the profile questions', () => {
    renderChatStep({
      addressRegister: null,
      salutationGender: null,
      languageLevel: null,
      preferencesComplete: false,
      onStartManualEntry: vi.fn(),
    });

    expect(
      screen.queryByRole('button', { name: 'I already have my own words' }),
    ).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Settings for adding words' }));
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
        situations: [],
        coveredTopics: ['Úřední slovníček'],
        missingTopics: [],
      },
    });

    expect(screen.getByText(/Napište mi, co potřebujete teď/)).toBeInTheDocument();
    expect(screen.queryByText(/Napiš mi, co potřebuješ teď/)).not.toBeInTheDocument();
  });

  it('keeps the opener above the transcript once the conversation starts', () => {
    renderChatStep({
      messages: [
        { role: 'user', content: 'Talking to my partner' },
        { role: 'assistant', content: 'Everyday chit-chat or affectionate words?' },
      ],
    });

    // Without it the learner is left looking at a bare exchange with nothing
    // saying what the chat is for or which language it is about.
    expect(screen.getByText(/What would you most like to do in Vietnamese/)).toBeInTheDocument();
    // The longer explainer is only useful before the first message.
    expect(screen.queryByText(/Tell me about a real situation/)).not.toBeInTheDocument();
  });

  it('picks a returning learner up from the last session instead of introducing the feature', () => {
    const { onSend } = renderChatStep({
      history: {
        hasHistory: true,
        goals: ['talk to salon clients'],
        situations: [],
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

  it('offers a returning learner exactly one chip, the most specific one', () => {
    renderChatStep({
      history: {
        hasHistory: true,
        goals: ['Talk to salon clients'],
        situations: ['Doctor visits'],
        coveredTopics: ['Salon small talk'],
        missingTopics: [],
      },
    });

    expect(screen.getByRole('button', { name: 'Doctor visits' })).toBeInTheDocument();
    // One chip, not a menu: the goal is a weaker suggestion than the situation.
    expect(
      screen.queryByRole('button', { name: 'Talk to salon clients' }),
    ).not.toBeInTheDocument();
  });

  it('offers a deeper pass over the last topic when the brief has nothing else', () => {
    const { onSend } = renderChatStep({
      history: {
        hasHistory: true,
        goals: [],
        situations: [],
        coveredTopics: ['Small talk', 'Morals and ethics'],
        missingTopics: [],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'More on Morals and ethics' }));
    expect(onSend).toHaveBeenCalledWith(
      "Let's stay with Morals and ethics — suggest more words and phrases we haven't done yet.",
    );
  });

  it('autofocuses a field that is visually distinct from the option buttons', () => {
    renderChatStep();
    const input = screen.getByPlaceholderText('Tell me about your situation…');

    expect(input).toHaveFocus();
    expect(input).toHaveClass('word-chat-input');
    expect(input).not.toHaveClass('onboarding-option');
  });

  it('wraps what is being typed instead of scrolling it out of sight', () => {
    // Someone describing their situation writes more than one line; a single-line
    // field hides the beginning of it while they are still writing.
    renderChatStep();
    const input = screen.getByPlaceholderText('Tell me about your situation…');

    expect(input.tagName).toBe('TEXTAREA');
    expect(input).toHaveAttribute('rows', '1');
  });

  it('sends on Enter and breaks the line on Shift+Enter', () => {
    const { onSend } = renderChatStep();
    const input = screen.getByPlaceholderText('Tell me about your situation…');

    fireEvent.change(input, { target: { value: 'Jedu do Vietnamu za rodinou' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('Jedu do Vietnamu za rodinou');
  });

  it('keeps the typed message when the hook rejects it before starting a turn', async () => {
    renderChatStep({ onSend: () => false });
    const input = screen.getByPlaceholderText<HTMLTextAreaElement>(
      'Tell me about your situation…',
    );

    fireEvent.change(input, { target: { value: 'Druhy ryb' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(input).toHaveValue('Druhy ryb'));
  });

  it('shows a long suggestion in full rather than clipping it to a pill', () => {
    const suggestion = 'Domlouvám se s lékařem o výsledcích vyšetření a dalším postupu';
    renderChatStep({
      messages: [
        { role: 'user', content: 'Ahoj' },
        { role: 'assistant', content: 'Co potřebujete zvládnout?' },
      ],
      suggestions: [suggestion],
    });

    const chip = screen.getByRole('button', { name: suggestion });
    expect(chip).toHaveClass('whitespace-normal', 'break-words');
    expect(chip).not.toHaveClass('truncate');
  });

  it('offers the share button beside the gear once a list exists', () => {
    const list: WordList = {
      id: 'list-1',
      ownerId: null,
      name: 'My words — Vietnamese',
      description: null,
      languageFrom: 'cs',
      languageTo: 'vi',
      isPublic: false,
      isOwner: true,
    };

    renderChatStep({ shareList: list });
    expect(screen.getByRole('button', { name: 'Share & visibility' })).toBeInTheDocument();
  });

  it('keeps the composer at least one row tall', () => {
    renderChatStep({ embedded: true });
    const input = screen.getByPlaceholderText<HTMLTextAreaElement>(
      'Tell me about your situation…',
    );

    fireEvent.change(input, { target: { value: 'Ahoj' } });

    // jsdom reports a zero `scrollHeight`, which is exactly the bogus
    // measurement the floor exists for.
    expect(Number.parseFloat(input.style.height)).toBeGreaterThanOrEqual(20);
  });
});
