'use client';

import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { NormalizedWord } from '@/lib/words';
import type { MiniGameConfig } from '@/lib/minigames';

type StreamItem = NormalizedWord | MiniGameConfig;

const EXIT_ANIMATIONS = [
  'animate-deck-exit-slide',
  'animate-deck-exit-flip',
  'animate-deck-exit-scale',
  'animate-deck-exit-rotate',
] as const;

function randomExitAnim(): string {
  return EXIT_ANIMATIONS[Math.floor(Math.random() * EXIT_ANIMATIONS.length)];
}

interface CardDeckViewProps {
  groupedWords: (NormalizedWord | MiniGameConfig)[][];
  renderCard: (word: NormalizedWord, stageIndex: number, onComplete: () => void) => ReactNode;
  renderMiniGame: (config: MiniGameConfig, onComplete: () => void) => ReactNode;
}

export function CardDeckView({ groupedWords, renderCard, renderMiniGame }: CardDeckViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exitAnim, setExitAnim] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);

  const items: StreamItem[] = groupedWords.flat();

  const advance = useCallback(() => {
    if (process.env.NODE_ENV === 'test') {
      setCurrentIndex((i) => i + 1);
      return;
    }
    setExitAnim(randomExitAnim());
  }, []);

  const handleAnimationEnd = useCallback(() => {
    setExitAnim(null);
    setCurrentIndex((i) => i + 1);
    setEntering(true);
  }, []);

  const handleEnterAnimationEnd = useCallback(() => {
    setEntering(false);
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
          entering ? 'animate-deck-enter' : '',
        ].join(' ')}
        onAnimationEnd={exitAnim ? handleAnimationEnd : entering ? handleEnterAnimationEnd : undefined}
      >
        {isMinigame
          ? renderMiniGame(item as MiniGameConfig, advance)
          : renderCard(item as NormalizedWord, stageIndex, advance)}
      </div>
    </div>
  );
}
