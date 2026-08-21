import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TypingStudyCard } from '../TypingStudyCard';
import type { ProgressData } from '@/features/sync/types';
import type { NormalizedWord } from '@/lib/words';

const makeWord = (
  id: string,
  cz: string,
  vi: string,
  extras?: Partial<NormalizedWord>,
): NormalizedWord => ({
  id,
  cz,
  vi,
  en: '',
  category: ['word'],
  ...extras,
});

// role=knownLanguage: known side = cz ('from'), foreign/learning side = vi ('to').
const WORD = makeWord('a', 'pes', 'con chó', {
  czAudio: 'speech/cz/pes.mp3',
  viAudio: 'speech/vi/con-cho.mp3',
});
const WORD_WITHOUT_FOREIGN_AUDIO = makeWord('a', 'pes', 'con chó', {
  czAudio: 'speech/cz/pes.mp3',
  viAudio: undefined,
});

// Same word with language metadata for Vietnamese ('vi') answer-side coverage.
const VI_WORD = makeWord('a', 'pes', 'con chó', {
  czAudio: 'speech/cz/pes.mp3',
  viAudio: 'speech/vi/con-cho.mp3',
  languageFrom: 'cs',
  languageTo: 'vi',
});

const PROGRESS: ProgressData = { stageIndex: 2, knownCount: 1, unknownCount: 0 };

let playCalls = 0;
let audioSources: string[] = [];

