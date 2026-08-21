import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TypingChallengeGame } from '../TypingChallengeGame';
import { I18nProvider } from '@/components/I18nProvider';
import type { NormalizedWord } from '@/lib/words';

vi.mock('@/lib/audio-availability', () => ({
  getCachedPlayableAudioUrl: () => null,
  getPlayableAudioUrl: (url: string | null) => Promise.resolve(url),
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

// words[0] is the question word
// role=cz: prompt=cz word, correct=vi word
const WORDS = [
  makeWord('a', 'pes', 'con chó', { czAudio: 'speech/cz/pes.mp3', viAudio: 'speech/vi/con-cho.mp3' }),
  makeWord('b', 'kočka', 'con mèo'),
];

let playCalls = 0;
let audioSources: string[] = [];

beforeEach(() => {
  playCalls = 0;
  audioSources = [];
  vi.stubGlobal(
    'Audio',
    vi.fn().mockImplementation(function FakeAudio(this: { src: string; play: () => Promise<void>; pause: () => void }, src: string) {
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

describe('TypingChallengeGame', () => {
  it('calls onResult(2) when exact match is submitted', () => {
    const onResult = vi.fn();
    render(
      <TypingChallengeGame words={WORDS} role="knownLanguage" onResult={onResult} />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'con chó' } });
    fireEvent.click(screen.getByText('Check'));
    expect(onResult).toHaveBeenCalledWith(2);
  });

  it('plays the learning-language audio when an exact answer is checked with sound enabled', async () => {
    render(
      <TypingChallengeGame words={WORDS} role="knownLanguage" soundEnabled />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'con chó' } });
    fireEvent.click(screen.getByText('Check'));
    await waitFor(() => expect(playCalls).toBe(1));
    expect(audioSources).toContain('/speech/vi/con-cho.mp3');
  });

  it('calls onResult(1) when close match is submitted', () => {
    const onResult = vi.fn();
    render(
      <TypingChallengeGame words={WORDS} role="knownLanguage" onResult={onResult} />
    );
    // 'con cho' is close to 'con chó' (missing diacritic)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'con cho' } });
    fireEvent.click(screen.getByText('Check'));
    expect(onResult).toHaveBeenCalledWith(1);
  });

  it('plays the learning-language audio when a close answer is checked with sound enabled', async () => {
    render(
      <TypingChallengeGame words={WORDS} role="knownLanguage" soundEnabled />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'con cho' } });
    fireEvent.click(screen.getByText('Check'));
    await waitFor(() => expect(playCalls).toBe(1));
    expect(audioSources).toContain('/speech/vi/con-cho.mp3');
  });

  it('calls onResult(0) when wrong answer is submitted', () => {
    const onResult = vi.fn();
    render(
      <TypingChallengeGame words={WORDS} role="knownLanguage" onResult={onResult} />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'totally wrong' } });
    fireEvent.click(screen.getByText('Check'));
    expect(onResult).toHaveBeenCalledWith(0);
  });

  it('does not play audio when a wrong answer is checked with sound enabled', () => {
    render(
      <TypingChallengeGame words={WORDS} role="knownLanguage" soundEnabled />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'totally wrong' } });
    fireEvent.click(screen.getByText('Check'));
    expect(playCalls).toBe(0);
  });

  it('does not throw when onResult is not provided', () => {
    render(<TypingChallengeGame words={WORDS} role="knownLanguage" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'con chó' } });
    fireEvent.click(screen.getByText('Check'));
    // no assertion needed - just must not throw
  });

  it('supports sourceLang override for direction switching', () => {
    render(
      <TypingChallengeGame words={WORDS} role="knownLanguage" sourceLang="to" />
    );
    // sourceLang=vi means prompt is Vietnamese and expected answer is Czech
    expect(screen.getByText('⌨️ Type in Czech')).toBeInTheDocument();
    expect(screen.getByText('con chó')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'pes' } });
    fireEvent.click(screen.getByText('Check'));
    expect(screen.getByRole('img', { name: 'Perfect!' })).toBeInTheDocument();
  });

  it('renders replay-only listening prompt and hides source text in audio mode', async () => {
    render(
      <TypingChallengeGame words={WORDS} role="knownLanguage" sourceLang="from" promptMode="audio" />
    );
    expect(screen.queryByText('pes')).not.toBeInTheDocument();
    const replay = screen.getByRole('button', { name: /replay prompt audio/i });
    fireEvent.click(replay);
    await waitFor(() => expect(playCalls).toBe(1));
  });

  it('falls back to text prompt when requested audio is missing', () => {
    const noAudioWords = [
      makeWord('a', 'pes', 'con chó'),
      makeWord('b', 'kočka', 'con mèo'),
    ];
    render(
      <TypingChallengeGame words={noAudioWords} role="knownLanguage" sourceLang="from" promptMode="audio" />
    );
    expect(screen.getByText('⌨️ Type in Vietnamese')).toBeInTheDocument();
    expect(screen.getByText('pes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /replay prompt audio/i })).not.toBeInTheDocument();
  });

  it('uses natural Czech wording for the Vietnamese typing target', () => {
    render(
      <I18nProvider language="cs">
        <TypingChallengeGame words={WORDS} role="knownLanguage" />
      </I18nProvider>
    );
    expect(screen.getByText('⌨️ Psaní ve vietnamštině')).toBeInTheDocument();
  });
});
