'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { AnimationEvent, ReactNode } from 'react';
import type { NormalizedWord } from '@/lib/words';
import type { MiniGameConfig } from '@/lib/minigames';
import { checkAudioUrlAvailable } from '@/lib/audio-availability';
import { prefetchAudio } from '@/lib/audio-prefetch';
import { getWordAudioSrcByLang, type SourceLang } from './games/types';

type StreamItem = NormalizedWord | MiniGameConfig;

const EXIT_ANIMATIONS = [
  'animate-deck-exit-slide',
  'animate-deck-exit-swipe-up',
  'animate-deck-exit-flip',
  'animate-deck-exit-scale',
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

const AUDIO_LOOKAHEAD_CARDS = 2;

function randomExitAnim(): string {
  return EXIT_ANIMATIONS[Math.floor(Math.random() * EXIT_ANIMATIONS.length)];
}

function randomEnterAnim(): string {
  return ENTER_ANIMATIONS[Math.floor(Math.random() * ENTER_ANIMATIONS.length)];
}

function getAudioUrlsForWord(word: NormalizedWord): string[] {
  return (['cz', 'vi'] as const satisfies readonly SourceLang[])
    .map((lang) => getWordAudioSrcByLang(word, lang))
    .filter((url): url is string => Boolean(url));
}

function getAudioUrlsForItem(item: StreamItem): string[] {
  const words = '_isMinigame' in item ? item.words : [item];
  return Array.from(new Set(words.flatMap(getAudioUrlsForWord)));
}

interface CardDeckViewProps {
  groupedWords: (NormalizedWord | MiniGameConfig)[][];
  renderCard: (
    word: NormalizedWord,
    stageIndex: number,
    onComplete: (afterExit?: () => void) => void,
    opts?: { isExiting: boolean }
  ) => ReactNode;
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
  // Lock the card being animated out so its content doesn't swap mid-animation
  // if the underlying item list changes after the word is marked.
  const lockedItemRef = useRef<StreamItem | null>(null);
  const lockedStageIndexRef = useRef<number>(0);
  const pendingAfterExitRef = useRef<(() => void) | null>(null);

  // Store latest values in refs so the advance callback always reads fresh state,
  // even when called from a stale closure captured during an earlier render.
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const groupedWordsRef = useRef(groupedWords);
  groupedWordsRef.current = groupedWords;

  useEffect(() => {
    setCurrentIndex(0);
    setExitAnim(null);
    setEnterAnim(null);
    setShowDoneOverlay(false);
    lastItemRef.current = null;
    lockedItemRef.current = null;
    lockedStageIndexRef.current = 0;
    pendingAfterExitRef.current = null;
  }, [groupedWords]);

  useEffect(() => {
    const lookaheadItems = items.slice(currentIndex, currentIndex + AUDIO_LOOKAHEAD_CARDS + 1);
    const audioUrls = Array.from(new Set(lookaheadItems.flatMap(getAudioUrlsForItem)));
    if (audioUrls.length === 0) return;

    prefetchAudio(audioUrls);
    void Promise.allSettled(audioUrls.map((url) => checkAudioUrlAvailable(url)));
  }, [items, currentIndex]);

  const advance = useCallback((opts?: { skipAnimation?: boolean; afterExit?: () => void }) => {
    const idx = currentIndexRef.current;
    const currentItems = itemsRef.current;
    const last = currentItems.length > 0 ? currentItems.length - 1 : -1;
    const skip = opts?.skipAnimation ?? false;
    if (opts?.afterExit) pendingAfterExitRef.current = opts.afterExit;

    if (process.env.NODE_ENV === 'test' || skip) {
      setCurrentIndex((i) => i + 1);
      if (pendingAfterExitRef.current) {
        pendingAfterExitRef.current();
        pendingAfterExitRef.current = null;
      }
      return;
    }

    if (last >= 0 && idx >= last) {
      const currentItem = currentItems[idx];
      const isMinigame = currentItem && '_isMinigame' in currentItem;
      if (!isMinigame) {
        setShowDoneOverlay(true);
        if (pendingAfterExitRef.current) {
          pendingAfterExitRef.current();
          pendingAfterExitRef.current = null;
        }
        return;
      }
    }

    const currentItem = currentItems[idx] ?? lastItemRef.current;
    if (currentItem) {
      lockedItemRef.current = currentItem;
      let lockedStage = 0;
      let count = 0;
      const grouped = groupedWordsRef.current;
      for (let g = 0; g < grouped.length; g++) {
        count += grouped[g].length;
        if (idx < count) { lockedStage = g; break; }
      }
      lockedStageIndexRef.current = lockedStage;
    }
    const nextExitAnim = randomExitAnim();
    console.log('[CardDeckView] card out animation:', nextExitAnim);
    setExitAnim(nextExitAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnimationEnd = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    if (!e.animationName.startsWith('deck-exit-')) return;
    setExitAnim(null);
    lockedItemRef.current = null;
    if (pendingAfterExitRef.current) {
      pendingAfterExitRef.current();
      pendingAfterExitRef.current = null;
    }
    setCurrentIndex((i) => i + 1);
    const nextEnterAnim = randomEnterAnim();
    console.log('[CardDeckView] card in animation:', nextEnterAnim);
    setEnterAnim(nextEnterAnim);
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
  const item = exitAnim
    ? lockedItemRef.current
    : items[currentIndex] ?? lastItemRef.current;

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
  if (exitAnim && lockedItemRef.current) {
    stageIndex = lockedStageIndexRef.current;
  } else {
    let count = 0;
    for (let g = 0; g < groupedWords.length; g++) {
      count += groupedWords[g].length;
      if (currentIndex < count) { stageIndex = g; break; }
    }
  }

  const isMinigame = '_isMinigame' in item;
  const itemKey = isMinigame
    ? `minigame-${(item as MiniGameConfig).id}`
    : `word-${(item as NormalizedWord).id}`;
  const isExiting = Boolean(exitAnim);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div
        key={itemKey}
        className={[
          'flex h-full w-full flex-col',
          exitAnim ?? '',
          enterAnim ?? '',
        ].join(' ')}
        onAnimationEnd={exitAnim ? handleAnimationEnd : enterAnim ? handleEnterAnimationEnd : undefined}
      >
        {isMinigame
          ? renderMiniGame(item as MiniGameConfig, () => advance())
          : renderCard(item as NormalizedWord, stageIndex, (afterExit) => advance({ afterExit }), { isExiting })}
      </div>

      {/* Overlay shown after the last card completes — waits for an explicit tap */}
      {showDoneOverlay && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-end cursor-pointer"
          onClick={() => {
            setShowDoneOverlay(false);
            const nextExitAnim = randomExitAnim();
            console.log('[CardDeckView] card out animation:', nextExitAnim);
            setExitAnim(nextExitAnim);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setShowDoneOverlay(false);
              const nextExitAnim = randomExitAnim();
              console.log('[CardDeckView] card out animation:', nextExitAnim);
              setExitAnim(nextExitAnim);
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
