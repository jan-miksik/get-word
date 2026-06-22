import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardDeckView } from '../CardDeckView';
import type { NormalizedWord } from '@/lib/words';
import type { MiniGameConfig } from '@/lib/minigames';

const {
  checkAudioUrlAvailableMock,
  prefetchAudioMock,
} = vi.hoisted(() => ({
  checkAudioUrlAvailableMock: vi.fn(() => Promise.resolve(true)),
  prefetchAudioMock: vi.fn(),
}));

vi.mock('@/lib/audio-availability', () => ({
  checkAudioUrlAvailable: checkAudioUrlAvailableMock,
}));

vi.mock('@/lib/audio-prefetch', () => ({
  prefetchAudio: prefetchAudioMock,
}));

const makeWord = (id: string): NormalizedWord => ({
  id,
  cz: `cz-${id}`,
  vi: `vi-${id}`,
  en: '',
  category: [],
  czAudio: 'speech/cz/sample.mp3',
  viAudio: 'speech/vi/sample.mp3',
});

const makeGame = (id: string): MiniGameConfig => ({
  _isMinigame: true,
  id,
  gameType: 'multipleChoice',
  words: [makeWord('a'), makeWord('b'), makeWord('c'), makeWord('d')],
});

describe('CardDeckView', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Reflect.deleteProperty(navigator, 'connection');
    checkAudioUrlAvailableMock.mockClear();
    prefetchAudioMock.mockClear();
  });

  it('warms audio availability and prefetches for the current and next 2 items', async () => {
    const groupedWords = [[
      makeWord('w1'),
      makeGame('g1'),
      makeWord('w2'),
      makeWord('w3'),
    ]];

    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={(word) => <span data-testid={`card-${word.id}`}>{word.id}</span>}
        renderMiniGame={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(prefetchAudioMock).toHaveBeenCalledWith([
        '/speech/cz/sample.mp3',
        '/speech/vi/sample.mp3',
      ]);
    });
    expect(checkAudioUrlAvailableMock).toHaveBeenCalledTimes(2);
    expect(checkAudioUrlAvailableMock).toHaveBeenNthCalledWith(1, '/speech/cz/sample.mp3');
    expect(checkAudioUrlAvailableMock).toHaveBeenNthCalledWith(2, '/speech/vi/sample.mp3');
  });

  it('does not issue audio warmup probes while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    render(
      <CardDeckView
        groupedWords={[[makeWord('w1'), makeWord('w2')]]}
        renderCard={(word) => <span>{word.id}</span>}
        renderMiniGame={vi.fn()}
      />
    );

    await Promise.resolve();
    expect(checkAudioUrlAvailableMock).not.toHaveBeenCalled();
    expect(prefetchAudioMock).not.toHaveBeenCalled();
  });

  it('renders the first item from the flattened stream', () => {
    const groupedWords = [[makeWord('w1'), makeWord('w2')]];
    const renderCard = (word: NormalizedWord, _: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span data-testid={`card-${word.id}`}>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );
    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );
    expect(screen.getByTestId('card-w1')).toBeInTheDocument();
    expect(screen.queryByTestId('card-w2')).not.toBeInTheDocument();
  });

  it('advances to next item after onComplete is called', async () => {
    const groupedWords = [[makeWord('w1'), makeWord('w2')]];
    const renderCard = (word: NormalizedWord, _: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span data-testid={`card-${word.id}`}>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );
    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText('Complete'));
    expect(screen.getByTestId('card-w2')).toBeInTheDocument();
  });

  it('renders a minigame when the current item is a MiniGameConfig', () => {
    const groupedWords = [[makeGame('g1')]];
    const renderMiniGame = (config: MiniGameConfig, onComplete: () => void) => (
      <div data-testid={`game-${config.id}`}>
        <button onClick={onComplete}>Finish game</button>
      </div>
    );
    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={vi.fn()}
        renderMiniGame={renderMiniGame}
      />
    );
    expect(screen.getByTestId('game-g1')).toBeInTheDocument();
  });

  it('flattens multi-group stream in order', () => {
    const groupedWords = [[makeWord('w1')], [makeWord('w2')], [makeWord('w3')]];
    const renderCard = (word: NormalizedWord) => (
      <span data-testid={`card-${word.id}`}>{word.id}</span>
    );
    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );
    expect(screen.getByTestId('card-w1')).toBeInTheDocument();
  });

  it('shows all-done state when past the last card', async () => {
    const groupedWords = [[makeWord('w1')]];
    const renderCard = (word: NormalizedWord, _: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );
    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText('Complete'));
    expect(screen.getByText(/all done/i)).toBeInTheDocument();
  });

  it('calls onWordCardCompleted for word cards but not minigames', async () => {
    const onWordCardCompleted = vi.fn();
    const groupedWords = [[makeWord('w1'), makeGame('g1')]];
    const renderCard = (word: NormalizedWord, _: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );
    const renderMiniGame = (config: MiniGameConfig, onComplete: () => void) => (
      <div>
        <span>{config.id}</span>
        <button onClick={onComplete}>Finish game</button>
      </div>
    );

    render(
      <CardDeckView
        groupedWords={groupedWords}
        onWordCardCompleted={onWordCardCompleted}
        renderCard={renderCard}
        renderMiniGame={renderMiniGame}
      />
    );

    await userEvent.click(screen.getByText('Complete'));
    expect(onWordCardCompleted).toHaveBeenCalledTimes(1);
    expect(onWordCardCompleted).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }));

    await userEvent.click(screen.getByText('Finish game'));
    expect(onWordCardCompleted).toHaveBeenCalledTimes(1);
  });

  it('renders an interstitial card before all-done when provided', async () => {
    const groupedWords = [[makeWord('w1')]];
    const renderCard = (word: NormalizedWord, _: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );

    const { rerender } = render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );

    await userEvent.click(screen.getByText('Complete'));

    rerender(
      <CardDeckView
        groupedWords={[]}
        interstitialCard={<div data-testid="intro-card">Intro</div>}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );

    expect(screen.getByTestId('intro-card')).toBeInTheDocument();
    expect(screen.queryByText(/all done/i)).not.toBeInTheDocument();
  });

  // The default test env short-circuits the exit animation; these drive the real
  // animated path (NODE_ENV !== 'test') so the animationend/fallback advance logic
  // is actually exercised.
  describe('animated advance (non-test env)', () => {
    // jsdom doesn't surface `animationName` on a synthetic animationend, so build
    // the event explicitly to mirror a real browser exit animation completing.
    const fireExitAnimationEnd = (element: Element) => {
      const event = new Event('animationend', { bubbles: true });
      Object.defineProperty(event, 'animationName', { value: 'deck-exit-scale' });
      fireEvent(element, event);
    };

    const animatedRenderCard = (
      word: NormalizedWord,
      _: number,
      onComplete: (afterExit?: () => void) => void,
    ) => (
      <div>
        <span data-testid={`card-${word.id}`}>{word.id}</span>
        <button onClick={() => onComplete(() => {})}>Complete</button>
      </div>
    );

    it('advances when the exit animationend fires', () => {
      vi.stubEnv('NODE_ENV', 'development');
      try {
        const { container } = render(
          <CardDeckView
            groupedWords={[[makeWord('w1'), makeWord('w2')]]}
            renderCard={animatedRenderCard}
            renderMiniGame={vi.fn()}
          />,
        );

        fireEvent.click(screen.getByText('Complete'));
        // Still on w1 while the exit animation plays.
        expect(screen.getByTestId('card-w1')).toBeInTheDocument();

        const animating = container.querySelector('[class*="animate-deck-exit"]');
        expect(animating).not.toBeNull();
        fireExitAnimationEnd(animating!);

        expect(screen.getByTestId('card-w2')).toBeInTheDocument();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('recovers from a missing animationend via the fallback timer', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.useFakeTimers();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        render(
          <CardDeckView
            groupedWords={[[makeWord('w1'), makeWord('w2')]]}
            renderCard={animatedRenderCard}
            renderMiniGame={vi.fn()}
          />,
        );

        fireEvent.click(screen.getByText('Complete'));
        expect(screen.getByTestId('card-w1')).toBeInTheDocument();

        // animationend never fires (e.g. app backgrounded mid-animation); the
        // fallback timer must still advance the deck instead of freezing.
        act(() => {
          vi.advanceTimersByTime(1000);
        });

        expect(screen.getByTestId('card-w2')).toBeInTheDocument();
        expect(warn).toHaveBeenCalled();
      } finally {
        warn.mockRestore();
        vi.useRealTimers();
        vi.unstubAllEnvs();
      }
    });

    it('ignores a second tap while an exit animation is already in flight', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const onWordCardCompleted = vi.fn();
      try {
        const { container } = render(
          <CardDeckView
            groupedWords={[[makeWord('w1'), makeWord('w2'), makeWord('w3')]]}
            onWordCardCompleted={onWordCardCompleted}
            renderCard={animatedRenderCard}
            renderMiniGame={vi.fn()}
          />,
        );

        const completeButton = screen.getByText('Complete');
        fireEvent.click(completeButton);
        // Second tap during the exit must be a no-op (no extra completion).
        fireEvent.click(completeButton);
        expect(onWordCardCompleted).toHaveBeenCalledTimes(1);

        const animating = container.querySelector('[class*="animate-deck-exit"]');
        fireExitAnimationEnd(animating!);
        // Only advanced one card, not two.
        expect(screen.getByTestId('card-w2')).toBeInTheDocument();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('animates the final card after its completion overlay is confirmed', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const { container } = render(
          <CardDeckView
            groupedWords={[[makeWord('w1')]]}
            renderCard={animatedRenderCard}
            renderMiniGame={vi.fn()}
          />,
        );

        fireEvent.click(screen.getByText('Complete'));
        expect(screen.getByText(/tap to continue/i)).toBeInTheDocument();

        fireEvent.click(screen.getByText(/tap to continue/i));
        const animating = container.querySelector('[class*="animate-deck-exit"]');
        expect(animating).not.toBeNull();
        expect(screen.getByTestId('card-w1')).toBeInTheDocument();

        fireExitAnimationEnd(animating!);
        expect(screen.getByText(/all done/i)).toBeInTheDocument();
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
        vi.unstubAllEnvs();
      }
    });
  });

  it('resets the deck cursor when switching to a different grouped word set', async () => {
    const renderCard = (word: NormalizedWord, _: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span data-testid={`card-${word.id}`}>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );

    const { rerender } = render(
      <CardDeckView
        groupedWords={[[makeWord('w1')]]}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );

    await userEvent.click(screen.getByText('Complete'));
    expect(screen.getByText(/all done/i)).toBeInTheDocument();

    rerender(
      <CardDeckView
        groupedWords={[[makeWord('w2')]]}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );

    expect(screen.getByTestId('card-w2')).toBeInTheDocument();
    expect(screen.queryByText(/all done/i)).not.toBeInTheDocument();
  });

  it('keeps the current card visible while prioritizing a newly due card next', async () => {
    const renderCard = (word: NormalizedWord, _: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span data-testid={`card-${word.id}`}>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );
    const current = makeWord('current');
    const later = makeWord('later');
    const newlyDue = makeWord('newly-due');

    const { rerender } = render(
      <CardDeckView
        groupedWords={[[current, later]]}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );

    rerender(
      <CardDeckView
        groupedWords={[[newlyDue, current, later]]}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );

    expect(screen.getByTestId('card-current')).toBeInTheDocument();
    expect(screen.queryByTestId('card-newly-due')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Complete'));
    expect(screen.getByTestId('card-newly-due')).toBeInTheDocument();
  });
});
