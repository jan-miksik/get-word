'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { LearningStudyContent } from '@/features/learning/components/LearningStudyContent';
import { useViewModePreference } from '@/features/learning/app-state/useViewModePreference';
import { useMinigameFrequencyPreference } from '@/features/learning/hooks/useMinigameFrequencyPreference';
import { useLearningPageState } from '@/features/learning/hooks/useLearningPageState';
import { usePressHandlers } from '@/features/learning/hooks/usePressHandlers';
import { useLearningRenderers } from '@/features/learning/hooks/useLearningRenderers';
import { useAppState } from '@/hooks/useAppState';
import {
  getAvailableCategories,
  shouldShowMemoryHookForStage,
  STAGES,
  type NormalizedWord,
} from '@/lib/words';
import { LoadingScreen } from '@/components/LoadingScreen';
import { BootErrorScreen } from '@/components/BootErrorScreen';
import { LandingPage } from '@/features/landing/components/LandingPage';
import { AudioStorageDebugBadge } from '@/components/AudioStorageDebugBadge';
import { setAudioStorageLoggingEnabled } from '@/lib/audio-debug';
import { useDueTimer } from '@/hooks/useDueTimer';
import { useAuth } from '@/features/auth/client/useAuth';
import { AppStateProvider } from '@/context/AppStateContext';
import { I18nProvider } from '@/components/I18nProvider';
import { LearningLanguageOnboarding } from '@/features/learning/onboarding/LearningLanguageOnboarding';
import { AddWordsScreen } from '@/features/word-chat/components/AddWordsScreen';
import {
  readLandingLanguagePair,
  markLandingLanguagePairConsumed,
} from '@/features/shared/languages/landingPairStorage';
import { MemoryHooksIntroCard } from '@/features/learning/components/MemoryHooksIntroCard';
import { PWAInstallIntroCard } from '@/features/learning/components/PWAInstallIntroCard';
import { usePWAInstallIntro } from '@/features/learning/hooks/usePWAInstallIntro';
import { refreshListsAfterCommit } from '@/lib/sync';

const BOOT_LOADING_TIMEOUT_MS = 12_000;

// The learning app now runs entirely on synced word_list_items; there is no
// legacy seed word set. Stable identity avoids needless memo recomputes.
const EMPTY_WORDS: NormalizedWord[] = [];

/**
 * The signed-in learning app shell. Rendered by `app/page.tsx` only for
 * visitors with a valid app session; signed-out visitors get the
 * server-rendered `LandingPage` instead. The `isSignedOut` branch below is a
 * defensive fallback for the brief client window after a sign-out.
 */
