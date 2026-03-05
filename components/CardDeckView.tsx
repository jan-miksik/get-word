'use client';

import { useState, useCallback } from 'react';
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
] as const;

const ENTER_ANIMATIONS = [
  'animate-deck-enter-slide',
  'animate-deck-enter-rise',
  'animate-deck-enter-pop',
  'animate-deck-enter-drop',
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
  const [awaitingFinalClick, setAwaitingFinalClick] = useState(false);

  const items: StreamItem[] = groupedWords.flat();
  const lastIndex = items.length > 0 ? items.length - 1 : -1;

  const advance = useCallback(() => {
    // If we're on the last card, require a second explicit click/tap
    // before actually advancing away from it. This keeps the final
    // card visible until the user confirms by clicking again.
    if (lastIndex >= 0 && currentIndex >= lastIndex) {
      if (!awaitingFinalClick) {
        setAwaitingFinalClick(true);
        return;
      }
      setAwaitingFinalClick(false);
    }

    if (process.env.NODE_ENV === 'test') {
      setCurrentIndex((i) => i + 1);
      return;
    }
    setExitAnim(randomExitAnim());
  }, [awaitingFinalClick, currentIndex, lastIndex]);

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

  if (items.length === 0 || currentIndex >= items.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-2xl font-semibold opacity-60">All done!</p>
      </div>
    );
  }

  const item = items[currentIndex];

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
          ? renderMiniGame(item as MiniGameConfig, advance)
          : renderCard(item as NormalizedWord, stageIndex, advance)}
      </div>
    </div>
  );
}
