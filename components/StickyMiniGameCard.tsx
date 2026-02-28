'use client';

import type { MiniGameConfig } from '@/lib/minigames';
import { MiniGameCard } from './MiniGameCard';

interface Props {
  config: MiniGameConfig;
  role: 'cz' | 'vi';
  onDismiss: () => void;
  onResult?: (won: boolean) => void;
}

export function StickyMiniGameCard({ config, role, onDismiss, onResult }: Props) {
  return <MiniGameCard config={config} role={role} onDismiss={onDismiss} onResult={onResult} />;
}
