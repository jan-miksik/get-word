'use client';

import { useEffect, useRef } from 'react';
import { LoadingScreen } from '@/components/LoadingScreen';
import { RisingLettersBackground } from '@/components/RisingLettersBackground';
import { isReverseDirectionList } from './listRecommendations';
import { OnboardingGenerationOverlay } from './OnboardingGenerationOverlay';
import { useLearningOnboardingActions } from './useLearningOnboardingActions';
import { useLearningOnboardingData } from './useLearningOnboardingData';

type Props = {
  initialFrom: string;
  initialTo: string;
  onComplete: (languageFrom: string, languageTo: string) => void | Promise<void>;
  onSelectList: (listId: string) => void;
  onFallbackToOnboarding: () => void;
};

export function AutoLanguageSetup({
  initialFrom,
  initialTo,
  onComplete,
  onSelectList,
  onFallbackToOnboarding,
}: Props) {
  const startedForKeyRef = useRef<string | null>(null);
  const {
    languageFrom,
    languageTo,
    matches,
    recommendedList,
    recommendedReason,
    matchesLoadFailed,
    loadingMatches,
    canContinue,
  } = useLearningOnboardingData({ initialFrom, initialTo });
  const {
    workingId,
    generationStatus,
    error,
    selectMatchedList,
    autogenerateCommonList,
  } = useLearningOnboardingActions({
    languageFrom,
    languageTo,
    canContinue,
    onComplete,
    onSelectList,
  });

  useEffect(() => {
    if (!canContinue || loadingMatches || matchesLoadFailed || workingId !== null) return;

    const setupKey = `${languageFrom}|${languageTo}`;
    if (startedForKeyRef.current === setupKey) return;
    startedForKeyRef.current = setupKey;

    if (recommendedList && recommendedReason === 'exact') {
      void selectMatchedList(recommendedList);
      return;
    }

    const exactMatches = matches.filter(
      (list) => !isReverseDirectionList(list, languageFrom, languageTo),
    );
    const commonList = exactMatches.find((list) => list.isCommon);
    if (commonList) {
      void selectMatchedList(commonList);
      return;
    }

    void autogenerateCommonList();
  }, [
    autogenerateCommonList,
    canContinue,
    languageFrom,
    languageTo,
    loadingMatches,
    matches,
    matchesLoadFailed,
    recommendedList,
    recommendedReason,
    selectMatchedList,
    workingId,
  ]);

  useEffect(() => {
    if (matchesLoadFailed) onFallbackToOnboarding();
  }, [matchesLoadFailed, onFallbackToOnboarding]);

  useEffect(() => {
    if (error) onFallbackToOnboarding();
  }, [error, onFallbackToOnboarding]);

  // Once list creation/audio generation is underway, swap the bare loader for the
  // real progress overlay so the wait (which can run for minutes) shows a title,
  // progress bar, and time estimate instead of reading as a frozen app. The
  // overlay's colors come from the `.onboarding-screen` CSS variable scope, so it
  // is rendered inside that context. Before generation starts (languages still
  // resolving, lists loading), keep the lightweight LoadingScreen.
  if (generationStatus) {
    return (
      <div className="onboarding-screen relative min-h-screen overflow-hidden">
        <RisingLettersBackground variant="ambient" className="z-0" />
        <OnboardingGenerationOverlay status={generationStatus} />
      </div>
    );
  }

  return <LoadingScreen />;
}
