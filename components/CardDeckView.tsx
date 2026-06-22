'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { AnimationEvent, ReactNode } from 'react';
import type { NormalizedWord } from '@/lib/words';
import type { MiniGameConfig } from '@/lib/minigames';
import { checkAudioUrlAvailable } from '@/lib/audio-availability';
import { prefetchAudio } from '@/lib/audio-prefetch';
import {
  getAudioWarmupLookahead,
  subscribeAudioNetworkChanges,
} from '@/lib/audio-network-policy';
import { getWordAudioSrcBySide, type WordSide } from './games/types';
import { useI18n } from '@/components/I18nProvider';

type StreamItem = NormalizedWord | MiniGameConfig;

const EXIT_ANIMATIONS = [
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

// Safety net: the deck advances when the exit animation fires `animationend`.
// That event can silently never fire (e.g. the app is backgrounded mid-animation
// on mobile, or the animation is interrupted), which would otherwise leave the
// deck frozen — the card stays put and OK/forgotten become no-ops. Exit anims run
// 0.35–0.45s, so if no `animationend` arrives within this window we force the
// advance ourselves and log a warning so the stall is visible.
const EXIT_FALLBACK_MS = 1000;

function randomExitAnim(): string {
  return EXIT_ANIMATIONS[Math.floor(Math.random() * EXIT_ANIMATIONS.length)];
}

function randomEnterAnim(): string {
  return ENTER_ANIMATIONS[Math.floor(Math.random() * ENTER_ANIMATIONS.length)];
}

function getAudioUrlsForWord(word: NormalizedWord): string[] {
  return (['from', 'to'] as const satisfies readonly WordSide[])
    .map((side) => getWordAudioSrcBySide(word, side))
    .filter((url): url is string => Boolean(url));
}

function getAudioUrlsForItem(item: StreamItem): string[] {
  const words = '_isMinigame' in item ? item.words : [item];
  return Array.from(new Set(words.flatMap(getAudioUrlsForWord)));
}

function getStreamItemKey(item: StreamItem): string {
  return '_isMinigame' in item ? `minigame-${item.id}` : `word-${item.id}`;
}

interface CardDeckViewProps {
  groupedWords: (NormalizedWord | MiniGameConfig)[][];
  interstitialCard?: ReactNode | null;
  onWordCardCompleted?: (word: NormalizedWord) => void;
  renderCard: (
    word: NormalizedWord,
    stageIndex: number,
    onComplete: (afterExit?: () => void) => void,
    opts?: { isExiting: boolean }
  ) => ReactNode;
  renderMiniGame: (config: MiniGameConfig, onComplete: () => void) => ReactNode;
}

export function CardDeckView({
  groupedWords,
  interstitialCard = null,
  onWordCardCompleted,
  renderCard,
  renderMiniGame,
}: CardDeckViewProps) {
  const { t } = useI18n();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exitAnim, setExitAnim] = useState<string | null>(null);
  const [enterAnim, setEnterAnim] = useState<string | null>(null);
  const [audioNetworkRevision, setAudioNetworkRevision] = useState(0);
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
  // True while an exit animation is in flight. Guards against re-entrant advance
  // calls (double taps) and lets the fallback timer know there's something to
  // recover.
  const isExitingRef = useRef(false);
  const exitFallbackTimerRef = useRef<number | null>(null);
  // Completed items are skipped while they remain in the live queue. Once an
  // item leaves the queue its key is released, allowing the same word to return
  // later when its next repetition becomes due.
  const completedItemKeysRef = useRef<Set<string>>(new Set());

  // Store latest values in refs so the advance callback always reads fresh state,
  // even when called from a stale closure captured during an earlier render.
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const groupedWordsRef = useRef(groupedWords);
  groupedWordsRef.current = groupedWords;

  useEffect(() => {
    // The final-card confirmation deliberately keeps showing the completed card
    // even if the live queue removes it immediately after its review is saved.
    if (showDoneOverlay) return;

    const availableKeys = new Set(items.map(getStreamItemKey));
    for (const key of completedItemKeysRef.current) {
      if (!availableKeys.has(key)) completedItemKeysRef.current.delete(key);
    }

    if (isExitingRef.current) return;
    const visibleKey = lastItemRef.current ? getStreamItemKey(lastItemRef.current) : null;
    const visibleIndex = visibleKey
      ? items.findIndex((candidate) => getStreamItemKey(candidate) === visibleKey)
      : -1;
    if (visibleIndex >= 0 && !completedItemKeysRef.current.has(visibleKey!)) {
      setCurrentIndex(visibleIndex);
      return;
    }

    const nextIndex = items.findIndex(
      (candidate) => !completedItemKeysRef.current.has(getStreamItemKey(candidate)),
    );
    setCurrentIndex(nextIndex >= 0 ? nextIndex : items.length);
    lastItemRef.current = nextIndex >= 0 ? items[nextIndex] : null;
    setShowDoneOverlay(false);
  }, [items, showDoneOverlay]);

  // Clear any pending fallback timer on unmount.
  useEffect(() => () => {
    if (exitFallbackTimerRef.current !== null) {
      window.clearTimeout(exitFallbackTimerRef.current);
      exitFallbackTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!interstitialCard) return;
    setShowDoneOverlay(false);
  }, [interstitialCard]);

  useEffect(() => {
    return subscribeAudioNetworkChanges(() => setAudioNetworkRevision((revision) => revision + 1));
  }, []);

  useEffect(() => {
    const lookahead = getAudioWarmupLookahead(AUDIO_LOOKAHEAD_CARDS);
    if (lookahead < 0) return;

    const lookaheadItems = items.slice(currentIndex, currentIndex + lookahead + 1);
    const audioUrls = Array.from(new Set(lookaheadItems.flatMap(getAudioUrlsForItem)));
    if (audioUrls.length === 0) return;

    let cancelled = false;

    void (async () => {
      const availability = await Promise.all(
        audioUrls.map(async (url) => ({
          url,
          ok: await checkAudioUrlAvailable(url),
        })),
      );

      if (cancelled) return;
      prefetchAudio(availability.filter((entry) => entry.ok).map((entry) => entry.url));
    })();

    return () => {
      cancelled = true;
    };
  }, [items, currentIndex, audioNetworkRevision]);

  // Completes an in-flight exit: clears the animation/lock, runs the pending
  // afterExit (e.g. markKnown), advances to the next card, and starts the enter
  // animation. Called both by the real `animationend` handler and the fallback
  // timer, so it must be idempotent — `isExitingRef` makes a second call a no-op.
  const finishExit = useCallback(() => {
    if (!isExitingRef.current) return;
    isExitingRef.current = false;
    if (exitFallbackTimerRef.current !== null) {
      window.clearTimeout(exitFallbackTimerRef.current);
      exitFallbackTimerRef.current = null;
    }
    setExitAnim(null);
    lockedItemRef.current = null;
    if (pendingAfterExitRef.current) {
      pendingAfterExitRef.current();
      pendingAfterExitRef.current = null;
    }
    const currentItems = itemsRef.current;
    const nextIndex = currentItems.findIndex(
      (candidate) => !completedItemKeysRef.current.has(getStreamItemKey(candidate)),
    );
    setCurrentIndex(nextIndex >= 0 ? nextIndex : currentItems.length);
    lastItemRef.current = nextIndex >= 0 ? currentItems[nextIndex] : null;
    setEnterAnim(randomEnterAnim());
  }, []);

  // Starts an exit animation and arms the fallback timer that recovers the deck
  // if `animationend` never arrives.
  const beginExit = useCallback(() => {
    isExitingRef.current = true;
    setExitAnim(randomExitAnim());
    if (exitFallbackTimerRef.current !== null) {
      window.clearTimeout(exitFallbackTimerRef.current);
    }
    exitFallbackTimerRef.current = window.setTimeout(() => {
      exitFallbackTimerRef.current = null;
      console.warn(
        '[CardDeckView] exit animation did not fire animationend within ' +
          `${EXIT_FALLBACK_MS}ms — forcing advance to avoid a frozen deck`,
      );
      finishExit();
    }, EXIT_FALLBACK_MS);
  }, [finishExit]);

  const advance = useCallback((opts?: { skipAnimation?: boolean; afterExit?: () => void }) => {
    const idx = currentIndexRef.current;
    const currentItems = itemsRef.current;
    const last = currentItems.length > 0 ? currentItems.length - 1 : -1;
    const skip = opts?.skipAnimation ?? false;
    // Ignore taps while an exit animation is already running — otherwise a second
    // tap overwrites the pending callback and can re-pick the same animation
    // class (which React won't restart), stalling the deck.
    if (isExitingRef.current && !skip && process.env.NODE_ENV !== 'test') return;
    if (opts?.afterExit) pendingAfterExitRef.current = opts.afterExit;
    const currentItem = currentItems[idx] ?? lastItemRef.current;
    const isMinigame = currentItem ? '_isMinigame' in currentItem : false;

    if (currentItem) completedItemKeysRef.current.add(getStreamItemKey(currentItem));

    if (currentItem && !isMinigame) {
      onWordCardCompleted?.(currentItem as NormalizedWord);
    }

    if (process.env.NODE_ENV === 'test' || skip) {
      if (pendingAfterExitRef.current) {
        pendingAfterExitRef.current();
        pendingAfterExitRef.current = null;
      }
      const nextIndex = currentItems.findIndex(
        (candidate) => !completedItemKeysRef.current.has(getStreamItemKey(candidate)),
      );
      setCurrentIndex(nextIndex >= 0 ? nextIndex : currentItems.length);
      lastItemRef.current = nextIndex >= 0 ? currentItems[nextIndex] : null;
      return;
    }

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

    const hasAnotherItem = currentItems.some(
      (candidate) => !completedItemKeysRef.current.has(getStreamItemKey(candidate)),
    );
    if (last >= 0 && !hasAnotherItem) {
      if (!isMinigame) {
        setShowDoneOverlay(true);
        if (pendingAfterExitRef.current) {
          pendingAfterExitRef.current();
          pendingAfterExitRef.current = null;
        }
        return;
      }
    }

    beginExit();
  }, [onWordCardCompleted, beginExit]);

  const handleAnimationEnd = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    // `animationend` bubbles, so ignore inner (reveal/entrance) animations.
    if (!e.animationName.startsWith('deck-exit-')) return;
    finishExit();
  }, [finishExit]);

  const handleEnterAnimationEnd = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    if (!e.animationName.startsWith('deck-enter-')) return;
    setEnterAnim(null);
  }, []);

  const pinnedItemIndex = !exitAnim && lastItemRef.current
    ? items.findIndex(
        (candidate) => getStreamItemKey(candidate) === getStreamItemKey(lastItemRef.current!),
      )
    : -1;
  const effectiveCurrentIndex = pinnedItemIndex >= 0 ? pinnedItemIndex : currentIndex;
  currentIndexRef.current = effectiveCurrentIndex;
  const isDone = items.length === 0 || effectiveCurrentIndex >= items.length;

  if (interstitialCard) {
    return (
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        {interstitialCard}
      </div>
    );
  }

  if (isDone && !showDoneOverlay) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-2xl font-semibold opacity-60">{t('card.allDone')}</p>
      </div>
    );
  }

  // Use the current item if available, otherwise fall back to the last known item.
  const item = exitAnim
    ? lockedItemRef.current
    : items[effectiveCurrentIndex] ?? lastItemRef.current;

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-2xl font-semibold opacity-60">{t('card.allDone')}</p>
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
      if (effectiveCurrentIndex < count) { stageIndex = g; break; }
    }
  }

  const isMinigame = '_isMinigame' in item;
  const itemKey = getStreamItemKey(item);
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
            beginExit();
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setShowDoneOverlay(false);
              beginExit();
            }
          }}
        >
          <div
            className="flex items-center justify-center w-full px-4 py-4 rounded-b-xl max-sm:rounded-b-none"
            style={{ animation: 'deck-done-slide 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}
          >
            <span className="text-sm text-text font-medium">{t('card.tapToContinue')}</span>
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
