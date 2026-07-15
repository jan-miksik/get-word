import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TypingStudyCard } from '../TypingStudyCard';
import type { ProgressData } from '@/lib/sync';
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

// Same word with language metadata: a Vietnamese ('vi') answer side switches
// the card to manual (Telex-safe) checking.
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
      writeIn="foreign"
      audioPromptEnabled={false}
      prefillPunctuation
      modeIndex={0}
      onScore={onScore}
      onOutcome={onOutcome}
      onCustomStage={onCustomStage}
      {...props}
    />,
  );
  return { onOutcome, onScore, onCustomStage };
}

const input = () => screen.getByRole('textbox');
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

  it('autofocuses the mobile keyboard after an explicit opt-in', () => {
    stubMobileLayout(true);
    renderCard({ autoFocus: true, autoFocusOnMobile: true });
    expect(input()).toHaveFocus();
  });

  it('auto-checks on the last character, scores immediately, and reports known only after tapping continue', () => {
    const { onOutcome, onScore } = renderCard();
    // Space is prefilled, so only the letters are typed.
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
    // Points land at evaluation time, before the continue tap.
    expect(onScore).toHaveBeenCalledTimes(1);
    expect(onScore).toHaveBeenCalledWith(2);
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledTimes(1);
    expect(onOutcome).toHaveBeenCalledWith('known');
    expect(onScore).toHaveBeenCalledTimes(1);
  });

  it('reports the outcome only once on a rapid double tap', () => {
    const { onOutcome } = renderCard();
    fireEvent.change(input(), { target: { value: 'conchó' } });
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
    expect(onScore).toHaveBeenCalledWith(1);
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('stay');
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
    expect(screen.getByText(/Close! Correct:/)).toBeInTheDocument();
    expect(screen.getByRole('status').className).toContain('!bg-[#FFF0BD]');
    expect(screen.getByRole('status').className).toContain('!text-[#5B3A00]');
    expect(onScore).toHaveBeenCalledWith(1);
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('stay');
  });

  it('reports unknown with no score after two hints even when the answer ends up correct', () => {
    const { onOutcome, onScore } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    fireEvent.change(input(), { target: { value: 'conchó' } });
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('unknown');
    expect(onScore).not.toHaveBeenCalled();
  });

  it('shows the correct answer on a wrong attempt and reports unknown after the tap', () => {
    const { onOutcome, onScore } = renderCard();
    fireEvent.change(input(), { target: { value: 'xxxxxx' } });
    expect(screen.getByText(/Correct:/)).toBeInTheDocument();
    expect(screen.getByText('con chó')).toBeInTheDocument();
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('unknown');
    expect(onScore).not.toHaveBeenCalled();
  });

  it('does not auto-check while an IME composition is in progress', () => {
    renderCard();
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(queryContinueOverlay()).not.toBeInTheDocument();
    fireEvent.compositionEnd(input());
    expect(continueOverlay()).toBeInTheDocument();
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
  });

  it('accepts a pasted answer that includes the prefilled punctuation', () => {
    const { onOutcome } = renderCard();
    fireEvent.change(input(), { target: { value: 'con chó' } });
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('known');
  });

  it('does not ignore extra editable characters pasted after the correct answer', () => {
    const { onOutcome } = renderCard();
    fireEvent.change(input(), { target: { value: 'con chóxyz' } });
    expect(screen.getByText(/Correct:/)).toBeInTheDocument();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('unknown');
  });

  it('requires typing the space when prefill is disabled', () => {
    renderCard({ prefillPunctuation: false });
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(queryContinueOverlay()).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'con chó' } });
    expect(continueOverlay()).toBeInTheDocument();
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
  });

  it('does not count a space filled by the hint as a hint when prefill is disabled', () => {
    const { onOutcome } = renderCard({ prefillPunctuation: false });
    // Fill 'con' first; the next hint press fills the space (free) plus 'c'.
    fireEvent.change(input(), { target: { value: 'con' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    fireEvent.change(input(), { target: { value: 'con chó' } });
    fireEvent.click(continueOverlay());
    // One consumed hint (the letter) → stay, not unknown.
    expect(onOutcome).toHaveBeenCalledWith('stay');
  });

  it('types the known side when writeIn=known and shows the write-in badge', () => {
    const { onOutcome } = renderCard({ writeIn: 'known' });
    expect(screen.getByText('⌨️ Type in Czech')).toBeInTheDocument();
    // Prompt is the foreign text (audio prompt disabled).
    expect(screen.getByText('con chó')).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'pes' } });
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('known');
  });

  it('hides the write-in badge in the default foreign mode', () => {
    renderCard();
    expect(screen.queryByText(/Type in/)).not.toBeInTheDocument();
  });

  it('maps the foreign side correctly for the reversed list role', () => {
    const { onOutcome } = renderCard({ role: 'languageToLearn' });
    // languageToLearn: learning side is 'from' (cz) → the answer is 'pes'.
    expect(screen.getByText('con chó')).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'pes' } });
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('known');
  });

  it('picks the side from modeIndex when writeIn=both', () => {
    renderCard({ writeIn: 'both', modeIndex: 1 });
    // modeIndex 1 → known side (cz); the prompt shows the foreign text.
    expect(screen.getByText('⌨️ Type in Czech')).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'pes' } });
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
  });

  it('shows the audio prompt with the known meaning under it', () => {
    renderCard({ audioPromptEnabled: true });
    expect(screen.getByRole('button', { name: /replay prompt audio/i })).toBeInTheDocument();
    // Dictation still carries the meaning in the known language.
    expect(screen.getByText('pes')).toBeInTheDocument();
  });

  it('hides the known meaning under the audio prompt when the known side is the answer', () => {
    renderCard({ audioPromptEnabled: true, writeIn: 'known' });
    expect(screen.getByRole('button', { name: /replay prompt audio/i })).toBeInTheDocument();
    // Showing 'pes' would reveal exactly what the user has to type.
    expect(screen.queryByText('pes')).not.toBeInTheDocument();
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
    expect(playCalls).toBe(0);
  });

  it('shows the expected character under each wrong slot after the check', () => {
    renderCard();
    fireEvent.change(input(), { target: { value: 'xxxxxx' } });
    const corrections = Array.from(document.querySelectorAll('.game-typing-correction'));
    // One correction row per slot (6 letters + the fixed space placeholder).
    expect(corrections).toHaveLength(7);
    const visible = corrections.filter((el) => !el.className.includes('invisible'));
    expect(visible.map((el) => el.textContent).join('')).toBe('conchó');
  });

  it('shows the accented character under a close (diacritics-only) slot', () => {
    renderCard();
    fireEvent.change(input(), { target: { value: 'concho' } });
    const visible = Array.from(
      document.querySelectorAll('.game-typing-correction'),
    ).filter((el) => !el.className.includes('invisible'));
    expect(visible.map((el) => el.textContent)).toEqual(['ó']);
  });

  it('shows no correction row after a perfect answer', () => {
    renderCard();
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(document.querySelectorAll('.game-typing-correction')).toHaveLength(0);
  });

  it('does not auto-check a Vietnamese (multi-key input) answer when the slots fill up', () => {
    const { onScore } = renderCard({ word: VI_WORD });
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(queryContinueOverlay()).not.toBeInTheDocument();
    expect(onScore).not.toHaveBeenCalled();
  });

  it('checks a Vietnamese answer on Enter', () => {
    const { onScore } = renderCard({ word: VI_WORD });
    fireEvent.change(input(), { target: { value: 'conchó' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
    expect(onScore).toHaveBeenCalledWith(2);
  });

  it('checks a Vietnamese answer via the check button, disabled while empty', () => {
    renderCard({ word: VI_WORD });
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
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
    const continueButtons = screen.getAllByRole('button', { name: /continue/i });
    expect(continueButtons).toHaveLength(2);
    expect(continueButtons[1].className).toContain('absolute');
    expect(continueButtons[1]).toHaveTextContent(/repeat/i);
  });

  it('moves only the repeat action on mobile after evaluation, leaving audio anchored', () => {
    const { container } = render(
      <TypingStudyCard
        word={VI_WORD}
        progress={PROGRESS}
        role="knownLanguage"
        writeIn="foreign"
        audioPromptEnabled={false}
        prefillPunctuation
        modeIndex={0}
        onOutcome={vi.fn()}
        onCustomStage={vi.fn()}
      />,
    );
    const cardActions = container.querySelector('.card-actions');
    const audioButton = screen.getByRole('button', { name: /^play audio$/i });
    const repeatButton = screen.getByRole('button', { name: /custom interval/i });
    const repeatWrapper = repeatButton.parentElement?.parentElement;

    expect(cardActions?.className).not.toContain('translate-y');
    expect(audioButton).toHaveClass('audio-btn--floating');
    expect(repeatWrapper?.className).toContain('max-md:-translate-y-1');

    fireEvent.change(input(), { target: { value: 'conchó' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));

    expect(cardActions?.className).not.toContain('translate-y');
    expect(audioButton).toBeInTheDocument();
    expect(repeatWrapper?.className).toContain('max-md:-translate-y-[64px]');
  });

  it('selects one tapped character on pointer down so the caret does not jump after the click', () => {
    renderCard({ word: VI_WORD });
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
    const hookInput = screen.getByPlaceholderText('Enter memory hook...');

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
    expect(hookInput).toHaveAttribute('maxLength', '160');
    nowSpy.mockRestore();

    fireEvent.change(hookInput, { target: { value: 'x'.repeat(200) } });
    expect(hookInput).toHaveValue('x'.repeat(160));
    fireEvent.blur(hookInput);
    expect(onMemoryHookChange).toHaveBeenCalledWith('x'.repeat(160));
  });

  it('keeps the letter mask and auto-check for a slot-compatible alternative', () => {
    const { onScore } = renderCard({
      // 'see you' matches 'con chó' slot-for-slot (7 graphemes, space at idx 3).
      word: makeWord('alt', 'pes', 'con chó', { acceptedTarget: ['see you'] }),
    });
    expect(document.querySelector('.game-typing-mask')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check/i })).not.toBeInTheDocument();
    // Prefilled space → only the letters are typed; the merged answer is the
    // alternative and scores as a perfect (alternative) match.
    fireEvent.change(input(), { target: { value: 'seeyou' } });
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
    expect(onScore).toHaveBeenCalledWith(2);
  });

  it('preserves spaces in accepted alternative answers when punctuation is prefilled', () => {
    // A different-length alternative keeps the free-text input, where typed
    // spaces must survive the prefill sanitization.
    renderCard({
      word: makeWord('alt', 'pes', 'con chó', { acceptedTarget: ['see you later'] }),
    });
    expect(document.querySelector('.game-typing-mask')).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'see you later' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
  });

  it('falls back to the free input when any alternative has a different length', () => {
    renderCard({
      word: makeWord('alt', 'pes', 'con chó', { acceptedTarget: ['see you', 'cya'] }),
    });
    expect(document.querySelector('.game-typing-mask')).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'cya' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
  });

  it('lets a Telex intermediate value exceed the slot count before the manual check', () => {
    renderCard({ word: VI_WORD });
    // "con chos" mid-Telex (the tone key not yet applied) — nothing fires…
    fireEvent.change(input(), { target: { value: 'conchos' } });
    expect(queryContinueOverlay()).not.toBeInTheDocument();
    // …the keyboard then rewrites the value and the user confirms.
    fireEvent.change(input(), { target: { value: 'conchó' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
  });

  it('keeps auto-check when the answer side is not a multi-key language', () => {
    renderCard({ word: VI_WORD, writeIn: 'known' });
    // Answer is the Czech side; the check button stays hidden.
    expect(screen.queryByRole('button', { name: /check/i })).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'pes' } });
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
  });

  it('renders only the repeat-after action, without the Forgotten/OK buttons', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /custom interval/i })).toBeInTheDocument();
    expect(screen.queryByText('Forgotten')).not.toBeInTheDocument();
    expect(screen.queryByText('OK')).not.toBeInTheDocument();
    expect(screen.queryByText('Check')).not.toBeInTheDocument();
  });
});
