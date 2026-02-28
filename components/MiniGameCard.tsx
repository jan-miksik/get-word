'use client';

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
  if (config.gameType === 'multipleChoice') {
    return <MultipleChoiceGame words={config.words} role={role} onDismiss={onDismiss} onResult={onResult} />;
  }
  if (config.gameType === 'typing') {
    return <TypingChallengeGame words={config.words} role={role} onDismiss={onDismiss} onResult={onResult} />;
  }
  if (config.gameType === 'matching') {
    return <MatchingPairsGame words={config.words} role={role} onDismiss={onDismiss} onResult={onResult} />;
  }
  return null;
}
