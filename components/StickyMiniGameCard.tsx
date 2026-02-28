'use client';

import { useEffect } from 'react';
import type { MiniGameConfig } from '@/lib/minigames';
import { MiniGameCard } from './MiniGameCard';

interface Props {
  config: MiniGameConfig;
  role: 'cz' | 'vi';
  onDismiss: () => void;
  onResult?: (won: boolean) => void;
  /** Called exactly once when the card first mounts, so the anchor word can be pinned in the stream. */
  onFirstSeen: (config: MiniGameConfig) => void;
}

export function StickyMiniGameCard({ config, role, onDismiss, onResult, onFirstSeen }: Props) {
  useEffect(() => {
    onFirstSeen(config);
    // Only fire on first mount for this game id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.id]);

  return <MiniGameCard config={config} role={role} onDismiss={onDismiss} onResult={onResult} />;
}
