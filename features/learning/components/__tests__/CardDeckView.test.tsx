import { useEffect, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardDeckView } from '../CardDeckView';
import type { NormalizedWord } from '@/lib/words';
import type { MiniGameConfig } from '@/features/learning/minigames';
import { firePointer, swipeRight, swipeLeft, swipeUp } from '../card-deck/__tests__/pointer-test-utils';

const {
  getPlayableAudioUrlMock,
  prefetchAudioMock,
} = vi.hoisted(() => ({
  getPlayableAudioUrlMock: vi.fn((url: string | null) => Promise.resolve(url)),
  prefetchAudioMock: vi.fn(),
}));

vi.mock('@/lib/audio-availability', () => ({
  getPlayableAudioUrl: getPlayableAudioUrlMock,
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

const makeWordWithUniqueAudio = (id: string): NormalizedWord => ({
  ...makeWord(id),
  czAudio: `speech/cz/${id}.mp3`,
  viAudio: `speech/vi/${id}.mp3`,
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
    getPlayableAudioUrlMock.mockClear();
    prefetchAudioMock.mockClear();
  });

  it('starts preloading audio for the current and next card before probes finish', async () => {
    const groupedWords = [[
      makeWordWithUniqueAudio('w1'),
      makeWordWithUniqueAudio('w2'),
      makeWordWithUniqueAudio('w3'),
      makeWordWithUniqueAudio('w4'),
      makeWordWithUniqueAudio('w5'),
      makeWordWithUniqueAudio('w6'),
      makeWordWithUniqueAudio('w7'),
    ]];
    const expectedUrls = groupedWords[0]
      .slice(0, 2)
      .flatMap((word) => [`/speech/cz/${word.id}.mp3`, `/speech/vi/${word.id}.mp3`]);

    render(
      <CardDeckView
        groupedWords={groupedWords}
        renderCard={(word) => <span data-testid={`card-${word.id}`}>{word.id}</span>}
        renderMiniGame={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(prefetchAudioMock).toHaveBeenNthCalledWith(1, expectedUrls);
    });
    await waitFor(() => expect(getPlayableAudioUrlMock).toHaveBeenCalledTimes(4));
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
    expect(getPlayableAudioUrlMock).not.toHaveBeenCalled();
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

  // The closing block repeats the words the new block just introduced, so the
  // same word legitimately appears twice in one day. Keyed by word id alone the
  // second appearance was swallowed as "already completed", which left the
  // repeat block unfinished and the session rail stuck on it.
  it('serves a word again when a later block repeats it', async () => {
    const repeated = makeWord('w1');
    const streamGroups = [
      { key: 'new-0', kind: 'new' as const, blockIndex: 0, items: [repeated] },
      { key: 'review-1', kind: 'review' as const, blockIndex: 1, items: [repeated] },
    ];
    const renderCard = (word: NormalizedWord, blockIndex: number, onComplete: (afterExit?: () => void) => void) => (
      <div>
        <span data-testid={`card-${word.id}-block-${blockIndex}`}>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );
    render(
      <CardDeckView
        streamGroups={streamGroups}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );
    expect(screen.getByTestId('card-w1-block-0')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Complete'));
    expect(screen.getByTestId('card-w1-block-1')).toBeInTheDocument();
  });

  it('passes reinforcement semantics explicitly instead of inferring them from position', async () => {
    const renderCard = vi.fn((
      word: NormalizedWord,
      _blockIndex: number,
      onComplete: (afterExit?: () => void) => void,
      options?: { reinforcement?: boolean },
    ) => (
      <button onClick={() => onComplete()}>
        {word.id}:{String(options?.reinforcement)}
      </button>
    ));
    render(
      <CardDeckView
        streamGroups={[
          { key: 'review-0', kind: 'review', blockIndex: 0, items: [makeWord('old')] },
          {
            key: 'review-1', kind: 'review', blockIndex: 1,
            reinforcement: true, items: [makeWord('fresh')],
          },
        ]}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );

    expect(screen.getByRole('button')).toHaveTextContent('old:false');
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('fresh:true');
  });

  // Same root cause seen from the card's side: the repeat is a fresh round, so
  // it must not inherit the state the first appearance left behind.
  it('remounts the card when a later block repeats the same word', async () => {
    const repeated = makeWord('w1');
    const streamGroups = [
      { key: 'new-0', kind: 'new' as const, blockIndex: 0, items: [repeated] },
      { key: 'review-1', kind: 'review' as const, blockIndex: 1, items: [repeated] },
    ];
    const mounts: number[] = [];
    function Card({ blockIndex, onComplete }: { blockIndex: number; onComplete: () => void }) {
      const [taps, setTaps] = useState(0);
      useEffect(() => { mounts.push(blockIndex); }, [blockIndex]);
      return (
        <div>
          <span data-testid="taps">{taps}</span>
          <button onClick={() => setTaps((value) => value + 1)}>Tap</button>
          <button onClick={onComplete}>Complete</button>
        </div>
      );
    }
    render(
      <CardDeckView
        streamGroups={streamGroups}
        renderCard={(_word, blockIndex, onComplete) => (
          <Card blockIndex={blockIndex} onComplete={() => onComplete()} />
        )}
        renderMiniGame={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText('Tap'));
    expect(screen.getByTestId('taps')).toHaveTextContent('1');
    await userEvent.click(screen.getByText('Complete'));
    expect(mounts).toEqual([0, 1]);
    expect(screen.getByTestId('taps')).toHaveTextContent('0');
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

  it('mounts and focuses the next typing card during the minigame dismiss action', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const renderMiniGame = (_: MiniGameConfig, onComplete: () => void) => (
        <button onClick={onComplete}>Finish game</button>
      );

      render(
        <CardDeckView
          groupedWords={[[makeGame('g1'), makeWord('w1')]]}
          renderCard={() => <input aria-label="Typing answer" autoFocus />}
          renderMiniGame={renderMiniGame}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Finish game' }));

      expect(screen.getByRole('textbox', { name: 'Typing answer' })).toHaveFocus();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('can mount and focus the next word during the current Continue action', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const renderCard = (
        word: NormalizedWord,
        _: number,
        onComplete: (
          afterExit?: () => void,
          options?: { skipAnimation?: boolean },
        ) => void,
      ) => word.id === 'w1' ? (
        <button onClick={() => onComplete(undefined, { skipAnimation: true })}>
          Continue typing
        </button>
      ) : (
        <input aria-label="Next typing answer" autoFocus />
      );

      render(
        <CardDeckView
          groupedWords={[[makeWord('w1'), makeWord('w2')]]}
          renderCard={renderCard}
          renderMiniGame={vi.fn()}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Continue typing' }));

      expect(screen.getByRole('textbox', { name: 'Next typing answer' })).toHaveFocus();
    } finally {
      vi.unstubAllEnvs();
    }
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
    expect(screen.getByText(/nothing due right now/i)).toBeInTheDocument();
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
    expect(screen.queryByText(/nothing due right now/i)).not.toBeInTheDocument();
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
        expect(onWordCardCompleted).not.toHaveBeenCalled();

        const animating = container.querySelector('[class*="animate-deck-exit"]');
        fireExitAnimationEnd(animating!);
        expect(onWordCardCompleted).toHaveBeenCalledTimes(1);
        // Only advanced one card, not two.
        expect(screen.getByTestId('card-w2')).toBeInTheDocument();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('reports completion only after the SRS outcome has been committed', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const outcome = vi.fn();
      const onWordCardCompleted = vi.fn();
      try {
        const { container } = render(
          <CardDeckView
            groupedWords={[[makeWord('w1'), makeWord('w2')]]}
            onWordCardCompleted={onWordCardCompleted}
            renderCard={(word, _index, onComplete) => (
              <button onClick={() => onComplete(outcome)}>{word.id}</button>
            )}
            renderMiniGame={vi.fn()}
          />,
        );

        fireEvent.click(screen.getByText('w1'));
        expect(outcome).not.toHaveBeenCalled();
        expect(onWordCardCompleted).not.toHaveBeenCalled();

        fireExitAnimationEnd(container.querySelector('[class*="animate-deck-exit"]')!);
        expect(outcome).toHaveBeenCalledTimes(1);
        expect(onWordCardCompleted).toHaveBeenCalledTimes(1);
        expect(outcome.mock.invocationCallOrder[0])
          .toBeLessThan(onWordCardCompleted.mock.invocationCallOrder[0]);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('animates the final card directly into the done state', () => {
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
        const animating = container.querySelector('[class*="animate-deck-exit"]');
        expect(animating).not.toBeNull();
        expect(screen.getByTestId('card-w1')).toBeInTheDocument();
        expect(screen.queryByText(/tap to continue/i)).not.toBeInTheDocument();

        fireExitAnimationEnd(animating!);
        expect(screen.getByText(/nothing due right now/i)).toBeInTheDocument();
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
        vi.unstubAllEnvs();
      }
    });
  });

  describe('swipe to answer (frontier feature)', () => {
    const makeSwipeActions = (stageIndex = 0) => ({
      markKnown: vi.fn(),
      markUnknown: vi.fn(),
      markFullyKnown: vi.fn(),
      getStageIndex: vi.fn(() => stageIndex),
    });

    const swipeRenderCard = (
      word: NormalizedWord,
      _: number,
      onComplete: (afterExit?: () => void) => void,
    ) => (
      <div>
        <span data-testid={`card-${word.id}`}>{word.id}</span>
        <button onClick={() => onComplete()}>Complete</button>
      </div>
    );

    const getDeckItem = (container: HTMLElement) =>
      container.querySelector('.card-deck-item') as HTMLElement;

    it('renders the direction badges only when swipe actions are provided', () => {
      const { container, rerender } = render(
        <CardDeckView
          groupedWords={[[makeWord('w1')]]}
          renderCard={swipeRenderCard}
          renderMiniGame={vi.fn()}
        />
      );
      expect(container.querySelector('[aria-hidden="true"]')).toBeNull();

      rerender(
        <CardDeckView
          groupedWords={[[makeWord('w1')]]}
          swipeActions={makeSwipeActions()}
          renderCard={swipeRenderCard}
          renderMiniGame={vi.fn()}
        />
      );
      // Stage 0 word: right swipe schedules stage 1 (5 minutes), up marks as
      // fully known/no repeat, left stays at stage 0 (due now). Neutral labels,
      // no right/wrong verdict.
      expect(screen.getByText('↺ 5 minutes')).toBeInTheDocument();
      expect(screen.getByText('Fully known - no repeat')).toBeInTheDocument();
      expect(screen.getByText('↺ now')).toBeInTheDocument();
    });

    it('shows the neighbouring stage intervals for a mid-stage word', () => {
      const swipeActions = makeSwipeActions(3);
      render(
        <CardDeckView
          groupedWords={[[makeWord('w1')]]}
          swipeActions={swipeActions}
          renderCard={swipeRenderCard}
          renderMiniGame={vi.fn()}
        />
      );
      // Stage 3 word: right -> stage 4 (7 days), up -> fully known/no repeat,
      // left -> stage 2 (1 day).
      expect(swipeActions.getStageIndex).toHaveBeenCalledWith('w1');
      expect(screen.getByText('↺ 7 days')).toBeInTheDocument();
      expect(screen.getByText('Fully known - no repeat')).toBeInTheDocument();
      expect(screen.getByText('↺ 1 day')).toBeInTheDocument();
    });

    it('does not render badges or swipe touch handling on minigame cards', () => {
      const renderMiniGame = (config: MiniGameConfig) => (
        <div data-testid={`game-${config.id}`} />
      );
      const { container } = render(
        <CardDeckView
          groupedWords={[[makeGame('g1')]]}
          swipeActions={makeSwipeActions()}
          renderCard={vi.fn()}
          renderMiniGame={renderMiniGame}
        />
      );
      expect(screen.queryByText(/↺/)).not.toBeInTheDocument();
      expect(getDeckItem(container).className).not.toContain('touch-none');
    });

    it('marks the word known exactly once and advances on a right swipe', () => {
      const swipeActions = makeSwipeActions();
      const { container } = render(
        <CardDeckView
          groupedWords={[[makeWord('w1'), makeWord('w2')]]}
          swipeActions={swipeActions}
          renderCard={swipeRenderCard}
          renderMiniGame={vi.fn()}
        />
      );
      swipeRight(getDeckItem(container));
      expect(swipeActions.markKnown).toHaveBeenCalledTimes(1);
      expect(swipeActions.markKnown).toHaveBeenCalledWith('w1');
      expect(swipeActions.markUnknown).not.toHaveBeenCalled();
      expect(swipeActions.markFullyKnown).not.toHaveBeenCalled();
      expect(screen.getByTestId('card-w2')).toBeInTheDocument();
    });

    it('marks the word forgotten on a left swipe', () => {
      const swipeActions = makeSwipeActions();
      const { container } = render(
        <CardDeckView
          groupedWords={[[makeWord('w1'), makeWord('w2')]]}
          swipeActions={swipeActions}
          renderCard={swipeRenderCard}
          renderMiniGame={vi.fn()}
        />
      );
      swipeLeft(getDeckItem(container));
      expect(swipeActions.markUnknown).toHaveBeenCalledTimes(1);
      expect(swipeActions.markUnknown).toHaveBeenCalledWith('w1');
      expect(swipeActions.markKnown).not.toHaveBeenCalled();
      expect(swipeActions.markFullyKnown).not.toHaveBeenCalled();
      expect(screen.getByTestId('card-w2')).toBeInTheDocument();
    });

    it('marks the word fully known on an up swipe', () => {
      const swipeActions = makeSwipeActions();
      const { container } = render(
        <CardDeckView
          groupedWords={[[makeWord('w1'), makeWord('w2')]]}
          swipeActions={swipeActions}
          renderCard={swipeRenderCard}
          renderMiniGame={vi.fn()}
        />
      );
      swipeUp(getDeckItem(container));
      expect(swipeActions.markFullyKnown).toHaveBeenCalledTimes(1);
      expect(swipeActions.markFullyKnown).toHaveBeenCalledWith('w1');
      expect(swipeActions.markKnown).not.toHaveBeenCalled();
      expect(swipeActions.markUnknown).not.toHaveBeenCalled();
      expect(screen.getByTestId('card-w2')).toBeInTheDocument();
    });

    it('can disable horizontal grading while retaining the up-swipe action', () => {
      const swipeActions = makeSwipeActions();
      const { container } = render(
        <CardDeckView
          groupedWords={[[makeWord('w1'), makeWord('w2')]]}
          swipeActions={swipeActions}
          allowHorizontalSwipe={false}
          renderCard={swipeRenderCard}
          renderMiniGame={vi.fn()}
        />
      );
      const deckItem = getDeckItem(container);

      expect(screen.queryByText('↺ 5 minutes')).not.toBeInTheDocument();
      expect(screen.queryByText('↺ now')).not.toBeInTheDocument();
      expect(screen.getByText('Fully known - no repeat')).toBeInTheDocument();

      swipeRight(deckItem);
      swipeLeft(deckItem);
      expect(swipeActions.markKnown).not.toHaveBeenCalled();
      expect(swipeActions.markUnknown).not.toHaveBeenCalled();
      expect(screen.getByTestId('card-w1')).toBeInTheDocument();

      swipeUp(deckItem);
      expect(swipeActions.markFullyKnown).toHaveBeenCalledWith('w1');
      expect(screen.getByTestId('card-w2')).toBeInTheDocument();
    });

    it('does not mark anything on a sub-threshold drag', () => {
      const swipeActions = makeSwipeActions();
      const { container } = render(
        <CardDeckView
          groupedWords={[[makeWord('w1'), makeWord('w2')]]}
          swipeActions={swipeActions}
          renderCard={swipeRenderCard}
          renderMiniGame={vi.fn()}
        />
      );
      const deckItem = getDeckItem(container);
      firePointer(deckItem, 'pointerdown', { clientX: 100, clientY: 200, timeStamp: 1000 });
      firePointer(window, 'pointermove', { clientX: 130, clientY: 202, timeStamp: 1050 });
      firePointer(window, 'pointerup', { clientX: 150, clientY: 202, timeStamp: 1100 });
      expect(swipeActions.markKnown).not.toHaveBeenCalled();
      expect(swipeActions.markUnknown).not.toHaveBeenCalled();
      expect(swipeActions.markFullyKnown).not.toHaveBeenCalled();
      expect(screen.getByTestId('card-w1')).toBeInTheDocument();
    });

    it('does not start a swipe from the card buttons', () => {
      const swipeActions = makeSwipeActions();
      const { container } = render(
        <CardDeckView
          groupedWords={[[makeWord('w1'), makeWord('w2')]]}
          swipeActions={swipeActions}
          renderCard={swipeRenderCard}
          renderMiniGame={vi.fn()}
        />
      );
      swipeRight(screen.getByText('Complete'));
      expect(swipeActions.markKnown).not.toHaveBeenCalled();
      expect(screen.getByTestId('card-w1')).toBeInTheDocument();
      expect(getDeckItem(container).style.transform).toBe('');
    });

    it('uses the dedicated swipe exit animation and defers the mark to animationend', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const swipeActions = makeSwipeActions();
      try {
        const { container } = render(
          <CardDeckView
            groupedWords={[[makeWord('w1'), makeWord('w2')]]}
            swipeActions={swipeActions}
            renderCard={swipeRenderCard}
            renderMiniGame={vi.fn()}
          />
        );
        swipeRight(getDeckItem(container));
        const animating = container.querySelector('.animate-deck-exit-swipe');
        expect(animating).not.toBeNull();
        expect(swipeActions.markKnown).not.toHaveBeenCalled();

        const event = new Event('animationend', { bubbles: true });
        Object.defineProperty(event, 'animationName', { value: 'deck-exit-swipe' });
        fireEvent(animating!, event);

        expect(swipeActions.markKnown).toHaveBeenCalledTimes(1);
        expect(swipeActions.markKnown).toHaveBeenCalledWith('w1');
        expect(screen.getByTestId('card-w2')).toBeInTheDocument();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('marks the last card exactly once after its exit animation', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const swipeActions = makeSwipeActions();
      try {
        const { container } = render(
          <CardDeckView
            groupedWords={[[makeWord('w1')]]}
            swipeActions={swipeActions}
            renderCard={swipeRenderCard}
            renderMiniGame={vi.fn()}
          />
        );
        swipeRight(getDeckItem(container));
        expect(swipeActions.markKnown).not.toHaveBeenCalled();
        expect(screen.getByTestId('card-w1')).toBeInTheDocument();
        const animating = container.querySelector('.animate-deck-exit-swipe');
        expect(animating).not.toBeNull();
        expect(screen.queryByText(/tap to continue/i)).not.toBeInTheDocument();

        const event = new Event('animationend', { bubbles: true });
        Object.defineProperty(event, 'animationName', { value: 'deck-exit-swipe' });
        fireEvent(animating!, event);
        expect(swipeActions.markKnown).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/nothing due right now/i)).toBeInTheDocument();
      } finally {
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
    expect(screen.getByText(/nothing due right now/i)).toBeInTheDocument();

    rerender(
      <CardDeckView
        groupedWords={[[makeWord('w2')]]}
        renderCard={renderCard}
        renderMiniGame={vi.fn()}
      />
    );

    expect(screen.getByTestId('card-w2')).toBeInTheDocument();
    expect(screen.queryByText(/nothing due right now/i)).not.toBeInTheDocument();
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
