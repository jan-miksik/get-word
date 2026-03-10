'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import type { AnimationEvent, ReactNode } from 'react';
import type { NormalizedWord } from '@/lib/words';
import type { MiniGameConfig } from '@/lib/minigames';

type StreamItem = NormalizedWord | MiniGameConfig;

const EXIT_ANIMATIONS = [
  'animate-deck-exit-slide',
  'animate-deck-exit-swipe-up',
  'animate-deck-exit-flip',
  'animate-deck-exit-scale',
  'animate-deck-exit-rotate',
  'animate-deck-exit-dissolve',
  'animate-deck-exit-beam',
] as const;

const ENTER_ANIMATIONS = [
  'animate-deck-enter-slide',
  'animate-deck-enter-rise',
  'animate-deck-enter-pop',
  'animate-deck-enter-drop',
  'animate-deck-enter-unfurl',
] as const;

function randomExitAnim(): string {
  return EXIT_ANIMATIONS[Math.floor(Math.random() * EXIT_ANIMATIONS.length)];
}

function randomEnterAnim(): string {
  return ENTER_ANIMATIONS[Math.floor(Math.random() * ENTER_ANIMATIONS.length)];
}

interface CardDeckViewProps {
  groupedWords: (NormalizedWord | MiniGameConfig)[][];
  renderCard: (word: NormalizedWord, stageIndex: number, onComplete: () => void) => ReactNode;
  renderMiniGame: (config: MiniGameConfig, onComplete: () => void) => ReactNode;
}

export function CardDeckView({ groupedWords, renderCard, renderMiniGame }: CardDeckViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exitAnim, setExitAnim] = useState<string | null>(null);
  const [enterAnim, setEnterAnim] = useState<string | null>(null);
  // When the last card completes we show an overlay instead of jumping straight
  // to "All done!" — the user taps the overlay to confirm.
  const [showDoneOverlay, setShowDoneOverlay] = useState(false);

  const items: StreamItem[] = useMemo(() => groupedWords.flat(), [groupedWords]);

  // Keep a snapshot of the last successfully rendered item so we can still
  // show it after items[] shrinks (words are removed from the queue once marked).
  const lastItemRef = useRef<StreamItem | null>(null);

  // Store latest values in refs so the advance callback always reads fresh state,
  // even when called from a stale closure captured during an earlier render.
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const advance = useCallback((opts?: { skipAnimation?: boolean }) => {
    const idx = currentIndexRef.current;
    const currentItems = itemsRef.current;
    const last = currentItems.length > 0 ? currentItems.length - 1 : -1;
    const skip = opts?.skipAnimation ?? false;

    if (process.env.NODE_ENV === 'test' || skip) {
      setCurrentIndex((i) => i + 1);
      return;
    }

    if (last >= 0 && idx >= last) {
      const currentItem = currentItems[idx];
      const isMinigame = currentItem && '_isMinigame' in currentItem;
      if (!isMinigame) {
        setShowDoneOverlay(true);
        return;
      }
    }

    setExitAnim(randomExitAnim());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnimationEnd = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    if (!e.animationName.startsWith('deck-exit-')) return;
    setExitAnim(null);
    setCurrentIndex((i) => i + 1);
    setEnterAnim(randomEnterAnim());
  }, []);

  const handleEnterAnimationEnd = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    if (!e.animationName.startsWith('deck-enter-')) return;
    setEnterAnim(null);
  }, []);

  const isDone = items.length === 0 || currentIndex >= items.length;

  if (isDone && !showDoneOverlay) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-2xl font-semibold opacity-60">All done!</p>
      </div>
    );
  }

  // Use the current item if available, otherwise fall back to the last known item.
  const item = items[currentIndex] ?? lastItemRef.current;

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-2xl font-semibold opacity-60">All done!</p>
      </div>
    );
  }

  // Keep the ref up to date while we have a valid item.
  lastItemRef.current = item;

  // Determine stageIndex from which group currentIndex falls into
  let stageIndex = 0;
  let count = 0;
  for (let g = 0; g < groupedWords.length; g++) {
    count += groupedWords[g].length;
    if (currentIndex < count) { stageIndex = g; break; }
  }

  const isMinigame = '_isMinigame' in item;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div
        className={[
          'flex h-full w-full flex-col',
          exitAnim ?? '',
          enterAnim ?? '',
        ].join(' ')}
        onAnimationEnd={exitAnim ? handleAnimationEnd : enterAnim ? handleEnterAnimationEnd : undefined}
      >
        {isMinigame
          ? renderMiniGame(item as MiniGameConfig, () => advance())
          : renderCard(item as NormalizedWord, stageIndex, advance)}
      </div>

      {/* Overlay shown after the last card completes — waits for an explicit tap */}
      {showDoneOverlay && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-end cursor-pointer"
          onClick={() => {
            setShowDoneOverlay(false);
            setExitAnim(randomExitAnim());
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setShowDoneOverlay(false);
              setExitAnim(randomExitAnim());
            }
          }}
        >
          <div
            className="flex items-center justify-center w-full px-4 py-4 rounded-b-xl"
            style={{ animation: 'deck-done-slide 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}
          >
            <span className="text-sm" style={{ color: '#a7a7a7' }}>Tap to continue</span>
          </div>
          <style>{`
            @keyframes deck-done-slide {
              0% { opacity: 0; transform: translateY(8px); }
              100% { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
