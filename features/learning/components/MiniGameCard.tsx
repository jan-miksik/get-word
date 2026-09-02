'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  checkAudioUrlAvailable,
  getCachedAudioUrlAvailability,
} from '@/lib/audio-availability';
import type { MiniGameConfig } from '@/features/learning/minigames';
import type { NormalizedWord } from '@/lib/words';
import { MultipleChoiceGame } from './games/MultipleChoiceGame';
import { TypingChallengeGame } from './games/TypingChallengeGame';
import { MatchingPairsGame } from './games/MatchingPairsGame';
import { TiltChoiceGame } from './games/TiltChoiceGame';
import { BubbleChoiceGame } from './games/BubbleChoiceGame';
import { SimilarWordsPromptGame } from './games/SimilarWordsPromptGame';
import { SkipExerciseButton } from './games/SkipExerciseButton';
import {
  getWordAudioSrcBySide,
  type LearningRole,
  type PromptMode,
  type WordSide,
} from './games/types';
import { useCardSound } from './card-audio/cardSound';
import { SoundToggle } from './card-audio/SoundToggle';
import { ContinueButton } from './ContinueButton';

interface Props {
  config: MiniGameConfig;
  role: LearningRole;
  onDismiss: () => void;
  onResult?: (delta: number) => void;
  onReviewOutcome?: (wordId: string, outcome: 'known' | 'unknown') => void;
  /**
   * The round was played to the end — every pair matched, the field cleared,
   * the question answered. Deliberately not the same thing as `onDismiss`,
   * which the skip button also fires: a round the learner walked away from has
   * not been worked through, and must not fill the slot the rail gave it.
   */
  onFinished?: (config: MiniGameConfig) => void;
  /** Fallback when there is no personal list to save generated words into. */
  onAddSimilarWords?: () => void;
  /** Everything the inline similar-words generator needs to run in place. */
  similarWordsContext?: {
    languageFrom: string;
    languageTo: string;
    baseListId: string | null;
    onSaved?: () => void | Promise<void>;
  };
  isActive?: boolean;
  /**
   * Draw the round on the bare surface instead of on a framed card.
   *
   * A round dealt into a session is a visitor inside it, so it arrives framed
   * and labelled. A round that *is* the session — the bonus block, where every
   * card is a round — has nothing to be a visitor in, and a frame around each
   * one reads as a screen from somewhere else. Matching and bubbles are
   * frameless already; this is what the choice round needs to join them.
   */
  frameless?: boolean;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return hash;
}

const WORD_SIDES = ['from', 'to'] as const satisfies readonly WordSide[];

export function getDeterministicSourceLangForGameId(gameId: string): WordSide {
  return (hashString(gameId) & 1) === 0 ? 'from' : 'to';
}

export function shouldUseDeterministicAudioPromptForGameId(gameId: string): boolean {
  return ((hashString(gameId) >> 1) & 1) === 0;
}

function pickAudioSideForQuestion(word: NormalizedWord | undefined): WordSide | null {
  if (!word) return null;
  for (const side of WORD_SIDES) {
    if (getWordAudioSrcBySide(word, side)) return side;
  }
  return null;
}

function pickAudioSideForMatching(words: NormalizedWord[]): WordSide | null {
  for (const side of WORD_SIDES) {
    if (words.every((word) => Boolean(getWordAudioSrcBySide(word, side)))) {
      return side;
    }
  }
  return null;
}

async function pickVerifiedAudioSideForQuestion(
  word: NormalizedWord | undefined,
): Promise<WordSide | null> {
  if (!word) return null;

  for (const side of WORD_SIDES) {
    const audioSrc = getWordAudioSrcBySide(word, side);
    if (!audioSrc) continue;
    if (await checkAudioUrlAvailable(audioSrc)) {
      return side;
    }
  }

  return null;
}

function pickCachedVerifiedAudioSideForQuestion(
  word: NormalizedWord | undefined,
): WordSide | null {
  if (!word) return null;

  for (const side of WORD_SIDES) {
    const audioSrc = getWordAudioSrcBySide(word, side);
    if (!audioSrc) continue;
    const availability = getCachedAudioUrlAvailability(audioSrc);
    if (availability === true) return side;
  }

  return null;
}

async function pickVerifiedAudioSideForMatching(
  words: NormalizedWord[],
): Promise<WordSide | null> {
  for (const side of WORD_SIDES) {
    const audioSources = words.map((word) => getWordAudioSrcBySide(word, side));
    if (audioSources.some((src) => !src)) continue;

    const availability = await Promise.all(
      audioSources.map((src) => checkAudioUrlAvailable(src)),
    );
    if (availability.every(Boolean)) {
      return side;
    }
  }

  return null;
}

