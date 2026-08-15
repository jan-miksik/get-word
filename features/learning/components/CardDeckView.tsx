'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { AnimationEvent, CSSProperties, ReactNode } from 'react';
import { STAGES, type NormalizedWord } from '@/lib/words';
import type { MiniGameConfig } from '@/features/learning/minigames';
import { getPlayableAudioUrl } from '@/lib/audio-availability';
import { prefetchAudio } from '@/lib/audio-prefetch';
import {
  getAudioWarmupLookahead,
  subscribeAudioNetworkChanges,
} from '@/lib/audio-network-policy';
import { getWordAudioSrcBySide, type WordSide } from './games/types';
import { useI18n } from '@/components/I18nProvider';
import { formatInterval } from './word-card/helpers';
import { useSwipeGesture } from './card-deck/useSwipeGesture';

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

const AUDIO_LOOKAHEAD_CARDS = 1;

const SWIPE_BADGE_STYLE = {
  backgroundColor: '#1e6fa8',
  borderColor: '#1e6fa8',
  color: '#ffffff',
} satisfies CSSProperties;

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

export interface CardDeckSwipeActions {
  markKnown: (wordId: string) => void;
  markUnknown: (wordId: string) => void;
  /** Up-swipe: fully known, clears future repeats. */
  markFullyKnown: (wordId: string) => void;
  /** Current SRS stage of a word, used for the "repeat in X" badge labels. */
  getStageIndex: (wordId: string) => number;
}

interface CardDeckViewProps {
  groupedWords: (NormalizedWord | MiniGameConfig)[][];
  interstitialCard?: ReactNode | null;
  emptyState?: ReactNode | null;
  onWordCardCompleted?: (word: NormalizedWord) => void;
  /** When set, word cards can be swiped right = known / left = forgotten (frontier feature). */
  swipeActions?: CardDeckSwipeActions;
  /** False keeps only the upward fully-known gesture. */
  allowHorizontalSwipe?: boolean;
  renderCard: (
    word: NormalizedWord,
    stageIndex: number,
    onComplete: (
      afterExit?: () => void,
      options?: { skipAnimation?: boolean },
    ) => void,
    opts?: { isExiting: boolean }
  ) => ReactNode;
  renderMiniGame: (config: MiniGameConfig, onComplete: () => void) => ReactNode;
}