beforeEach(() => {
  playCalls = 0;
  audioSources = [];
  vi.stubGlobal(
    'Audio',
    vi.fn().mockImplementation(function FakeAudio(
      this: { src: string; play: () => Promise<void>; pause: () => void },
      src: string,
    ) {
      this.src = src;
      audioSources.push(src);
      this.play = () => {
        playCalls += 1;
        return Promise.resolve();
      };
      this.pause = () => {};
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCard(props?: Partial<React.ComponentProps<typeof TypingStudyCard>>) {
  const onOutcome = vi.fn();
  const onScore = vi.fn();
  const onCustomStage = vi.fn();
  render(
    <TypingStudyCard
      word={WORD}
      progress={PROGRESS}
      role="knownLanguage"
      variant="0:20"
      audioPromptEnabled={false}
      prefillPunctuation
      onScore={onScore}
      onOutcome={onOutcome}
      onCustomStage={onCustomStage}
      {...props}
    />,
  );
  return { onOutcome, onScore, onCustomStage };
}

const input = () => screen.getByRole('textbox');
const checkAnswer = () => fireEvent.click(screen.getByRole('button', { name: 'Check' }));
const perfectMark = () => screen.getByRole('img', { name: 'Perfect!' });
// The continue control renders twice (mobile full-width bar + compact desktop
// button); breakpoint CSS hides one, but jsdom sees both, so grab the first.
const continueOverlay = () => screen.getAllByRole('button', { name: /continue/i })[0];
const queryContinueOverlay = () =>
  screen.queryAllByRole('button', { name: /continue/i })[0] ?? null;

function stubMobileLayout(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 767px)' && matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('TypingStudyCard', () => {
  it('keeps desktop autofocus while allowing mobile autofocus to be disabled', () => {
    stubMobileLayout(false);
    renderCard({ autoFocus: true, autoFocusOnMobile: false });
    expect(input()).toHaveFocus();
  });

  it('does not autofocus the mobile keyboard by default', () => {
    stubMobileLayout(true);
    renderCard({ autoFocus: true, autoFocusOnMobile: false });
    expect(input()).not.toHaveFocus();
  });

  it('autofocuses the mobile keyboard after an explicit opt-in on card mount', () => {
    stubMobileLayout(true);
    renderCard({ autoFocus: true, autoFocusOnMobile: true });
    expect(input()).toHaveFocus();
  });

  it('does not open the mobile keyboard when the autofocus preference changes on the visible card', () => {
    stubMobileLayout(true);
    const onOutcome = vi.fn();
    const { rerender } = render(
      <TypingStudyCard
        word={WORD}
        progress={PROGRESS}
        role="knownLanguage"
        variant="0:20"
        audioPromptEnabled={false}
        prefillPunctuation
        onOutcome={onOutcome}
        autoFocus
        autoFocusOnMobile={false}
      />,
    );
    expect(input()).not.toHaveFocus();

    rerender(
      <TypingStudyCard
        word={WORD}
        progress={PROGRESS}
        role="knownLanguage"
        variant="0:20"
        audioPromptEnabled={false}
        prefillPunctuation
        onOutcome={onOutcome}
        autoFocus
        autoFocusOnMobile
      />,
    );

    expect(input()).not.toHaveFocus();
  });

  it('leaves mobile keyboard positioning to the browser without translating the card', () => {
    stubMobileLayout(true);
    renderCard();
    fireEvent.focus(input());

    expect((document.querySelector('article') as HTMLElement).style.transform).toBe('');
  });

  it('hides only Repeat after actions while the mobile typing keyboard is active', () => {
    stubMobileLayout(true);
    renderCard();

    fireEvent.focus(input());
    expect(document.querySelector('[data-typing-secondary-actions]'))
      .toHaveClass('max-md:invisible');
    expect(document.querySelector('.card-actions')).not.toHaveClass('max-md:invisible');

    fireEvent.blur(input());
    expect(document.querySelector('[data-typing-secondary-actions]'))
      .not.toHaveClass('max-md:invisible');
  });

  it('hides the card actions while the memory hook is being edited', () => {
    stubMobileLayout(true);
    renderCard({
      showMemoryHook: true,
      memoryHook: 'dog with a cone',
      onMemoryHookChange: vi.fn(),
    });

    const card = document.querySelector('article') as HTMLElement;
    const hookDisplay = screen.getByText('dog with a cone');
    const hookInput = document.querySelector('.memory-hook-input') as HTMLInputElement;

    fireEvent.doubleClick(hookDisplay);
    expect(card).toHaveClass('word-card--editing-hook');
    expect(hookInput).toHaveFocus();

    fireEvent.blur(hookInput);
    expect(card).not.toHaveClass('word-card--editing-hook');
  });

  // `useVisualViewportHeight` already sizes the shell to the area the keyboard
  // leaves, so the card must not subtract the keyboard a second time. Measured
  // on a 375x812 viewport with a 336px keyboard, the padding this card used to
  // add put the answer input at y=-26, cut off above the top of the screen.
  it('leaves the keyboard inset to the app shell', async () => {
    stubMobileLayout(true);
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    const visualViewport = Object.assign(new EventTarget(), {
      height: 800,
      offsetTop: 0,
    });
    vi.stubGlobal('visualViewport', visualViewport);
    vi.stubGlobal('innerHeight', 800);

    render(
      <main className="learning-card-main">
        <TypingStudyCard
          word={WORD}
          progress={PROGRESS}
          role="knownLanguage"
          variant="0:20"
          audioPromptEnabled={false}
          prefillPunctuation
          onOutcome={vi.fn()}
          showMemoryHook
          onMemoryHookChange={vi.fn()}
        />
      </main>,
    );

    const main = document.querySelector('.learning-card-main') as HTMLElement;
    // The memory hook adds a second textbox, so the answer field is taken by class.
    const answerInput = document.querySelector('input.game-input') as HTMLInputElement;
    const hookInput = document.querySelector('.memory-hook-input') as HTMLInputElement;
    const scrollIntoView = vi.fn();
    answerInput.scrollIntoView = scrollIntoView;
    hookInput.scrollIntoView = scrollIntoView;
    // jsdom has no layout, so scrollTop cannot be observed by reading it back.
    const setScrollTop = vi.fn();
    Object.defineProperty(main, 'scrollTop', {
      configurable: true,
      get: () => 120,
      set: setScrollTop,
    });

    fireEvent.focus(answerInput);
    visualViewport.height = 500;
    visualViewport.dispatchEvent(new Event('resize'));
    fireEvent.blur(answerInput);
    fireEvent.focus(hookInput);
    visualViewport.dispatchEvent(new Event('resize'));

    await new Promise((resolve) => window.setTimeout(resolve, 600));
    expect(main.style.paddingBottom).toBe('');
    expect(main.style.scrollPaddingBottom).toBe('');
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(setScrollTop).not.toHaveBeenCalled();
  });

  // The keyboard leaves the card's content box ~25px shorter than its content.
  // Riding it to the bottom is what keeps the hint button and the memory-hook
  // row in view; without it the hook sat behind the custom-interval button.
  it('shows the bottom of the card content while the keyboard is open', () => {
    stubMobileLayout(true);
    render(
      <main className="learning-card-main">
        <TypingStudyCard
          word={WORD}
          progress={PROGRESS}
          role="knownLanguage"
          variant="0:20"
          audioPromptEnabled={false}
          prefillPunctuation
          onOutcome={vi.fn()}
          showMemoryHook
          onMemoryHookChange={vi.fn()}
        />
      </main>,
    );

    const content = document.querySelector('.word-card-content') as HTMLElement;
    // jsdom has no layout, so the overflow the keyboard causes is declared.
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 267 });
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 242 });
    const setScrollTop = vi.fn();
    Object.defineProperty(content, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set: setScrollTop,
    });

    document.documentElement.dataset.appTyping = 'true';
    fireEvent.focus(document.querySelector('input.game-input') as HTMLInputElement);

    expect(setScrollTop).toHaveBeenCalledWith(267);
    delete document.documentElement.dataset.appTyping;
  });

  // A card focuses its input as it mounts, which on the web raises no keyboard
  // unless the learner's own tap brought it up. Scrolling the prompt away to
  // clear room for keys that never arrive is the "everything slid up and there
  // is nothing to type on" report.
  it('leaves the card content alone when focus did not open a keyboard', () => {
    stubMobileLayout(true);
    render(
      <main className="learning-card-main">
        <TypingStudyCard
          word={WORD}
          progress={PROGRESS}
          role="knownLanguage"
          variant="0:20"
          audioPromptEnabled={false}
          prefillPunctuation
          onOutcome={vi.fn()}
          showMemoryHook
          onMemoryHookChange={vi.fn()}
        />
      </main>,
    );

    const content = document.querySelector('.word-card-content') as HTMLElement;
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 267 });
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 242 });
    const setScrollTop = vi.fn();
    Object.defineProperty(content, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set: setScrollTop,
    });

    fireEvent.focus(document.querySelector('input.game-input') as HTMLInputElement);

    expect(setScrollTop).not.toHaveBeenCalled();
  });

  it('keeps the keyboard when the hint button is tapped', () => {
    stubMobileLayout(true);
    renderCard({ autoFocus: true, autoFocusOnMobile: true });

    const hint = document.querySelector('.game-hint-btn') as HTMLButtonElement;
    expect(input()).toHaveFocus();

    // React's synthetic pointerdown is too late to stop iOS closing the
    // keyboard, so the card owns a non-passive native touchstart instead.
    const touchStart = new Event('touchstart', { bubbles: true, cancelable: true });
    hint.dispatchEvent(touchStart);

    expect(touchStart.defaultPrevented).toBe(true);
    expect(input()).toHaveFocus();
    // The reveal happened in touchstart; the click it generates must not
    // reveal a second letter.
    const revealed = input().getAttribute('value') ?? (input() as HTMLInputElement).value;
    fireEvent.click(hint);
    expect((input() as HTMLInputElement).value).toBe(revealed);
    expect(input()).toHaveFocus();
  });

  it('lets Android resize the page without applying a second keyboard scroll', async () => {
    stubMobileLayout(true);
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Android');
    const visualViewport = Object.assign(new EventTarget(), {
      height: 500,
      offsetTop: 0,
    });
    vi.stubGlobal('visualViewport', visualViewport);
    const scrollIntoView = vi.fn();

    render(
      <main className="learning-card-main">
        <TypingStudyCard
          word={WORD}
          progress={PROGRESS}
          role="knownLanguage"
          variant="0:20"
          audioPromptEnabled={false}
          prefillPunctuation
          onOutcome={vi.fn()}
        />
      </main>,
    );
    input().scrollIntoView = scrollIntoView;
    fireEvent.focus(input());
    visualViewport.dispatchEvent(new Event('resize'));

    await new Promise((resolve) => window.setTimeout(resolve, 180));
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect((document.querySelector('.learning-card-main') as HTMLElement).style.paddingBottom)
      .toBe('');
  });

  it('blurs and disables the mobile input after checking so the keyboard can close', () => {
    stubMobileLayout(true);
    renderCard({ autoFocus: true, autoFocusOnMobile: true });
    fireEvent.change(input(), { target: { value: 'conchó' } });
    checkAnswer();

    expect(perfectMark()).toBeInTheDocument();
    expect(input()).not.toHaveFocus();
    expect(input()).toBeDisabled();
    expect(input()).toHaveAttribute('aria-disabled', 'true');
  });

  it('checks on confirmation, scores immediately, and reports known only after tapping continue', () => {
    const { onOutcome, onScore } = renderCard();
    // Space is prefilled, so only the letters are typed.
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(screen.queryByRole('img', { name: 'Perfect!' })).not.toBeInTheDocument();
    checkAnswer();
    expect(perfectMark()).toBeInTheDocument();
    // Points land at evaluation time, before the continue tap.
    expect(onScore).toHaveBeenCalledTimes(1);
    expect(onScore).toHaveBeenCalledWith(2);
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledTimes(1);
    expect(onOutcome).toHaveBeenCalledWith('known');
    expect(onScore).toHaveBeenCalledTimes(1);
  });

  it('plays the word audio after checking only when enabled', () => {
    renderCard({ playAudioAfterCheck: true });
    fireEvent.change(input(), { target: { value: 'conchó' } });
    checkAnswer();

    expect(perfectMark()).toBeInTheDocument();
    expect(playCalls).toBe(1);
    expect(audioSources).toContain('/speech/vi/con-cho.mp3');
  });

  it('always waits for the check button', () => {
    renderCard();
    fireEvent.change(input(), { target: { value: 'conchó' } });

    expect(screen.queryByRole('img', { name: 'Perfect!' })).not.toBeInTheDocument();
    const checkButton = screen.getByRole('button', { name: 'Check' });
    expect(checkButton).toBeEnabled();
    fireEvent.click(checkButton);
    expect(perfectMark()).toBeInTheDocument();
  });

  it('closes the mobile input after an explicit check', () => {
    stubMobileLayout(true);
    renderCard({
      autoFocus: true,
      autoFocusOnMobile: true,
      checkButtonEnabled: true,
    });
    fireEvent.change(input(), { target: { value: 'conchó' } });
    const checkButton = screen.getByRole('button', { name: 'Check' });
    checkButton.focus();
    fireEvent.click(checkButton);

    expect(input()).not.toHaveFocus();
    expect(input()).toBeDisabled();
  });

  it('reports the outcome only once on a rapid double tap', () => {
    const { onOutcome } = renderCard();
    fireEvent.change(input(), { target: { value: 'conchó' } });
    checkAnswer();
    const overlay = continueOverlay();
    fireEvent.click(overlay);
    fireEvent.click(overlay);
    expect(onOutcome).toHaveBeenCalledTimes(1);
  });

  it('reports stay and scores 1 after one hint', () => {
    const { onOutcome, onScore } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: 'conchó' } });
    checkAnswer();
    expect(onScore).toHaveBeenCalledWith(1);
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('stay');
  });

  it('seeds a percentage scaffold without ever completing the answer', () => {
    renderCard({ variant: '90:90' });
    expect(input()).toHaveValue('conch');

    renderCard({ variant: '90:90', prefillPunctuation: false });
    expect(screen.getAllByRole('textbox')[1]).toHaveValue('con ch');
  });

  it('does not prefill or check the free-text alternative before confirmation', () => {
    renderCard({
      variant: '90:90',
      word: makeWord('free-alt', 'pes', 'con chó', { acceptedTarget: ['cya'] }),
    });
    expect(input()).toHaveValue('');
    fireEvent.change(input(), { target: { value: 'c' } });
    expect(queryContinueOverlay()).not.toBeInTheDocument();
  });

  it('disables a hint once its variant budget is spent', () => {
    renderCard({ variant: '0:10' });
    const hint = screen.getByRole('button', { name: 'Hint' });
    fireEvent.click(hint);
    expect(hint).toBeDisabled();
  });

  it('keeps a prefixed Telex composition alive until the IME commits', () => {
    renderCard({ variant: '50:90' });
    expect(input()).toHaveValue('con');
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'conchos' } });
    expect(queryContinueOverlay()).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'conchó' } });
    fireEvent.compositionEnd(input());
    checkAnswer();
    expect(perfectMark()).toBeInTheDocument();
  });

  it('keeps the mobile keyboard focused when a hint is tapped', () => {
    stubMobileLayout(true);
    renderCard();
    const typingInput = input();
    const hintButton = screen.getByRole('button', { name: /hint/i });
    typingInput.focus();
    expect(typingInput).toHaveFocus();
    const focusSpy = vi.spyOn(typingInput, 'focus');

    fireEvent.pointerDown(hintButton);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    fireEvent.click(hintButton);

    expect(typingInput).toHaveFocus();
    expect(typingInput).toHaveValue('c');
  });

  it('keeps the mobile keyboard focused while playing the word audio', () => {
    stubMobileLayout(true);
    renderCard();
    const typingInput = input();
    const audioButton = screen.getByRole('button', { name: 'Play audio' });
    typingInput.focus();
    const focusSpy = vi.spyOn(typingInput, 'focus');

    const touchStartWasNotCancelled = fireEvent.touchStart(audioButton);
    // Reproduce Safari trying to focus the button after pointer/touch start.
    audioButton.focus();
    const touchEndWasNotCancelled = fireEvent.touchEnd(audioButton);
    fireEvent.click(audioButton);

    expect(touchStartWasNotCancelled).toBe(false);
    expect(touchEndWasNotCancelled).toBe(false);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(typingInput).toHaveFocus();
    expect(playCalls).toBe(1);
  });

  it('places the caret after a revealed multi-code-unit grapheme', async () => {
    renderCard({
      word: makeWord('thai', 'dog', 'กิข', {
        languageFrom: 'en',
        languageTo: 'th',
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));

    await waitFor(() => expect(input()).toHaveProperty('selectionStart', 2));
    expect(input()).toHaveValue('กิ');
  });

  it('reports stay and scores 1 for a close (diacritics-only) mistake', () => {
    const { onOutcome, onScore } = renderCard();
    fireEvent.change(input(), { target: { value: 'concho' } });
    checkAnswer();
    expect(screen.getByText(/Close! Correct:/)).toBeInTheDocument();
    expect(screen.getByRole('status').className).toContain('!bg-[#FFF0BD]');
    expect(screen.getByRole('status').className).toContain('!text-[#5B3A00]');
    expect(onScore).toHaveBeenCalledWith(1);
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('stay');
  });

  it('keeps the word at its current stage after two hints and a correct answer', () => {
    const { onOutcome, onScore } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    fireEvent.change(input(), { target: { value: 'conchó' } });
    checkAnswer();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('stay');
    expect(onScore).toHaveBeenCalledWith(1);
  });

  it('shows the correct answer on a wrong attempt and reports unknown after the tap', () => {
    const { onOutcome, onScore } = renderCard();
    fireEvent.change(input(), { target: { value: 'xxxxxx' } });
    checkAnswer();
    expect(screen.getByText(/Correct:/)).toBeInTheDocument();
    expect(screen.getByText('con chó')).toBeInTheDocument();
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('unknown');
    expect(onScore).not.toHaveBeenCalled();
  });

  it('does not check while an IME composition is in progress', () => {
    renderCard();
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(queryContinueOverlay()).not.toBeInTheDocument();
    fireEvent.compositionEnd(input());
    expect(queryContinueOverlay()).not.toBeInTheDocument();
    checkAnswer();
    expect(continueOverlay()).toBeInTheDocument();
    expect(perfectMark()).toBeInTheDocument();
  });

  it('accepts a pasted answer that includes the prefilled punctuation', () => {
    const { onOutcome } = renderCard();
    fireEvent.change(input(), { target: { value: 'con chó' } });
    checkAnswer();
    expect(perfectMark()).toBeInTheDocument();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('known');
  });

  it('does not ignore extra editable characters pasted after the correct answer', () => {
    const { onOutcome } = renderCard();
    fireEvent.change(input(), { target: { value: 'con chóxyz' } });
    checkAnswer();
    expect(screen.getByText(/Correct:/)).toBeInTheDocument();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('unknown');
  });

  it('requires typing the space when prefill is disabled', () => {
    renderCard({ prefillPunctuation: false });
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(queryContinueOverlay()).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'con chó' } });
    checkAnswer();
    expect(continueOverlay()).toBeInTheDocument();
    expect(perfectMark()).toBeInTheDocument();
  });

  it('does not count a space filled by the hint as a hint when prefill is disabled', () => {
    const { onOutcome } = renderCard({ prefillPunctuation: false });
    // Fill 'con' first; the next hint press fills the space (free) plus 'c'.
    fireEvent.change(input(), { target: { value: 'con' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    fireEvent.change(input(), { target: { value: 'con chó' } });
    checkAnswer();
    fireEvent.click(continueOverlay());
    // One consumed hint (the letter) → stay, not unknown.
    expect(onOutcome).toHaveBeenCalledWith('stay');
  });

  it('always answers on the foreign side', () => {
    // Typing the learner's own language was dropped: there is no direction to
    // configure any more, so the answer is the foreign word whatever the stage.
    const { onOutcome } = renderCard();
    expect(screen.getByText('pes')).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'con chó' } });
    checkAnswer();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('known');
  });

  it('never shows a write-in badge', () => {
    renderCard();
    expect(screen.queryByText(/Type in/)).not.toBeInTheDocument();
  });

  it('maps the foreign side correctly for the reversed list role', () => {
    const { onOutcome } = renderCard({ role: 'languageToLearn' });
    // languageToLearn: learning side is 'from' (cz) → the answer is 'pes'.
    expect(screen.getByText('con chó')).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'pes' } });
    checkAnswer();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('known');
  });

  it('shows the audio prompt with the known meaning under it', () => {
    renderCard({ audioPromptEnabled: true });
    expect(screen.getByRole('button', { name: /replay prompt audio/i })).toBeInTheDocument();
    // Dictation still carries the meaning in the known language.
    expect(screen.getByText('pes')).toBeInTheDocument();
  });

  it('shows a floating play button when audio exists but the audio prompt is off', () => {
    renderCard({ audioPromptEnabled: false });
    expect(screen.getByRole('button', { name: /^play audio$/i })).toBeInTheDocument();
    // The text prompt stays; the floating button only adds playback.
    expect(screen.getByText('pes')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /replay prompt audio/i }),
    ).not.toBeInTheDocument();
  });

  it('shows no floating play button when the word has no foreign audio source', () => {
    renderCard({ audioPromptEnabled: false, word: WORD_WITHOUT_FOREIGN_AUDIO });
    expect(screen.queryByRole('button', { name: /^play audio$/i })).not.toBeInTheDocument();
  });

  it('falls back to the text prompt only when the foreign audio source is missing', () => {
    renderCard({ audioPromptEnabled: true, word: WORD_WITHOUT_FOREIGN_AUDIO });
    expect(screen.getByText('pes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /replay prompt audio/i })).not.toBeInTheDocument();
  });

  it('keeps the audio prompt visible when playback fails', async () => {
    let failedPlayCalls = 0;
    vi.stubGlobal(
      'Audio',
      vi.fn().mockImplementation(function FailingAudio(
        this: { src: string; play: () => Promise<void>; pause: () => void },
        src: string,
      ) {
        this.src = src;
        this.play = () => {
          failedPlayCalls += 1;
          return Promise.reject(new Error('gateway unavailable'));
        };
        this.pause = () => {};
      }),
    );
    renderCard({ audioPromptEnabled: true });
    fireEvent.click(screen.getByRole('button', { name: /replay prompt audio/i }));
    await waitFor(() => expect(failedPlayCalls).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: /replay prompt audio/i })).toBeInTheDocument();
  });

  it('does not auto-play the foreign audio after a correct answer', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(playCalls).toBe(0);
    expect(audioSources).not.toContain('/speech/vi/con-cho.mp3');
  });

  it('does not play audio after a wrong answer', () => {
    renderCard();
    fireEvent.change(input(), { target: { value: 'xxxxxx' } });
    checkAnswer();
    expect(playCalls).toBe(0);
  });

  it('shows the expected character under each wrong slot after the check', () => {
    renderCard();
    fireEvent.change(input(), { target: { value: 'xxxxxx' } });
    checkAnswer();
    const corrections = Array.from(document.querySelectorAll('.game-typing-correction'));
    // One correction row per slot (6 letters + the fixed space placeholder).
    expect(corrections).toHaveLength(7);
    const visible = corrections.filter((el) => !el.className.includes('invisible'));
    expect(visible.map((el) => el.textContent).join('')).toBe('conchó');
  });

  it('shows the accented character under a close (diacritics-only) slot', () => {
    renderCard();
    fireEvent.change(input(), { target: { value: 'concho' } });
    checkAnswer();
    const visible = Array.from(
      document.querySelectorAll('.game-typing-correction'),
    ).filter((el) => !el.className.includes('invisible'));
    expect(visible.map((el) => el.textContent)).toEqual(['ó']);
  });

  it('shows no correction row after a perfect answer', () => {
    renderCard();
    fireEvent.change(input(), { target: { value: 'conchó' } });
    checkAnswer();
    expect(document.querySelectorAll('.game-typing-correction')).toHaveLength(0);
  });

  it('shows a check button for a Vietnamese answer', () => {
    const { onScore } = renderCard({ word: VI_WORD });
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(screen.getByRole('button', { name: /check/i })).toBeInTheDocument();
    checkAnswer();
    expect(perfectMark()).toBeInTheDocument();
    expect(onScore).toHaveBeenCalledWith(2);
  });

  it('checks a Vietnamese answer on Enter when the check button is enabled', () => {
    const { onScore } = renderCard({ word: VI_WORD, checkButtonEnabled: true });
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(queryContinueOverlay()).not.toBeInTheDocument();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(perfectMark()).toBeInTheDocument();
    expect(onScore).toHaveBeenCalledWith(2);
  });

  it('checks a Vietnamese answer via the check button, disabled while empty', () => {
    renderCard({ word: VI_WORD, checkButtonEnabled: true });
    const checkButton = screen.getByRole('button', { name: /check/i });
    const hintButtons = screen.getAllByRole('button', { name: /hint/i });
    expect(hintButtons).toHaveLength(1);
    expect(checkButton.className).toContain('!h-11');
    expect(hintButtons[0].className).toContain('!h-11');
    expect(document.querySelector('.game-feedback')).toHaveClass('invisible');
    expect(checkButton).toBeDisabled();
    fireEvent.change(input(), { target: { value: 'con' } });
    expect(checkButton).toBeDisabled();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(queryContinueOverlay()).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(checkButton).toBeEnabled();
    fireEvent.click(checkButton);
    expect(perfectMark()).toBeInTheDocument();
    const continueButtons = screen.getAllByRole('button', { name: /continue/i });
    expect(continueButtons).toHaveLength(2);
    expect(continueButtons[1].className).toContain('absolute');
    expect(continueButtons[1]).toHaveTextContent(/repeat/i);
  });

  it('keeps the repeat action in flow below the memory hook after mobile evaluation', () => {
    stubMobileLayout(true);
    const { container } = render(
      <TypingStudyCard
        word={VI_WORD}
        progress={PROGRESS}
        role="knownLanguage"
        variant="0:20"
        audioPromptEnabled={false}
        prefillPunctuation
        onOutcome={vi.fn()}
        onCustomStage={vi.fn()}
        checkButtonEnabled
        showMemoryHook
        memoryHook="dog with a cone"
      />,
    );
    const cardActions = container.querySelector('.card-actions');
    const audioButton = screen.getByRole('button', { name: /^play audio$/i });
    const repeatButton = screen.getByRole('button', { name: /custom interval/i });
    const repeatWrapper = repeatButton.parentElement?.parentElement;

    expect(cardActions?.className).not.toContain('translate-y');
    expect(audioButton).toHaveClass('audio-btn--floating');
    expect(repeatWrapper?.className).toContain('max-md:-translate-y-1');

    fireEvent.change(screen.getByPlaceholderText('Type translation...'), {
      target: { value: 'conchó' },
    });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));

    expect(cardActions?.className).not.toContain('translate-y');
    expect(audioButton).toBeInTheDocument();
    expect(repeatWrapper?.className).not.toContain('max-md:-translate-y-[64px]');
    expect(container.querySelector('[data-mobile-result-actions-spacer]')).toBeInTheDocument();
    expect(
      screen.getByText('dog with a cone').compareDocumentPosition(repeatWrapper as Node),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('selects one tapped character on pointer down so the caret does not jump after the click', () => {
    renderCard({ word: VI_WORD, checkButtonEnabled: true });
    fireEvent.change(input(), { target: { value: 'conchó' } });
    const editableSlots = Array.from(
      document.querySelectorAll<HTMLElement>('[data-editable-index]'),
    );
    editableSlots.forEach((slot, index) => {
      vi.spyOn(slot, 'getBoundingClientRect').mockReturnValue({
        x: index * 20,
        y: 0,
        left: index * 20,
        top: 0,
        right: (index * 20) + 10,
        bottom: 20,
        width: 10,
        height: 20,
        toJSON: () => ({}),
      });
    });

    fireEvent.pointerDown(input(), { clientX: 45, clientY: 10 });
    expect(input()).toHaveProperty('selectionStart', 2);
    expect(input()).toHaveProperty('selectionEnd', 3);
    expect(input()).toHaveFocus();
  });

  it('keeps the visual caret at the real insertion point when tapping ahead of typed text', () => {
    renderCard({ word: VI_WORD });
    fireEvent.change(input(), { target: { value: 'co' } });
    const editableSlots = Array.from(
      document.querySelectorAll<HTMLElement>('[data-editable-index]'),
    );
    editableSlots.forEach((slot, index) => {
      vi.spyOn(slot, 'getBoundingClientRect').mockReturnValue({
        x: index * 20,
        y: 0,
        left: index * 20,
        top: 0,
        right: (index * 20) + 10,
        bottom: 20,
        width: 10,
        height: 20,
        toJSON: () => ({}),
      });
    });

    fireEvent.pointerDown(input(), { clientX: 95, clientY: 10 });
    expect(input()).toHaveProperty('selectionStart', 2);
    expect(input()).toHaveProperty('selectionEnd', 2);
    expect(document.querySelector('[data-editable-index="2"]')).toHaveClass('is-active');
    expect(document.querySelector('[data-editable-index="4"]')).not.toHaveClass('is-active');
  });

  it('centres the mnemonic editor without taking space from the audio button', () => {
    renderCard({ showMemoryHook: true });

    expect(screen.getByText('💭 Add memory hook')).toBeInTheDocument();
    const hookInput = screen.getByPlaceholderText('Add memory hook');
    expect(hookInput.parentElement).toHaveClass(
      'mx-auto',
      'w-[calc(100%-2rem)]',
      'max-w-md',
      'self-center',
    );
  });

  it('uses only a black caret at the beginning of the active underscore', () => {
    renderCard({ word: VI_WORD });
    fireEvent.focus(input());

    const activeSlot = document.querySelector('.game-typing-slot.is-active');
    expect(activeSlot).toHaveClass('after:!left-0');
    expect(activeSlot).toHaveClass('after:!translate-x-0');
    expect(activeSlot).toHaveClass('after:!bg-[#2A2218]');
    expect(activeSlot?.className).not.toContain('before:');
    expect(input()).toHaveClass('selection:bg-transparent');
  });

  it('opens an existing memory hook with a quick double tap in the mobile layout and limits its length', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const onMemoryHookChange = vi.fn();
    renderCard({
      word: VI_WORD,
      memoryHook: 'existing hook',
      showMemoryHook: true,
      onMemoryHookChange,
    });

    const nowSpy = vi.spyOn(Date, 'now');
    const hookInput = screen.getByPlaceholderText('Add memory hook');

    nowSpy.mockReturnValue(1_000);
    fireEvent.click(screen.getByText('existing hook'));
    expect(hookInput).not.toHaveFocus();

    // A second tap arriving too late counts as a fresh first tap.
    nowSpy.mockReturnValue(2_000);
    fireEvent.click(screen.getByText('existing hook'));
    expect(hookInput).not.toHaveFocus();

    nowSpy.mockReturnValue(2_200);
    fireEvent.click(screen.getByText('existing hook'));
    expect(hookInput).toHaveFocus();
    expect(hookInput.closest('article')).not.toHaveClass('phrase-card--editing-hook');
    expect(hookInput.closest('.word-card-content')).not.toHaveClass('word-card-content--editing-hook');
    expect(hookInput).toHaveAttribute('maxLength', '160');
    nowSpy.mockRestore();

    fireEvent.change(hookInput, { target: { value: 'x'.repeat(200) } });
    expect(hookInput).toHaveValue('x'.repeat(160));
    fireEvent.blur(hookInput);
    expect(onMemoryHookChange).toHaveBeenCalledWith('x'.repeat(160));
  });

  it('keeps the letter mask and explicit check for a slot-compatible alternative', () => {
    const { onScore } = renderCard({
      // 'see you' matches 'con chó' slot-for-slot (7 graphemes, space at idx 3).
      word: makeWord('alt', 'pes', 'con chó', { acceptedTarget: ['see you'] }),
    });
    expect(document.querySelector('.game-typing-mask')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check/i })).toBeInTheDocument();
    // Prefilled space → only the letters are typed; the merged answer is the
    // alternative and scores as a perfect (alternative) match.
    fireEvent.change(input(), { target: { value: 'seeyou' } });
    checkAnswer();
    expect(perfectMark()).toBeInTheDocument();
    expect(onScore).toHaveBeenCalledWith(2);
  });

  it('preserves spaces in accepted alternative answers when punctuation is prefilled', () => {
    // A different-length alternative keeps the free-text input, where typed
    // spaces must survive the prefill sanitization.
    renderCard({
      word: makeWord('alt', 'pes', 'con chó', { acceptedTarget: ['see you later'] }),
      checkButtonEnabled: true,
    });
    expect(document.querySelector('.game-typing-mask')).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'see you later' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(perfectMark()).toBeInTheDocument();
  });

  it('falls back to the free input when any alternative has a different length', () => {
    renderCard({
      word: makeWord('alt', 'pes', 'con chó', { acceptedTarget: ['see you', 'cya'] }),
    });
    expect(document.querySelector('.game-typing-mask')).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'cya' } });
    checkAnswer();
    expect(perfectMark()).toBeInTheDocument();
  });

  it('lets a Telex intermediate value exceed the slot count before the manual check', () => {
    renderCard({ word: VI_WORD, checkButtonEnabled: true });
    // "con chos" mid-Telex (the tone key not yet applied) — nothing fires…
    fireEvent.change(input(), { target: { value: 'conchos' } });
    expect(queryContinueOverlay()).not.toBeInTheDocument();
    // …the keyboard then rewrites the value and the user confirms.
    fireEvent.change(input(), { target: { value: 'conchó' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(perfectMark()).toBeInTheDocument();
  });

  it('keeps explicit check when the answer side is not a multi-key language', () => {
    // The reversed role puts Czech on the learning side, so the answer is not
    // the multi-key Vietnamese text.
    renderCard({ word: VI_WORD, role: 'languageToLearn' });
    // Answer is the Czech side; confirmation is still explicit.
    expect(screen.getByRole('button', { name: /check/i })).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'pes' } });
    checkAnswer();
    expect(perfectMark()).toBeInTheDocument();
  });

  it('renders only the repeat-after action, without the Forgotten/OK buttons', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /custom interval/i })).toBeInTheDocument();
    expect(screen.queryByText("Don't know")).not.toBeInTheDocument();
    expect(screen.queryByText('I know')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument();
  });
});