function pickCachedVerifiedAudioSideForMatching(
  words: NormalizedWord[],
): WordSide | null {
  for (const side of WORD_SIDES) {
    const audioSources = words.map((word) => getWordAudioSrcBySide(word, side));
    if (audioSources.some((src) => !src)) continue;

    const availability = audioSources.map((src) => getCachedAudioUrlAvailability(src));
    if (availability.every((result) => result === true)) {
      return side;
    }
    if (availability.some((result) => result === null)) {
      continue;
    }
  }

  return null;
}

export function MiniGameCard({ config, role, onDismiss, onResult, onReviewOutcome, onFinished, onAddSimilarWords, similarWordsContext, isActive = true, frameless = false }: Props) {
  const [finished, setFinished] = useState<{ delta: number } | null>(null);
  // Reported once, from the render that first sees the round settled. Both the
  // matching board and the bubble field can reach the end through several
  // paths, so the guard lives here rather than in each game.
  const reportedFinishRef = useRef(false);
  useEffect(() => {
    if (!finished || reportedFinishRef.current) return;
    reportedFinishRef.current = true;
    onFinished?.(config);
  }, [config, finished, onFinished]);
  const { soundEnabled, toggleSound } = useCardSound();
  const level = config.level ?? 1;
  const standardLevel: 1 | 2 = level === 3 ? 2 : level;

  const randomPromptSide = useMemo(
    () => getDeterministicSourceLangForGameId(config.id),
    [config.id],
  );
  const shouldUseAudioPrompt = useMemo(
    () => shouldUseDeterministicAudioPromptForGameId(config.id),
    [config.id],
  );

  const handleResult = (delta: number) => {
    onResult?.(delta);
    setFinished({ delta });
  };

  const gameProps = {
    words: config.words,
    role,
    level: standardLevel,
    difficultyBand: config.difficultyBand,
    stageIndex: config.stageIndex,
    onResult: handleResult,
  };
  const questionWord = config.words[0];
  const requestedQuestionAudioSide = useMemo(
    () => (shouldUseAudioPrompt ? pickAudioSideForQuestion(questionWord) : null),
    [shouldUseAudioPrompt, questionWord],
  );
  const questionAudioKey = `${config.id}:${questionWord?.id ?? 'none'}:${requestedQuestionAudioSide ?? 'none'}`;
  const cachedQuestionAudioSide = requestedQuestionAudioSide
    ? pickCachedVerifiedAudioSideForQuestion(questionWord)
    : null;
  const [questionAudioResult, setQuestionAudioResult] = useState<{
    key: string;
    side: WordSide | null;
  }>(() => ({ key: questionAudioKey, side: cachedQuestionAudioSide }));
  const verifiedQuestionAudioSide = questionAudioResult.key === questionAudioKey
    ? questionAudioResult.side
    : cachedQuestionAudioSide;
  const typingAndChoicePromptSide: WordSide = verifiedQuestionAudioSide ?? randomPromptSide;
  const typingAndChoicePromptMode: PromptMode =
    soundEnabled && verifiedQuestionAudioSide ? 'audio' : 'text';

  const requestedMatchingAudioSide = useMemo(
    () => (shouldUseAudioPrompt ? pickAudioSideForMatching(config.words) : null),
    [config.words, shouldUseAudioPrompt],
  );
  const matchingAudioKey = `${config.id}:${requestedMatchingAudioSide ?? 'none'}`;
  const cachedMatchingAudioSide = requestedMatchingAudioSide
    ? pickCachedVerifiedAudioSideForMatching(config.words)
    : null;
  const [matchingAudioResult, setMatchingAudioResult] = useState<{
    key: string;
    side: WordSide | null;
  }>(() => ({ key: matchingAudioKey, side: cachedMatchingAudioSide }));
  const verifiedMatchingAudioSide = matchingAudioResult.key === matchingAudioKey
    ? matchingAudioResult.side
    : cachedMatchingAudioSide;
  const matchingPromptMode: PromptMode =
    soundEnabled && verifiedMatchingAudioSide ? 'audio' : 'text';

  useEffect(() => {
    if (!requestedQuestionAudioSide) return;
    let cancelled = false;
    void pickVerifiedAudioSideForQuestion(questionWord).then((side) => {
      if (!cancelled) {
        setQuestionAudioResult({ key: questionAudioKey, side });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [questionAudioKey, questionWord, requestedQuestionAudioSide]);

  useEffect(() => {
    if (!requestedMatchingAudioSide) return;
    let cancelled = false;
    void pickVerifiedAudioSideForMatching(config.words).then((side) => {
      if (!cancelled) {
        setMatchingAudioResult({ key: matchingAudioKey, side });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [config.words, matchingAudioKey, requestedMatchingAudioSide]);

  // The toggle rides in the game's own top-right lane (CardTopControls), next
  // to whatever else lives up there, rather than pinning itself to the corner
  // and landing on top of the stage badge.
  const topControls =
    config.gameType === 'similarWordsPrompt'
      ? null
      : <SoundToggle soundEnabled={soundEnabled} onToggle={toggleSound} />;

  let game = null;
  if (config.gameType === 'multipleChoice') {
    game = (
      <MultipleChoiceGame
        key={config.id}
        {...gameProps}
        stageIndex={config.stageIndex}
        sourceLang={typingAndChoicePromptSide}
        promptMode={typingAndChoicePromptMode}
        soundEnabled={soundEnabled}
        topControls={topControls}
        frameless={frameless}
      />
    );
  } else if (config.gameType === 'typing') {
    game = (
      <TypingChallengeGame
        key={config.id}
        {...gameProps}
        sourceLang={typingAndChoicePromptSide}
        promptMode={typingAndChoicePromptMode}
        soundEnabled={soundEnabled}
        topControls={topControls}
      />
    );
  } else if (config.gameType === 'matching') {
    game = (
      <MatchingPairsGame
        key={config.id}
        {...gameProps}
        soundEnabled={soundEnabled}
        topControls={topControls}
        frameless
        {...(matchingPromptMode === 'audio'
          ? { sourceLang: verifiedMatchingAudioSide!, promptMode: 'audio' as const }
          : { promptMode: 'text' as const })}
      />
    );
  } else if (config.gameType === 'tiltChoice') {
    game = (
      <TiltChoiceGame
        key={config.id}
        {...gameProps}
        sourceLang={typingAndChoicePromptSide}
        promptMode={typingAndChoicePromptMode}
        soundEnabled={soundEnabled}
        topControls={topControls}
        isActive={isActive}
      />
    );
  } else if (config.gameType === 'bubbleChoice') {
    game = (
      <BubbleChoiceGame
        key={config.id}
        words={config.words}
        role={role}
        level={level}
        difficultyBand={config.difficultyBand}
        stageIndex={config.stageIndex}
        onScore={(delta) => onResult?.(delta)}
        onReviewOutcome={onReviewOutcome}
        soundEnabled={soundEnabled}
        isActive={isActive}
        topControls={topControls}
        // A cleared field raises the same tap-to-continue bar every other game
        // ends on. Popping the last bubble used to advance on its own, which
        // took the card away mid-burst and gave the last answer no beat.
        onComplete={() => setFinished({ delta: 0 })}
      />
    );
  } else if (config.gameType === 'similarWordsPrompt') {
    const word = config.words[0];
    game = word ? (
      <SimilarWordsPromptGame
        word={word}
        role={role}
        languageFrom={similarWordsContext?.languageFrom ?? ''}
        languageTo={similarWordsContext?.languageTo ?? ''}
        baseListId={similarWordsContext?.baseListId ?? null}
        stageIndex={config.stageIndex}
        onOpenChat={() => onAddSimilarWords?.()}
        onSaved={similarWordsContext?.onSaved}
        onDismiss={onDismiss}
      />
    ) : null;
  }

  if (!game) return null;

  // The bubble field is a play space, not a card: it takes the whole study area
  // edge to edge, with no frame of its own, while every other game keeps the
  // centred, width-constrained card treatment.
  const fullBleed = config.gameType === 'bubbleChoice';
  const gameFrameClass = fullBleed
    ? 'relative mx-[calc(50%-50vw)] h-full w-screen'
    : config.gameType === 'multipleChoice'
      ? `relative mx-auto w-full ${config.words.length > 6 ? 'max-w-4xl' : 'max-w-3xl'}`
      : 'relative w-full';

  return (
    <div className="relative flex items-center justify-center h-full w-full">
      {/* The study column is clamped to 800px; the bubble field escapes it so the
          play space really does run to the edges of the window. Choice rounds
          clamp their whole frame too, so Skip and the top-right controls stay
          attached to the same column as the prompt and answer grid. */}
      <div
        className={gameFrameClass}
        data-game-frame={fullBleed ? 'full-bleed' : 'contained'}
      >
        {config.gameType !== 'similarWordsPrompt' && (
          <>
            {/* Every game here is practice: none of them decides a word's next
                interval, so walking away from one costs the learner nothing.
                The similar-words card is left out because it already offers
                "Not now" as one of its two real choices. */}
            {!finished && <SkipExerciseButton onSkip={onDismiss} />}
          </>
        )}
        {game}
      </div>
      {finished && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end rounded-xl transition-opacity duration-300"
        >
          <div
            className="flex justify-center px-4 py-4"
            style={{ animation: 'overlay-slide 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}
          >
            <ContinueButton
              variant="slab"
              className="pointer-events-auto max-w-[22rem]"
              onClick={onDismiss}
            />
          </div>
          <style>{`
            @keyframes overlay-slide {
              0% { opacity: 0; transform: translateY(6px); }
              100% { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