export function HomeClient() {
  const [loaderDismissed, setLoaderDismissed] = useState(false);
  const [bootTimedOut, setBootTimedOut] = useState(false);
  // Lets an already-onboarded user replay the language-onboarding screen via
  // `?onboarding=1`. Safe to read in a lazy initializer: the first render is
  // always the LoadingScreen on both server and client, so this value never
  // participates in the hydrated tree.
  const [forceOnboarding, setForceOnboarding] = useState(
    () => {
      if (typeof window === 'undefined') return false;
      const params = new URLSearchParams(window.location.search);
      return params.get('onboarding') === '1' || params.get('wordChat') === '1';
    }
  );
  const [forceWordChat, setForceWordChat] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('wordChat') === '1',
  );
  const [completedDeckWordCards, setCompletedDeckWordCards] = useState(0);
  const [memoryHooksIntroDismissedForSession, setMemoryHooksIntroDismissedForSession] = useState(false);
  const [landingLanguagePair] = useState(() =>
    typeof window !== 'undefined' ? readLandingLanguagePair() : null,
  );
  const {
    isConnected,
    isAuthLoading,
    email,
    authProvider,
    address: walletAddress,
    school,
    hasAuthError,
    retryAuth,
    signOut,
  } = useAuth();

  const linkPayload = useMemo(
    () => (walletAddress ? { email: email ?? null, authProvider: authProvider ?? null } : undefined),
    [walletAddress, email, authProvider]
  );

  const appState = useAppState(EMPTY_WORDS, walletAddress, linkPayload);
  const {
    role,
    getWordDisplayMode,
    showAll,
    progress,
    selectedCategories,
    showEnglish,
    showCategoryBadges,
    showPronunciation,
    revealMode,
    memoryHooksEnabled,
    memoryHooksIntroAnswered,
    memoryHookDisableFromStage,
    studyNotesEnabled,
    studyNoteMinimizeFromStage,
    swipeCardsEnabled,
    tiltGameEnabled,
    typingModeEnabled,
    typingWriteIn,
    typingPrefillPunctuation,
    typingMobileKeyboardAutoFocus,
    typingPlayAudioAfterCheck,
    typingCheckButtonEnabled,
    markKnown,
    markReallyKnown,
    markUnknown,
    setCustomStage,
    filteredWords,
    getMemoryHook,
    setMemoryHook,
    getSuggestedMemoryHook,
    lastMovedId,
    categoryOrder,
    pinnedCategoryIds,
    isHydrated,
    isInitialServerSyncPending,
    isLinkingWallet,
    isListRefreshPending,
    hasLinkWalletError,
    setGameScore,
    syncedWords,
    userId,
    userEmail,
    userWalletAddress,
    learningLanguageFrom,
    learningLanguageTo,
    onboardingCompletedAt,
    setLearningLanguages,
    setActiveListId,
    setMemoryHooksEnabled,
    setMemoryHooksIntroAnswered,
    subscribedLists,
    isEditor,
  } = appState;

  // The app runs on synced words (from word_list_items).
  const activeWords = syncedWords ?? EMPTY_WORDS;

  // Swipe-to-answer (frontier feature): right = known, left = forgotten,
  // up = fully known / no repeat. Typing mode disables the gesture entirely so
  // vertical movement with the mobile keyboard cannot discard a word. The
  // deck's own group index is a stream-section index (due/new), not the SRS stage.
  const deckSwipeActions = useMemo(
    () =>
      swipeCardsEnabled && !typingModeEnabled
        ? {
            markKnown,
            markUnknown,
            markFullyKnown: (wordId: string) =>
              setCustomStage(wordId, STAGES.length - 1, { noRepeat: true }),
            getStageIndex: (wordId: string) => progress[wordId]?.stageIndex ?? 0,
          }
        : undefined,
    [swipeCardsEnabled, typingModeEnabled, markKnown, markUnknown, setCustomStage, progress]
  );

  // A cached profile means this device completed a sync while signed in, and
  // sign-out wipes that cache. So when the identity check merely *failed* (as
  // opposed to answering "signed out"), trust the cache and run offline rather
  // than locking out a user whose session is almost certainly still valid. Any
  // write that needs the server will still get a 401 and re-prompt.
  // Safe while the check is still in flight too: a confirmed signed-out visitor
  // is routed to the landing page below before this ever gates a render.
  const hasOfflineSession = Boolean(userId && (hasAuthError || isAuthLoading));
  const isAuthenticated = Boolean(
    (isConnected || hasOfflineSession) && userId && !hasLinkWalletError
  );
  const isWaitingForLinkedProfile = Boolean(
    isConnected &&
      walletAddress &&
      !userId &&
      (!hasLinkWalletError || isLinkingWallet)
  );
  const appReady =
    isHydrated &&
    !isInitialServerSyncPending &&
    (!isAuthLoading || hasOfflineSession) &&
    !isLinkingWallet &&
    !isWaitingForLinkedProfile;
  const displayEmail = userEmail ?? email ?? undefined;
  const displayAddress = userWalletAddress ?? walletAddress ?? undefined;

  const { minigameFrequency, setMinigameFrequency } = useMinigameFrequencyPreference();
  const { viewMode } = useViewModePreference();

  const categories = useMemo(
    () => getAvailableCategories(activeWords),
    [activeWords]
  );

  const phrasesRef = useRef<HTMLElement>(null);
  const [phrasesScrollElement, setPhrasesScrollElement] = useState<HTMLElement | null>(null);

  // Callback ref: fires immediately when <main> mounts
  const phrasesCallbackRef = useCallback((node: HTMLElement | null) => {
    phrasesRef.current = node;
    setPhrasesScrollElement(node);
  }, []);

  // Trigger re-render when cards become due for review
  const dueTimerRevision = useDueTimer(progress);

  // Attach press handlers to cover targets (supports virtualized mounts).
  // Disabled in scratch mode, where the canvas overlay owns the reveal gesture.
  usePressHandlers(phrasesScrollElement, [selectedCategories, showAll, role], {
    enabled: revealMode === 'press',
    // The card deck can't scroll, so skip the scroll-vs-press delay and reveal on
    // contact — the stream view keeps the default delay to guard scrolling. When
    // swipe-to-grade is active, keep the delay so a swipe cancels the pending
    // press via move-detection instead of flashing the answer on gesture start.
    pressDelayMs: viewMode === 'card' && !deckSwipeActions ? 0 : 150,
  });

  const shouldRenderMemoryHook = useCallback(
    (wordId: string) => {
      const stageIndex = progress[wordId]?.stageIndex ?? 0;
      return shouldShowMemoryHookForStage(
        stageIndex,
        memoryHooksEnabled,
        memoryHookDisableFromStage
      );
    },
    [progress, memoryHooksEnabled, memoryHookDisableFromStage]
  );

  const {
    showNotReady,
    setShowNotReady,
    dismissedGames,
    setDismissedGames,
    dueWords,
    settlingWords,
    streamGroupedWords,
    cardDeckGroups,
    progressStats,
  } = useLearningPageState({
    activeWords,
    filteredWords,
    selectedCategories,
    progress,
    isHydrated,
    viewMode,
    minigameFrequency,
    categoryOrder,
    pinnedCategoryIds,
    dueTimerRevision,
    typingModeEnabled,
    tiltGameEnabled,
    progressPlanRevision: isInitialServerSyncPending ? 'pending' : 'ready',
  });

  const {
    renderCard,
    renderMiniGame,
    renderCardForDeck,
    renderMiniGameForDeck,
  } = useLearningRenderers({
    progress,
    role,
    getWordDisplayMode,
    showAll,
    getMemoryHook,
    getSuggestedMemoryHook,
    markKnown,
    markReallyKnown,
    markUnknown,
    setCustomStage,
    setMemoryHook,
    lastMovedId,
    showEnglish,
    showCategoryBadges,
    showPronunciation,
    categoryOrder,
    shouldRenderMemoryHook,
    studyNotesEnabled,
    studyNoteMinimizeFromStage,
    swipeCardsEnabled,
    typingModeEnabled,
    typingWriteIn,
    typingPrefillPunctuation,
    typingMobileKeyboardAutoFocus,
    typingPlayAudioAfterCheck,
    typingCheckButtonEnabled,
    dismissedGames,
    setDismissedGames,
    setGameScore,
  });

  // No app session: signed-out visitors see the public landing page (below),
  // which explains the app and routes them to /login. The home page must stay
  // viewable without an account so its purpose is clear before signing in.
  // A failed identity check is *not* a signed-out state — it means we do not
  // know — so it gets the error screen rather than the landing page.
  const isSignedOut = !isAuthLoading && !isConnected && !hasAuthError;

  // The boot needs both an identity and a first sync payload. The error screen
  // is the last resort: only when neither the network nor the local cache can
  // supply them, since `isAuthenticated` already covers the offline case.
  const bootFailed = (hasAuthError || bootTimedOut) && !isAuthenticated;

  const retryBoot = useCallback(() => {
    if (hasAuthError) {
      retryAuth();
      return;
    }
    // A stalled sync leaves hydration state spread across this tree, IndexedDB
    // warm-start, and module-level sync identity; a full reload is the only
    // way to re-run boot from a known-clean state.
    window.location.reload();
  }, [hasAuthError, retryAuth]);

  useEffect(() => {
    if (loaderDismissed || (!appReady && !bootTimedOut)) return;
    const timeoutId = window.setTimeout(() => setLoaderDismissed(true), 220);
    return () => window.clearTimeout(timeoutId);
  }, [appReady, bootTimedOut, loaderDismissed]);

  useEffect(() => {
    if (appReady || loaderDismissed || bootTimedOut) return;
    const timeoutId = window.setTimeout(() => setBootTimedOut(true), BOOT_LOADING_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [appReady, bootTimedOut, loaderDismissed]);

  useEffect(() => {
    setAudioStorageLoggingEnabled(isEditor);
  }, [isEditor]);

  const forceShowMemoryHooksIntro = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('previewMemoryHooksIntro');
  }, []);

  const shouldShowMemoryHooksIntro = useMemo(
    () =>
      (forceShowMemoryHooksIntro && !memoryHooksIntroDismissedForSession) ||
      (viewMode === 'card' &&
        memoryHooksEnabled &&
        !memoryHooksIntroAnswered &&
        completedDeckWordCards >= 3),
    [
      completedDeckWordCards,
      forceShowMemoryHooksIntro,
      memoryHooksIntroDismissedForSession,
      memoryHooksEnabled,
      memoryHooksIntroAnswered,
      viewMode,
    ]
  );

  const handleEnableMemoryHooks = useCallback(() => {
    setMemoryHooksIntroDismissedForSession(true);
    setMemoryHooksEnabled(true);
    setMemoryHooksIntroAnswered(true);
  }, [setMemoryHooksEnabled, setMemoryHooksIntroAnswered]);

  const handleDisableMemoryHooks = useCallback(() => {
    setMemoryHooksIntroDismissedForSession(true);
    setMemoryHooksEnabled(false);
    setMemoryHooksIntroAnswered(true);
  }, [setMemoryHooksEnabled, setMemoryHooksIntroAnswered]);

  const memoryHooksIntroCard = shouldShowMemoryHooksIntro ? (
    <MemoryHooksIntroCard
      onEnableMemoryHooks={handleEnableMemoryHooks}
      onDisableMemoryHooks={handleDisableMemoryHooks}
      learningLanguageFrom={learningLanguageFrom}
      learningLanguageTo={learningLanguageTo}
    />
  ) : null;

  const {
    dismissPWAInstallIntro,
    isPreviewPWAActive,
    previewPWAInstallIntro,
    shouldShowPWAInstallIntro,
  } = usePWAInstallIntro({
    viewMode,
    shouldShowMemoryHooksIntro,
    completedDeckWordCards,
  });

  const pwaInstallIntroCard = shouldShowPWAInstallIntro ? (
    <PWAInstallIntroCard
      onDismiss={dismissPWAInstallIntro}
      simulatedPlatform={previewPWAInstallIntro.simulated}
    />
  ) : null;

  const interstitialCard = memoryHooksIntroCard ?? pwaInstallIntroCard;
  const hasNoSelectedWordList = Boolean(
    onboardingCompletedAt &&
      learningLanguageFrom &&
      learningLanguageTo &&
      subscribedLists.length === 0
  );
  // "Add words" from the app menu: same chat, different screen. Someone who is
  // already studying has answered everything onboarding asks, so they get the
  // chat alone rather than the whole first-run flow around it.
  const showAddWords = Boolean(
    forceWordChat &&
      onboardingCompletedAt &&
      learningLanguageFrom &&
      learningLanguageTo &&
      !hasNoSelectedWordList
  );
  const needsLanguageOnboarding = Boolean(
    !showAddWords &&
      (forceOnboarding ||
        hasNoSelectedWordList ||
        !onboardingCompletedAt ||
        !learningLanguageFrom ||
        !learningLanguageTo)
  );
  const landingPairFrom = landingLanguagePair?.from ?? null;
  const landingPairTo = landingLanguagePair?.to ?? null;
  const hasCompleteLandingPair = Boolean(
    landingPairFrom &&
      landingPairTo &&
      landingPairFrom !== landingPairTo
  );
  const shouldOpenWordChatFromLandingPair = Boolean(
    needsLanguageOnboarding &&
      hasCompleteLandingPair &&
      landingLanguagePair?.wantsOwnList !== true &&
      landingLanguagePair?.consumed !== true &&
      !forceOnboarding
  );
  const onboardingInitialFrom = learningLanguageFrom ?? landingPairFrom;
  const onboardingInitialTo = learningLanguageTo ?? landingPairTo;

  // The landing-page hand-off fires only once: as soon as we act on it, flag the
  // stored pair consumed so a later refresh lands on the normal pre-filled
  // language screen instead of jumping the learner back into the chat.
  useEffect(() => {
    if (shouldOpenWordChatFromLandingPair) markLandingLanguagePairConsumed();
  }, [shouldOpenWordChatFromLandingPair]);

  return (
    <AppStateProvider value={appState}>
      <I18nProvider language={appState.settingsLanguage}>
        {isEditor ? <AudioStorageDebugBadge /> : null}
        {bootFailed ? (
          <BootErrorScreen onRetry={retryBoot} />
        ) : isSignedOut ? (
          // Public landing page: explains the app without requiring a login.
          <LandingPage />
        ) : !loaderDismissed ? (
          <LoadingScreen />
        ) : !isAuthenticated ? (
          // Authed-but-still-hydrating → waiting on userId. Hold the loading
          // screen rather than flashing app chrome; `bootFailed` above breaks
          // the tie if it never arrives.
          <LoadingScreen />
        ) : isListRefreshPending ? (
          <LoadingScreen />
        ) : showAddWords ? (
          <AddWordsScreen
            languageFrom={learningLanguageFrom as string}
            languageTo={learningLanguageTo as string}
            onClose={() => {
              setForceWordChat(false);
              setForceOnboarding(false);
            }}
            onCommitted={async (result) => {
              setActiveListId(result.listId);
              // The commit went through its own endpoint, so pull a fresh
              // snapshot before dropping back into the study view — otherwise
              // the new category is invisible until an unrelated refetch.
              await refreshListsAfterCommit();
              setForceWordChat(false);
              setForceOnboarding(false);
            }}
          />
        ) : needsLanguageOnboarding ? (
          <LearningLanguageOnboarding
            initialFrom={onboardingInitialFrom}
            initialTo={onboardingInitialTo}
            accountEmail={displayEmail}
            onSignOut={signOut}
            // Someone who already chose their languages on the landing page has
            // answered the only question this screen asks, so skip straight to
            // the word chat instead of showing the pickers again. It is the same
            // destination as pressing Continue — the landing page just gets
            // there in one step.
            autoOpenWordChat={shouldOpenWordChatFromLandingPair || forceWordChat}
            // Only someone who is already set up can walk away from this screen;
            // for everyone else it is the required first step.
            onExit={
              hasNoSelectedWordList || !onboardingCompletedAt
                ? undefined
                : () => {
                    setForceWordChat(false);
                    setForceOnboarding(false);
                  }
            }
            onComplete={async (from, to) => {
              await setLearningLanguages(from, to);
              if (forceOnboarding) {
                setForceOnboarding(false);
                // Drop the `?onboarding=1` param so a refresh doesn't replay it.
                const url = new URL(window.location.href);
                url.searchParams.delete('onboarding');
                url.searchParams.delete('wordChat');
                window.history.replaceState(null, '', url.toString());
              }
            }}
            onSelectList={setActiveListId}
          />
        ) : (
          <LearningStudyContent
            // Force card view when previewing the PWA install screen — the
            // interstitial only renders inside the card deck.
            viewMode={isPreviewPWAActive ? 'card' : viewMode}
            minigameFrequency={minigameFrequency}
            onMinigameFrequencyChange={(f) => setMinigameFrequency(f)}
            isAuthenticated={isAuthenticated}
            authEmail={displayEmail}
            school={school}
            authAddress={displayAddress}
            onSignOut={signOut}
            // "Add words" from the menu. The `?wordChat=1` params are read once,
            // on mount, so switching here in state is what actually opens the
            // chat for someone already inside the app.
            onOpenWordChat={() => {
              setForceWordChat(true);
              setForceOnboarding(true);
            }}
            categories={categories}
            progressStats={progressStats}
            phrasesCallbackRef={phrasesCallbackRef}
            phrasesScrollElement={phrasesScrollElement}
            filteredWords={filteredWords}
            interstitialCard={interstitialCard}
            onDeckWordCardCompleted={() => setCompletedDeckWordCards((count) => count + 1)}
            deckSwipeActions={deckSwipeActions}
            deckHorizontalSwipeEnabled={!typingModeEnabled}
            cardDeckGroups={cardDeckGroups}
            streamGroupedWords={streamGroupedWords}
            renderCardForDeck={renderCardForDeck}
            renderMiniGameForDeck={renderMiniGameForDeck}
            renderCard={renderCard}
            renderMiniGame={renderMiniGame}
            dueWordsCount={dueWords.length}
            showNotReady={showNotReady}
            settlingCount={settlingWords.length}
            onToggleShowNotReady={() => setShowNotReady(!showNotReady)}
          />
        )}
      </I18nProvider>
    </AppStateProvider>
  );
}
