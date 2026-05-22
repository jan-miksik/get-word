import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MultipleChoiceGame } from '../MultipleChoiceGame';
import type { NormalizedWord } from '@/lib/words';

const getPlayableAudioUrlMock = vi.hoisted(() =>
  vi.fn((url: string | null) => Promise.resolve(url)),
);

vi.mock('@/lib/audio-availability', () => ({
  getPlayableAudioUrl: getPlayableAudioUrlMock,
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

// words[0] is always the question word
const WORDS = [
  makeWord('a', 'pes', 'con chó', { czAudio: 'speech/cz/pes.mp3', viAudio: 'speech/vi/con-cho.mp3' }),
  makeWord('b', 'kočka', 'con mèo'),
  makeWord('c', 'auto', 'xe hơi'),
  makeWord('d', 'voda', 'nước'),
];

let playCalls = 0;
let audioSources: string[] = [];

beforeEach(() => {
  playCalls = 0;
  audioSources = [];
  getPlayableAudioUrlMock.mockReset();
  getPlayableAudioUrlMock.mockImplementation((url: string | null) => Promise.resolve(url));
  vi.stubGlobal(
    'Audio',
    vi.fn().mockImplementation(function FakeAudio(this: { play: () => Promise<void>; pause: () => void }, src: string) {
      audioSources.push(src);
      this.play = () => {
        playCalls += 1;
        return Promise.resolve();
      };
      this.pause = () => {};
    }),
  );
});

describe('MultipleChoiceGame', () => {
  it('calls onResult(+1) when the correct option is selected', () => {
    const onResult = vi.fn();
    render(
      <MultipleChoiceGame words={WORDS} role="cz" onResult={onResult} />
    );
    // role=cz: prompt=pes, correct answer=con chó
    fireEvent.click(screen.getByText('con chó'));
    expect(onResult).toHaveBeenCalledWith(1);
  });

  it('calls onResult(-1) when a wrong option is selected', () => {
    const onResult = vi.fn();
    render(
      <MultipleChoiceGame words={WORDS} role="cz" onResult={onResult} />
    );
    // role=cz: prompt=pes, wrong answer=con mèo
    fireEvent.click(screen.getByText('con mèo'));
    expect(onResult).toHaveBeenCalledWith(-1);
  });

  it('awards +2 for a correct answer in level 2', () => {
    const onResult = vi.fn();
    render(
      <MultipleChoiceGame words={WORDS} role="cz" level={2} onResult={onResult} />
    );
    fireEvent.click(screen.getByText('con chó'));
    expect(onResult).toHaveBeenCalledWith(2);
  });

  it('does not throw when onResult is not provided', () => {
    render(<MultipleChoiceGame words={WORDS} role="cz" />);
    fireEvent.click(screen.getByText('con chó'));
    // no assertion needed - just must not throw
  });

  it('supports sourceLang override for random direction', () => {
    const onResult = vi.fn();
    render(
      <MultipleChoiceGame words={WORDS} role="cz" sourceLang="vi" onResult={onResult} />
    );
    // sourceLang=vi => prompt is Vietnamese and options are Czech
    expect(screen.getByText('con chó')).toBeInTheDocument();
    fireEvent.click(screen.getByText('pes'));
    expect(onResult).toHaveBeenCalledWith(1);
  });

  it('renders replay-only listening prompt and hides source text in audio mode', async () => {
    render(
      <MultipleChoiceGame words={WORDS} role="cz" sourceLang="cz" promptMode="audio" />
    );
    expect(screen.queryByText('pes')).not.toBeInTheDocument();
    const replay = screen.getByRole('button', { name: /replay prompt audio/i });
    fireEvent.click(replay);
    await waitFor(() => expect(playCalls).toBe(1));
  });

  it('plays selected option audio on answer in audio mode when sound is enabled', async () => {
    render(
      <MultipleChoiceGame words={WORDS} role="cz" sourceLang="cz" promptMode="audio" soundEnabled />
    );
    fireEvent.click(screen.getByText('con chó'));
    await waitFor(() => expect(playCalls).toBe(1));
  });

  it('plays the learning-language audio for a correct answer when sound is enabled', async () => {
    render(
      <MultipleChoiceGame words={WORDS} role="cz" soundEnabled />
    );
    fireEvent.click(screen.getByText('con chó'));
    await waitFor(() => expect(playCalls).toBe(1));
    expect(audioSources).toContain('/speech/vi/con-cho.mp3');
  });

  it('tries later learning-language audio candidates when the first one is unavailable', async () => {
    getPlayableAudioUrlMock.mockImplementation((url: string | null) =>
      Promise.resolve(url?.includes('missing') ? null : url),
    );
    const wordsWithFallbackAudio = [
      makeWord('a', 'pes', 'con chó', {
        viAudio: ['speech/vi/missing.mp3', 'speech/vi/con-cho.mp3'],
      }),
      ...WORDS.slice(1),
    ];

    render(
      <MultipleChoiceGame words={wordsWithFallbackAudio} role="cz" soundEnabled />
    );
    fireEvent.click(screen.getByText('con chó'));

    await waitFor(() => expect(playCalls).toBe(1));
    expect(getPlayableAudioUrlMock).toHaveBeenCalledWith('/speech/vi/missing.mp3');
    expect(audioSources).toContain('/speech/vi/con-cho.mp3');
  });

  it('does not play answer audio for a wrong answer even when sound is enabled', async () => {
    render(
      <MultipleChoiceGame words={WORDS} role="cz" soundEnabled />
    );
    fireEvent.click(screen.getByText('con mèo'));
    await waitFor(() => expect(playCalls).toBe(0));
  });

  it('falls back to text prompt when requested audio is missing', () => {
    const noAudioWords = [
      makeWord('a', 'pes', 'con chó'),
      makeWord('b', 'kočka', 'con mèo'),
      makeWord('c', 'auto', 'xe hơi'),
      makeWord('d', 'voda', 'nước'),
    ];
    render(
      <MultipleChoiceGame words={noAudioWords} role="cz" sourceLang="cz" promptMode="audio" />
    );
    expect(screen.getByText('pes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /replay prompt audio/i })).not.toBeInTheDocument();
  });
});
