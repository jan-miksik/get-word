import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TypingStudyCard } from '../TypingStudyCard';
import type { ProgressData } from '@/lib/sync';
import type { NormalizedWord } from '@/lib/words';

const availability = { available: false };

vi.mock('@/lib/audio-availability', () => ({
  getPlayableAudioUrl: (url: string | null) => Promise.resolve(url),
  checkAudioUrlAvailable: () => Promise.resolve(availability.available),
  getCachedAudioUrlAvailability: () => null,
}));

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

const PROGRESS: ProgressData = { stageIndex: 2, knownCount: 1, unknownCount: 0 };

let playCalls = 0;
let audioSources: string[] = [];

beforeEach(() => {
  availability.available = false;
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

function renderCard(props?: Partial<React.ComponentProps<typeof TypingStudyCard>>) {
  const onOutcome = vi.fn();
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
      onOutcome={onOutcome}
      onCustomStage={onCustomStage}
      {...props}
    />,
  );
  return { onOutcome, onCustomStage };
}

const input = () => screen.getByRole('textbox');
const continueOverlay = () => screen.getByRole('button', { name: /tap to continue/i });
const queryContinueOverlay = () => screen.queryByRole('button', { name: /tap to continue/i });

describe('TypingStudyCard', () => {
  it('auto-checks on the last character and reports known(2) only after tapping continue', () => {
    const { onOutcome } = renderCard();
    // Space is prefilled, so only the letters are typed.
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledTimes(1);
    expect(onOutcome).toHaveBeenCalledWith('known', 2);
  });

  it('reports the outcome only once on a rapid double tap', () => {
    const { onOutcome } = renderCard();
    fireEvent.change(input(), { target: { value: 'conchó' } });
    const overlay = continueOverlay();
    fireEvent.click(overlay);
    fireEvent.click(overlay);
    expect(onOutcome).toHaveBeenCalledTimes(1);
  });

  it('reports stay(1) after one hint, only after tapping continue', () => {
    const { onOutcome } = renderCard();
    fireEvent.click(screen.getByText('Hint'));
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: 'conchó' } });
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('stay', 1);
  });

  it('reports stay(1) for a close (diacritics-only) mistake', () => {
    const { onOutcome } = renderCard();
    fireEvent.change(input(), { target: { value: 'concho' } });
    expect(screen.getByText(/Close! Correct:/)).toBeInTheDocument();
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('stay', 1);
  });

  it('reports unknown(0) after two hints even when the answer ends up correct', () => {
    const { onOutcome } = renderCard();
    fireEvent.click(screen.getByText('Hint'));
    fireEvent.click(screen.getByText('Hint'));
    fireEvent.change(input(), { target: { value: 'conchó' } });
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('unknown', 0);
  });

  it('shows the correct answer on a wrong attempt and reports unknown(0) after the tap', () => {
    const { onOutcome } = renderCard();
    fireEvent.change(input(), { target: { value: 'xxxxxx' } });
    expect(screen.getByText(/Correct:/)).toBeInTheDocument();
    expect(screen.getByText('con chó')).toBeInTheDocument();
    expect(onOutcome).not.toHaveBeenCalled();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('unknown', 0);
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
    expect(onOutcome).toHaveBeenCalledWith('known', 2);
  });

  it('does not ignore extra editable characters pasted after the correct answer', () => {
    const { onOutcome } = renderCard();
    fireEvent.change(input(), { target: { value: 'con chóxyz' } });
    expect(screen.getByText(/Correct:/)).toBeInTheDocument();
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('unknown', 0);
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
    fireEvent.click(screen.getByText('Hint'));
    fireEvent.change(input(), { target: { value: 'con chó' } });
    fireEvent.click(continueOverlay());
    // One consumed hint (the letter) → stay, not unknown.
    expect(onOutcome).toHaveBeenCalledWith('stay', 1);
  });

  it('types the known side when writeIn=known and shows the write-in badge', () => {
    const { onOutcome } = renderCard({ writeIn: 'known' });
    expect(screen.getByText('⌨️ Type in Czech')).toBeInTheDocument();
    // Prompt is the foreign text (audio prompt disabled).
    expect(screen.getByText('con chó')).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'pes' } });
    fireEvent.click(continueOverlay());
    expect(onOutcome).toHaveBeenCalledWith('known', 2);
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
    expect(onOutcome).toHaveBeenCalledWith('known', 2);
  });

  it('picks the side from modeIndex when writeIn=both', () => {
    renderCard({ writeIn: 'both', modeIndex: 1 });
    // modeIndex 1 → known side (cz); the prompt shows the foreign text.
    expect(screen.getByText('⌨️ Type in Czech')).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'pes' } });
    expect(screen.getByText('✓ Perfect!')).toBeInTheDocument();
  });

  it('shows the audio prompt and hides the text when foreign audio is available', async () => {
    availability.available = true;
    renderCard({ audioPromptEnabled: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /replay prompt audio/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText('pes')).not.toBeInTheDocument();
  });

  it('falls back to the text prompt when the foreign audio is unavailable', async () => {
    availability.available = false;
    renderCard({ audioPromptEnabled: true });
    expect(screen.getByText('pes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /replay prompt audio/i })).not.toBeInTheDocument();
  });

  it('plays the foreign audio after a correct answer even when hints made the outcome unknown', async () => {
    renderCard();
    fireEvent.click(screen.getByText('Hint'));
    fireEvent.click(screen.getByText('Hint'));
    fireEvent.change(input(), { target: { value: 'conchó' } });
    await waitFor(() => expect(playCalls).toBe(1));
    expect(audioSources).toContain('/speech/vi/con-cho.mp3');
  });

  it('does not play audio after a wrong answer', () => {
    renderCard();
    fireEvent.change(input(), { target: { value: 'xxxxxx' } });
    expect(playCalls).toBe(0);
  });

  it('renders only the repeat-after action, without the Forgotten/OK buttons', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /custom interval/i })).toBeInTheDocument();
    expect(screen.queryByText('Forgotten')).not.toBeInTheDocument();
    expect(screen.queryByText('OK')).not.toBeInTheDocument();
    expect(screen.queryByText('Check')).not.toBeInTheDocument();
  });
});
