'use client';

import { useState } from 'react';
import type { MiniGameConfig } from '@/lib/minigames';
import { MultipleChoiceGame } from './games/MultipleChoiceGame';
import { TypingChallengeGame } from './games/TypingChallengeGame';
import { MatchingPairsGame } from './games/MatchingPairsGame';

interface Props {
  config: MiniGameConfig;
  role: 'cz' | 'vi';
  onDismiss: () => void;
  onResult?: (won: boolean) => void;
}

export function MiniGameCard({ config, role, onDismiss, onResult }: Props) {
  const [finished, setFinished] = useState<{ won: boolean } | null>(null);

  const handleResult = (won: boolean) => {
    onResult?.(won);
    setFinished({ won });
  };

  const gameProps = { words: config.words, role, onResult: handleResult };

  let game = null;
  if (config.gameType === 'multipleChoice') {
    game = <MultipleChoiceGame {...gameProps} />;
  } else if (config.gameType === 'typing') {
    game = <TypingChallengeGame {...gameProps} />;
  } else if (config.gameType === 'matching') {
    game = <MatchingPairsGame {...gameProps} />;
  }

  if (!game) return null;

  return (
    <div className="relative">
      {game}
      {finished && (
        <div
          className="absolute inset-0 z-10 flex flex-col justify-end cursor-pointer rounded-xl transition-opacity duration-300"
          onClick={onDismiss}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onDismiss(); }}
        >
          <div
            className="flex items-center justify-center px-4 py-3 rounded-b-xl bg-black/15"
            style={{ animation: 'overlay-slide 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}
          >
            <span className="text-sm text-white/70" style={{ color: '#a7a7a7' }} onClick={onDismiss}>Tap to continue</span>
          </div>
          <style>{`
            @keyframes overlay-slide {
              0% { opacity: 0; transform: translateY(6px); }
              100% { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
