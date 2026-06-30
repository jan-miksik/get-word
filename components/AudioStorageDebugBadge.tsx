'use client';

import { useEffect, useState } from 'react';
import {
  AUDIO_OBJECT_STORAGE_EVENT,
  type AudioObjectStorageEventDetail,
} from '@/lib/audio-debug';

const BADGE_HOLD_MS = 3000;
const BADGE_FADE_MS = 600;

export function AudioStorageDebugBadge() {
  const [mounted, setMounted] = useState(false);
  const [fading, setFading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    let fadeTimeoutId: number | null = null;
    let unmountTimeoutId: number | null = null;
    const clearTimers = () => {
      if (fadeTimeoutId !== null) window.clearTimeout(fadeTimeoutId);
      if (unmountTimeoutId !== null) window.clearTimeout(unmountTimeoutId);
      fadeTimeoutId = null;
      unmountTimeoutId = null;
    };
    const fadeLater = () => {
      clearTimers();
      fadeTimeoutId = window.setTimeout(() => {
        setFading(true);
        unmountTimeoutId = window.setTimeout(() => setMounted(false), BADGE_FADE_MS);
      }, BADGE_HOLD_MS);
    };

    const onObjectStorage = (event: Event) => {
      const detail = (event as CustomEvent<AudioObjectStorageEventDetail>).detail;
      setProvider(detail?.provider ?? null);
      setMounted(true);
      setFading(false);
      fadeLater();
    };

    window.addEventListener(AUDIO_OBJECT_STORAGE_EVENT, onObjectStorage);
    return () => {
      window.removeEventListener(AUDIO_OBJECT_STORAGE_EVENT, onObjectStorage);
      clearTimers();
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={`pointer-events-none fixed bottom-2 left-2 z-[450] rounded bg-black/55 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white/85 shadow-sm backdrop-blur transition-opacity duration-500 ${fading ? 'opacity-0' : 'opacity-100'}`}
    >
      {provider ? `using ${provider}` : 'object fallback'}
    </div>
  );
}
