'use client';

import type { MiniGameConfig } from '@/lib/minigames';
import { MultipleChoiceGame } from './games/MultipleChoiceGame';
import { TypingChallengeGame } from './games/TypingChallengeGame';
import { MatchingPairsGame } from './games/MatchingPairsGame';

interface Props {
  config: MiniGameConfig;
  role: 'cz' | 'vi';
  onDismiss: () => void;
}

export function MiniGameCard({ config, role, onDismiss }: Props) {
  if (config.gameType === 'multipleChoice') {
    return <MultipleChoiceGame words={config.words} role={role} onDismiss={onDismiss} />;
  }
  if (config.gameType === 'typing') {
    return <TypingChallengeGame words={config.words} role={role} onDismiss={onDismiss} />;
  }
  if (config.gameType === 'matching') {
    return <MatchingPairsGame words={config.words} role={role} onDismiss={onDismiss} />;
  }
  return null;
}