export function CardDeckView({
  groupedWords,
  interstitialCard = null,
  emptyState = null,
  onWordCardCompleted,
  swipeActions,
  allowHorizontalSwipe = true,
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
  const [lastItem, setLastItem] = useState<StreamItem | null>(null);
  const lastItemRef = useRef<StreamItem | null>(null);
  // Lock the card being animated out so its content doesn't swap mid-animation
  // if the underlying item list changes after the word is marked.
  const [lockedItem, setLockedItem] = useState<StreamItem | null>(null);
  const [lockedStageIndex, setLockedStageIndex] = useState(0);
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
  const itemsRef = useRef(items);
  const groupedWordsRef = useRef(groupedWords);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
    itemsRef.current = items;
    groupedWordsRef.current = groupedWords;
  }, [currentIndex, groupedWords, items]);

  const updateLastItem = useCallback((item: StreamItem | null) => {
    lastItemRef.current = item;
    setLastItem(item);
  }, []);

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
    updateLastItem(nextIndex >= 0 ? items[nextIndex] : null);
    setShowDoneOverlay(false);
  }, [items, showDoneOverlay, updateLastItem]);

  // Clear any pending fallback timer on unmount.
  useEffect(() => () => {
    if (exitFallbackTimerRef.current !== null) {
      window.clearTimeout(exitFallbackTimerRef.current);
      exitFallbackTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return subscribeAudioNetworkChanges(() => setAudioNetworkRevision((revision) => revision + 1));
  }, []);

  useEffect(() => {
    const lookahead = getAudioWarmupLookahead(AUDIO_LOOKAHEAD_CARDS);
    if (lookahead < 0) return;

    const lookaheadItems = items.slice(currentIndex, currentIndex + lookahead + 1);
    const audioUrls = Array.from(new Set(lookaheadItems.flatMap(getAudioUrlsForItem)));
    if (audioUrls.length === 0) return;

    // Start downloading immediately. Availability probing continues in the
    // background and also warms the actual working gateway when it differs.
    void prefetchAudio(audioUrls);
    void Promise.all(audioUrls.map(getPlayableAudioUrl)).then((playableUrls) => {
      void prefetchAudio(playableUrls.filter((url): url is string => Boolean(url)));
    });
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
    setLockedItem(null);
    // Clear before invoking so a throwing callback can't stay armed for a
    // later finishExit.
    const afterExit = pendingAfterExitRef.current;
    pendingAfterExitRef.current = null;
    afterExit?.();
    const currentItems = itemsRef.current;
    const nextIndex = currentItems.findIndex(
      (candidate) => !completedItemKeysRef.current.has(getStreamItemKey(candidate)),
    );
    setCurrentIndex(nextIndex >= 0 ? nextIndex : currentItems.length);
    updateLastItem(nextIndex >= 0 ? currentItems[nextIndex] : null);
    setEnterAnim(randomEnterAnim());
  }, [updateLastItem]);

  // Starts an exit animation and arms the fallback timer that recovers the deck
  // if `animationend` never arrives.
  const beginExit = useCallback((exitAnimClass?: string) => {
    isExitingRef.current = true;
    setExitAnim(exitAnimClass ?? randomExitAnim());
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

  // afterExit contract, by return value:
  //   'exit'    — runs exactly once when the exit animation ends (or the
  //               EXIT_FALLBACK_MS timer fires).
  //   'overlay' — last-card path: runs synchronously, then the done overlay shows.
  //   'skipped' — test/skipAnimation path: runs synchronously.
  //   'ignored' — re-entrant call rejected before afterExit is stashed: never runs.
  const advance = useCallback((opts?: {
    skipAnimation?: boolean;
    afterExit?: () => void;
    exitAnim?: string;
  }): 'exit' | 'overlay' | 'skipped' | 'ignored' => {
    const idx = currentIndexRef.current;
    const currentItems = itemsRef.current;
    const last = currentItems.length > 0 ? currentItems.length - 1 : -1;
    const skip = opts?.skipAnimation ?? false;
    // Ignore taps while an exit animation is already running — otherwise a second
    // tap overwrites the pending callback and can re-pick the same animation
    // class (which React won't restart), stalling the deck.
    if (isExitingRef.current && !skip && process.env.NODE_ENV !== 'test') return 'ignored';
    if (opts?.afterExit) pendingAfterExitRef.current = opts.afterExit;
    const currentItem = currentItems[idx] ?? lastItemRef.current;
    const isMinigame = currentItem ? '_isMinigame' in currentItem : false;

    if (currentItem) completedItemKeysRef.current.add(getStreamItemKey(currentItem));

    if (currentItem && !isMinigame) {
      onWordCardCompleted?.(currentItem as NormalizedWord);
    }

    if (process.env.NODE_ENV === 'test' || skip) {
      const afterExit = pendingAfterExitRef.current;
      pendingAfterExitRef.current = null;
      afterExit?.();
      const nextIndex = currentItems.findIndex(
        (candidate) => !completedItemKeysRef.current.has(getStreamItemKey(candidate)),
      );
      setCurrentIndex(nextIndex >= 0 ? nextIndex : currentItems.length);
      updateLastItem(nextIndex >= 0 ? currentItems[nextIndex] : null);
      return 'skipped';
    }

    if (currentItem) {
      setLockedItem(currentItem);
      let lockedStage = 0;
      let count = 0;
      const grouped = groupedWordsRef.current;
      for (let g = 0; g < grouped.length; g++) {
        count += grouped[g].length;
        if (idx < count) { lockedStage = g; break; }
      }
      setLockedStageIndex(lockedStage);
    }

    const hasAnotherItem = currentItems.some(
      (candidate) => !completedItemKeysRef.current.has(getStreamItemKey(candidate)),
    );
    if (last >= 0 && !hasAnotherItem) {
      if (!isMinigame) {
        setShowDoneOverlay(true);
        const afterExit = pendingAfterExitRef.current;
        pendingAfterExitRef.current = null;
        afterExit?.();
        return 'overlay';
      }
    }

    beginExit(opts?.exitAnim);
    return 'exit';
  }, [onWordCardCompleted, beginExit, updateLastItem]);

  const handleMiniGameComplete = useCallback(() => {
    advance({ skipAnimation: true });
  }, [advance]);

  const handleCardComplete = useCallback((
    afterExit?: () => void,
    options?: { skipAnimation?: boolean },
  ) => {
    advance({ afterExit, skipAnimation: options?.skipAnimation });
  }, [advance]);

  const handleAnimationEnd = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    // `animationend` bubbles, so ignore inner (reveal/entrance) animations.
    if (!e.animationName.startsWith('deck-exit-')) return;
    finishExit();
  }, [finishExit]);

  // Swipe-to-answer (frontier feature). Pointerdown reads the currently visible
  // item from the same refs used by deck advancement, so a mid-drag rerender
  // cannot retarget the commit.
  const getCurrentSwipeWordId = useCallback(() => {
    const currentItems = itemsRef.current;
    const currentItem = currentItems[currentIndexRef.current] ?? lastItemRef.current;
    if (!currentItem || '_isMinigame' in currentItem) return null;
    return currentItem.id;
  }, []);
  const swipeConfigured = Boolean(swipeActions);
  const swipeEnabled = swipeConfigured && !interstitialCard && !showDoneOverlay && !exitAnim;
  const swipe = useSwipeGesture({
    enabled: swipeEnabled,
    allowHorizontal: allowHorizontalSwipe,
    getWordId: getCurrentSwipeWordId,
    onCommit: (direction, wordId) => {
      if (!swipeActions) return;
      const result = advance({
        afterExit: () => {
          if (direction === 'up') swipeActions.markFullyKnown(wordId);
          else if (direction === 'right') swipeActions.markKnown(wordId);
          else swipeActions.markUnknown(wordId);
        },
        exitAnim: 'animate-deck-exit-swipe',
      });
      // No exit animation started (last-card overlay, re-entrant call): keep
      // the card visible and spring it back under the overlay.
      if (result !== 'exit') swipe.reset();
    },
  });
  const {
    cardRef: swipeCardRef,
    contentRef: swipeContentRef,
    leftBadgeRef: swipeLeftBadgeRef,
    rightBadgeRef: swipeRightBadgeRef,
    topBadgeRef: swipeTopBadgeRef,
    onPointerDown: handleSwipePointerDown,
  } = swipe;

  const handleEnterAnimationEnd = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    if (!e.animationName.startsWith('deck-enter-')) return;
    setEnterAnim(null);
  }, []);

  const pinnedItemIndex = !exitAnim && lastItem
    ? items.findIndex(
        (candidate) => getStreamItemKey(candidate) === getStreamItemKey(lastItem),
      )
    : -1;
  const effectiveCurrentIndex = pinnedItemIndex >= 0 ? pinnedItemIndex : currentIndex;
  const isDone = items.length === 0 || effectiveCurrentIndex >= items.length;
  const item = exitAnim
    ? lockedItem
    : items[effectiveCurrentIndex] ?? lastItem;

  useEffect(() => {
    currentIndexRef.current = effectiveCurrentIndex;
  }, [effectiveCurrentIndex]);

  if (interstitialCard) {
    return (
      // `data-tour` anchors the study step of the new-user feature tour; see
    // `features/learning/onboarding/featureTourSteps.ts`.
    <div
      data-tour="study"
      className="card-deck-view relative flex h-full w-full flex-col overflow-visible"
    >
        {interstitialCard}
      </div>
    );
  }

  if (isDone && !showDoneOverlay) {
    return (
      <div className="flex h-full items-center justify-center">
        {emptyState ?? (
          <p className="text-2xl font-semibold text-[#2A2218] opacity-70">
            {t('card.allDone')}
          </p>
        )}
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center">
        {emptyState ?? (
          <p className="text-2xl font-semibold text-[#2A2218] opacity-70">
            {t('card.allDone')}
          </p>
        )}
      </div>
    );
  }

  // Determine stageIndex from which group currentIndex falls into
  let stageIndex = 0;
  if (exitAnim && lockedItem) {
    stageIndex = lockedStageIndex;
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
  const swipeActive = swipeConfigured && !isMinigame;
  const horizontalSwipeActive = swipeActive && allowHorizontalSwipe;

  // Swipe badges show when the word comes back rather than a right/wrong
  // verdict — deliberately neutral so a left swipe doesn't read as "mistake".
  // Mirrors the okay/forgot hint math in WordCard. Note: `stageIndex` above is
  // a stream-section index (due/new), not the SRS stage — ask the caller.
  const swipeWordStage =
    horizontalSwipeActive && swipeActions
      ? swipeActions.getStageIndex((item as NormalizedWord).id)
      : 0;
  const repeatNowLabel = t('card.repeatShortNow');
  const swipeKnownLabel = `↺ ${
    formatInterval(STAGES[Math.min(swipeWordStage + 1, STAGES.length - 1)]?.intervalMs ?? 0, t) ||
    repeatNowLabel
  }`;
  const swipeUnknownLabel = `↺ ${
    formatInterval(STAGES[Math.max(swipeWordStage - 1, 0)]?.intervalMs ?? 0, t) || repeatNowLabel
  }`;
  const swipeFullyKnownLabel = t('card.fullyKnownNoRepeat');

  return (
    // `data-tour` anchors the study step of the new-user feature tour; see
    // `features/learning/onboarding/featureTourSteps.ts`.
    <div
      data-tour="study"
      className="card-deck-view relative flex h-full w-full flex-col overflow-visible"
    >
      <div
        key={itemKey}
        ref={swipeActive ? swipeCardRef : undefined}
        onPointerDown={swipeActive ? handleSwipePointerDown : undefined}
        className={[
          'card-deck-item relative flex h-full w-full flex-col overflow-visible',
          swipeActive ? 'touch-none' : '',
          exitAnim ?? '',
          enterAnim ?? '',
        ].join(' ')}
        onAnimationEnd={exitAnim ? handleAnimationEnd : enterAnim ? handleEnterAnimationEnd : undefined}
      >
        <div
          ref={swipeActive ? swipeContentRef : undefined}
          className="card-deck-swipe-content flex h-full w-full flex-col"
        >
          {isMinigame
            ? renderMiniGame(
                item as MiniGameConfig,
                // Mount the next card during the dismiss tap. iOS otherwise
                // loses user activation before its typing autofocus can run.
                // eslint-disable-next-line react-hooks/refs -- The render contract passes this callback to an event prop; it is never invoked during render.
                handleMiniGameComplete,
              )
            : renderCard(
                item as NormalizedWord,
                stageIndex,
                // eslint-disable-next-line react-hooks/refs -- The render contract passes this callback to an event prop; it is never invoked during render.
                handleCardComplete,
                { isExiting },
              )}
        </div>
        {horizontalSwipeActive && (
          <>
            {/* Inline color avoids relying on arbitrary Tailwind color emission here. */}
            <div
              ref={swipeLeftBadgeRef}
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-16 z-10 whitespace-nowrap rounded-full border-2 px-5 py-2 text-center text-xl font-black tracking-wide opacity-0"
              style={SWIPE_BADGE_STYLE}
            >
              {swipeUnknownLabel}
            </div>
            <div
              ref={swipeRightBadgeRef}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-16 z-10 whitespace-nowrap rounded-full border-2 px-5 py-2 text-center text-xl font-black tracking-wide opacity-0"
              style={SWIPE_BADGE_STYLE}
            >
              {swipeKnownLabel}
            </div>
          </>
        )}
      </div>
      {swipeActive && (
        <div
          ref={swipeTopBadgeRef}
          aria-hidden="true"
          className="pointer-events-none absolute z-10 whitespace-normal rounded-full border-2 px-5 py-2 text-center text-xl font-black tracking-wide opacity-0"
          style={{
            ...SWIPE_BADGE_STYLE,
            boxSizing: 'border-box',
            left: '50%',
            maxWidth: 'min(24rem, calc(100vw - 2rem))',
            top: 'calc(env(safe-area-inset-top, 0px) + 4.25rem)',
            transform: 'translate3d(-50%, clamp(-2rem, var(--swipe-top-badge-y, 0px), 0px), 0)',
            width: 'max-content',
          }}
        >
          {swipeFullyKnownLabel}
        </div>
      )}

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
