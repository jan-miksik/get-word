'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  getWordAudioSrcBySide,
  type LearningRole,
  type PromptMode,
  type WordSide,
} from './games/types';
import { useI18n } from '@/components/I18nProvider';

const SKIP_SOUND_KEY = 'get-word-skip-sound';

function readSkipSound(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SKIP_SOUND_KEY) === 'true';
}

function SoundToggle({ skipSound, onToggle }: { skipSound: boolean; onToggle: () => void }) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={skipSound ? t('game.soundOff') : t('game.soundOn')}
      title={skipSound ? t('game.enableAudio') : t('game.disableAudio')}
      className="absolute top-3 right-3 z-20 inline-flex items-center justify-center h-9 w-9 rounded-full border-2 border-[#2A2218] bg-[#F4EFE2] text-[#2A2218] transition-colors duration-150 hover:bg-[#1E6FA8] hover:border-[#1E6FA8] hover:text-[#F4EFE2] active:bg-[#1E6FA8] active:border-[#1E6FA8] active:text-[#F4EFE2]"
    >
      {skipSound ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  );
}

interface Props {
  config: MiniGameConfig;
  role: LearningRole;
  onDismiss: () => void;
  onResult?: (delta: number) => void;
  onReviewOutcome?: (wordId: string, outcome: 'known' | 'unknown') => void;
  /** Fallback when there is no personal list to save generated words into. */
  onAddSimilarWords?: () => void;
  /** Everything the inline similar-words generator needs to run in place. */
  similarWordsContext?: {
    pool: NormalizedWord[];
    languageFrom: string;
    languageTo: string;
    baseListId: string | null;
    onSaved?: () => void | Promise<void>;
  };
  isActive?: boolean;
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

export function MiniGameCard({ config, role, onDismiss, onResult, onReviewOutcome, onAddSimilarWords, similarWordsContext, isActive = true }: Props) {
  const { t } = useI18n();
  const [finished, setFinished] = useState<{ delta: number } | null>(null);
  const [skipSound, setSkipSound] = useState<boolean>(() => readSkipSound());
  const level = config.level ?? 1;
  const standardLevel: 1 | 2 = level === 3 ? 2 : level;

  const toggleSkipSound = useCallback(() => {
    setSkipSound((prev) => {
      const next = !prev;
      localStorage.setItem(SKIP_SOUND_KEY, String(next));
      return next;
    });
  }, []);
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

  const gameProps = { words: config.words, role, level: standardLevel, onResult: handleResult };
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
    !skipSound && verifiedQuestionAudioSide ? 'audio' : 'text';

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
    !skipSound && verifiedMatchingAudioSide ? 'audio' : 'text';

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

  let game = null;
  if (config.gameType === 'multipleChoice') {
    game = (
      <MultipleChoiceGame
        key={config.id}
        {...gameProps}
        sourceLang={typingAndChoicePromptSide}
        promptMode={typingAndChoicePromptMode}
        soundEnabled={!skipSound}
      />
    );
  } else if (config.gameType === 'typing') {
    game = (
      <TypingChallengeGame
        key={config.id}
        {...gameProps}
        sourceLang={typingAndChoicePromptSide}
        promptMode={typingAndChoicePromptMode}
        soundEnabled={!skipSound}
      />
    );
  } else if (config.gameType === 'matching') {
    game = (
      <MatchingPairsGame
        key={config.id}
        {...gameProps}
        soundEnabled={!skipSound}
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
        soundEnabled={!skipSound}
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
        onScore={(delta) => onResult?.(delta)}
        onReviewOutcome={onReviewOutcome}
        onComplete={() => setFinished({ delta: 0 })}
      />
    );
  } else if (config.gameType === 'similarWordsPrompt') {
    const word = config.words[0];
    game = word ? (
      <SimilarWordsPromptGame
        word={word}
        role={role}
        pool={similarWordsContext?.pool ?? [word]}
        languageFrom={similarWordsContext?.languageFrom ?? ''}
        languageTo={similarWordsContext?.languageTo ?? ''}
        baseListId={similarWordsContext?.baseListId ?? null}
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

  return (
    <div className="relative flex items-center justify-center h-full w-full">
      {/* The study column is clamped to 800px; the bubble field escapes it so the
          play space really does run to the edges of the window. */}
      <div className={fullBleed ? 'relative mx-[calc(50%-50vw)] h-full w-screen' : 'relative w-full'}>
        {config.gameType !== 'similarWordsPrompt' && (
          <SoundToggle skipSound={skipSound} onToggle={toggleSkipSound} />
        )}
        {game}
      </div>
      {finished && (
        <div
          className="absolute inset-0 z-10 flex flex-col justify-end cursor-pointer rounded-xl transition-opacity duration-300"
          onClick={onDismiss}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onDismiss(); }}
        >
          <div
            className="flex items-center justify-center px-4 py-3.5 rounded-b-xl max-sm:rounded-b-none bg-[#2A2218] text-[#F4EFE2] border-t-2 border-[#2A2218] shadow-[0_-6px_18px_rgba(0,0,0,0.18)]"
            style={{ animation: 'overlay-slide 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}
          >
            <span className="text-sm font-bold uppercase tracking-[0.08em]" onClick={onDismiss}>{t('card.tapToContinue')} →</span>
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
