'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { AnimationEvent, CSSProperties, ReactNode } from 'react';
import { STAGES, type NormalizedWord } from '@/lib/words';
import type { MiniGameConfig } from '@/features/learning/minigames';
import type { LearningStreamGroup } from '@/features/learning/types';
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

/**
 * A word can legitimately appear in two blocks of the same day: the closing
 * same-day repeat block asks again for the words the new block just introduced.
 * Keyed by word id alone those two appearances were one card — the second was
 * skipped as "already completed", React reused the first one's subtree (an
 * assembly round returned with its tiles still chosen, so one more tap finished
 * it), and every key lookup resolved to the earlier block, which is what made
 * the rail draw the wrong block. The block key is what tells them apart.
 */
function deckEntryKey(groupKey: string, item: StreamItem): string {
  return `${groupKey}|${getStreamItemKey(item)}`;
}

/** One card as the deck walks it: the item, its identity, and where it sits. */
interface DeckEntry {
  item: StreamItem;
  key: string;
  blockIndex: number;
  reinforcement?: true;
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
  /** Preferred structured stream shape. */
  streamGroups?: LearningStreamGroup[];
  /** Transitional compatibility for direct component consumers and older tests. */
  groupedWords?: (NormalizedWord | MiniGameConfig)[][];
  interstitialCard?: ReactNode | null;
  emptyState?: ReactNode | null;
  onWordCardCompleted?: (word: NormalizedWord) => void;
  /** When set, word cards can be swiped right = known / left = forgotten (frontier feature). */
  swipeActions?: CardDeckSwipeActions;
  /** False keeps only the upward fully-known gesture. */
  allowHorizontalSwipe?: boolean;
  /** Veto swipe for individual cards (a typing card owns the keyboard). */
  isSwipeBlockedForWord?: (wordId: string) => boolean;
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
  streamGroups,
  groupedWords,
  interstitialCard = null,
  emptyState = null,
  onWordCardCompleted,
  swipeActions,
  allowHorizontalSwipe = true,
  isSwipeBlockedForWord,
  renderCard,
  renderMiniGame,
}: CardDeckViewProps) {
  const { t } = useI18n();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exitAnim, setExitAnim] = useState<string | null>(null);
  const [enterAnim, setEnterAnim] = useState<string | null>(null);
  const [audioNetworkRevision, setAudioNetworkRevision] = useState(0);

  const normalizedGroups = useMemo<LearningStreamGroup[]>(
    () => streamGroups ?? (groupedWords ?? []).map((items, blockIndex) => ({
      key: `legacy-${blockIndex}`,
      kind: 'review',
      blockIndex,
      items,
    })),
    [groupedWords, streamGroups],
  );
  const entries = useMemo<DeckEntry[]>(
    () => normalizedGroups.flatMap((group) =>
      group.items.map((item) => ({
        item,
        key: deckEntryKey(group.key, item),
        blockIndex: group.blockIndex,
        ...(group.reinforcement ? { reinforcement: true as const } : {}),
      })),
    ),
    [normalizedGroups],
  );
  const items = useMemo<StreamItem[]>(() => entries.map((entry) => entry.item), [entries]);

  // Keep a snapshot of the last successfully rendered item so we can still
  // show it after items[] shrinks (words are removed from the queue once marked).
  const [lastEntry, setLastEntry] = useState<DeckEntry | null>(null);
  const lastEntryRef = useRef<DeckEntry | null>(null);
  // Lock the card being animated out so its content doesn't swap mid-animation
  // if the underlying item list changes after the word is marked. The entry
  // carries its own block index, so the locked card keeps its rail too.
  const [lockedEntry, setLockedEntry] = useState<DeckEntry | null>(null);
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
  const entriesRef = useRef(entries);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
    entriesRef.current = entries;
  }, [currentIndex, entries]);

  const updateLastEntry = useCallback((entry: DeckEntry | null) => {
    lastEntryRef.current = entry;
    setLastEntry(entry);
  }, []);

  useEffect(() => {
    const availableKeys = new Set(entries.map((entry) => entry.key));
    for (const key of completedItemKeysRef.current) {
      if (!availableKeys.has(key)) completedItemKeysRef.current.delete(key);
    }

    if (isExitingRef.current) return;
    const visibleKey = lastEntryRef.current?.key ?? null;
    const visibleIndex = visibleKey
      ? entries.findIndex((candidate) => candidate.key === visibleKey)
      : -1;
    if (visibleIndex >= 0 && !completedItemKeysRef.current.has(visibleKey!)) {
      setCurrentIndex(visibleIndex);
      return;
    }

    const nextIndex = entries.findIndex(
      (candidate) => !completedItemKeysRef.current.has(candidate.key),
    );
    setCurrentIndex(nextIndex >= 0 ? nextIndex : entries.length);
    updateLastEntry(nextIndex >= 0 ? entries[nextIndex] : null);
  }, [entries, updateLastEntry]);

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
    setLockedEntry(null);
    // Clear before invoking so a throwing callback can't stay armed for a
    // later finishExit.
    const afterExit = pendingAfterExitRef.current;
    pendingAfterExitRef.current = null;
    afterExit?.();
    const currentEntries = entriesRef.current;
    const nextIndex = currentEntries.findIndex(
      (candidate) => !completedItemKeysRef.current.has(candidate.key),
    );
    setCurrentIndex(nextIndex >= 0 ? nextIndex : currentEntries.length);
    updateLastEntry(nextIndex >= 0 ? currentEntries[nextIndex] : null);
    setEnterAnim(randomEnterAnim());
  }, [updateLastEntry]);

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
  //   'skipped' — test/skipAnimation path: runs synchronously.
  //   'ignored' — re-entrant call rejected before afterExit is stashed: never runs.
  const advance = useCallback((opts?: {
    skipAnimation?: boolean;
    afterExit?: () => void;
    exitAnim?: string;
  }): 'exit' | 'skipped' | 'ignored' => {
    const idx = currentIndexRef.current;
    const currentEntries = entriesRef.current;
    const skip = opts?.skipAnimation ?? false;
    // Ignore taps while an exit animation is already running — otherwise a second
    // tap overwrites the pending callback and can re-pick the same animation
    // class (which React won't restart), stalling the deck.
    if (isExitingRef.current && !skip && process.env.NODE_ENV !== 'test') return 'ignored';
    if (opts?.afterExit) pendingAfterExitRef.current = opts.afterExit;
    const currentEntry = currentEntries[idx] ?? lastEntryRef.current;
    const isMinigame = currentEntry ? '_isMinigame' in currentEntry.item : false;

    if (currentEntry) completedItemKeysRef.current.add(currentEntry.key);

    if (currentEntry && !isMinigame) {
      onWordCardCompleted?.(currentEntry.item as NormalizedWord);
    }

    if (process.env.NODE_ENV === 'test' || skip) {
      const afterExit = pendingAfterExitRef.current;
      pendingAfterExitRef.current = null;
      afterExit?.();
      const nextIndex = currentEntries.findIndex(
        (candidate) => !completedItemKeysRef.current.has(candidate.key),
      );
      setCurrentIndex(nextIndex >= 0 ? nextIndex : currentEntries.length);
      updateLastEntry(nextIndex >= 0 ? currentEntries[nextIndex] : null);
      return 'skipped';
    }

    if (currentEntry) setLockedEntry(currentEntry);

    beginExit(opts?.exitAnim);
    return 'exit';
  }, [onWordCardCompleted, beginExit, updateLastEntry]);

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
    const currentEntries = entriesRef.current;
    const currentItem = (currentEntries[currentIndexRef.current] ?? lastEntryRef.current)?.item;
    if (!currentItem || '_isMinigame' in currentItem) return null;
    if (isSwipeBlockedForWord?.(currentItem.id)) return null;
    return currentItem.id;
  }, [isSwipeBlockedForWord]);
  const swipeConfigured = Boolean(swipeActions);
  const swipeEnabled = swipeConfigured && !interstitialCard && !exitAnim;
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
      // No exit animation started (a re-entrant call): spring the card back.
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

  const pinnedItemIndex = !exitAnim && lastEntry
    ? entries.findIndex((candidate) => candidate.key === lastEntry.key)
    : -1;
  const effectiveCurrentIndex = pinnedItemIndex >= 0 ? pinnedItemIndex : currentIndex;
  const isDone = entries.length === 0 || effectiveCurrentIndex >= entries.length;
  const entry = exitAnim
    ? lockedEntry
    : entries[effectiveCurrentIndex] ?? lastEntry;
  const item = entry?.item ?? null;

  useEffect(() => {
    currentIndexRef.current = effectiveCurrentIndex;
  }, [effectiveCurrentIndex]);

  if (interstitialCard) {
    return (
      // `data-tour` anchors the study step of the new-user feature tour; see
    // `features/learning/onboarding/featureTourSteps.ts`.
    <div
      data-tour="study"
      className="card-deck-view relative mx-auto flex h-full w-full max-w-[800px] flex-col overflow-visible"
    >
        {interstitialCard}
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="flex h-full items-center justify-center">
        {emptyState ?? (
          <p className="text-2xl font-semibold text-[#2A2218] opacity-70">
            {t('learning.sessionDoneTitle')}
          </p>
        )}
      </div>
    );
  }

  if (!entry || !item) {
    return (
      <div className="flex h-full items-center justify-center">
        {emptyState ?? (
          <p className="text-2xl font-semibold text-[#2A2218] opacity-70">
            {t('learning.sessionDoneTitle')}
          </p>
        )}
      </div>
    );
  }

  // The entry already knows which block it came from, locked card included.
  const blockIndex = entry.blockIndex;

  const isMinigame = '_isMinigame' in item;
  const itemKey = entry.key;
  const isExiting = Boolean(exitAnim);
  // Reinforcement has asymmetric SRS semantics: a correct answer confirms the
  // five-minute stage instead of advancing it. The deck-level swipe callbacks
  // are ordinary known/unknown actions, so keep this short block button-driven.
  const swipeActive = swipeConfigured && !isMinigame && !entry.reinforcement;
  const horizontalSwipeActive = swipeActive && allowHorizontalSwipe;

  // Swipe badges show when the word comes back rather than a right/wrong
  // verdict — deliberately neutral so a left swipe doesn't read as "mistake".
  // Mirrors the okay/forgot hint math in WordCard. `blockIndex` is only stream
  // position, never the SRS stage.
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
      // The reading width for a card being studied. It lives here rather than
      // on the column so that the empty states — the card that closes the day
      // above all — are free to use the whole screen.
      className="card-deck-view relative mx-auto flex h-full w-full max-w-[800px] flex-col overflow-visible"
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
                blockIndex,
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

    </div>
  );
}
