'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  checkAudioUrlAvailable,
  getCachedAudioUrlAvailability,
} from '@/lib/audio-availability';
import type { MiniGameConfig } from '@/lib/minigames';
import type { NormalizedWord } from '@/lib/words';
import { MultipleChoiceGame } from './games/MultipleChoiceGame';
import { TypingChallengeGame } from './games/TypingChallengeGame';
import { MatchingPairsGame } from './games/MatchingPairsGame';
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

export function MiniGameCard({ config, role, onDismiss, onResult }: Props) {
  const { t } = useI18n();
  const [finished, setFinished] = useState<{ delta: number } | null>(null);
  const [skipSound, setSkipSound] = useState<boolean>(() => readSkipSound());
  const [verifiedQuestionAudioSide, setVerifiedQuestionAudioSide] = useState<WordSide | null>(() =>
    pickCachedVerifiedAudioSideForQuestion(config.words[0]),
  );
  const [verifiedMatchingAudioSide, setVerifiedMatchingAudioSide] = useState<WordSide | null>(() =>
    pickCachedVerifiedAudioSideForMatching(config.words),
  );
  const level = config.level ?? 1;

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

  const gameProps = { words: config.words, role, level, onResult: handleResult };
  const questionWord = config.words[0];
  const requestedQuestionAudioSide = useMemo(
    () => (shouldUseAudioPrompt ? pickAudioSideForQuestion(questionWord) : null),
    [shouldUseAudioPrompt, questionWord],
  );
  const typingAndChoicePromptSide: WordSide = verifiedQuestionAudioSide ?? randomPromptSide;
  const typingAndChoicePromptMode: PromptMode =
    !skipSound && verifiedQuestionAudioSide ? 'audio' : 'text';

  const requestedMatchingAudioSide = useMemo(
    () => (shouldUseAudioPrompt ? pickAudioSideForMatching(config.words) : null),
    [config.words, shouldUseAudioPrompt],
  );
  const matchingPromptMode: PromptMode =
    !skipSound && verifiedMatchingAudioSide ? 'audio' : 'text';

  useEffect(() => {
    let cancelled = false;
    const cachedSide = pickCachedVerifiedAudioSideForQuestion(questionWord);

    if (!requestedQuestionAudioSide) {
      setVerifiedQuestionAudioSide(null);
      return () => {
        cancelled = true;
      };
    }

    setVerifiedQuestionAudioSide(cachedSide);
    void pickVerifiedAudioSideForQuestion(questionWord).then((side) => {
      if (!cancelled) {
        setVerifiedQuestionAudioSide(side);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [questionWord, requestedQuestionAudioSide]);

  useEffect(() => {
    let cancelled = false;
    const cachedSide = pickCachedVerifiedAudioSideForMatching(config.words);

    if (!requestedMatchingAudioSide) {
      setVerifiedMatchingAudioSide(null);
      return () => {
        cancelled = true;
      };
    }

    setVerifiedMatchingAudioSide(cachedSide);
    void pickVerifiedAudioSideForMatching(config.words).then((side) => {
      if (!cancelled) {
        setVerifiedMatchingAudioSide(side);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [config.words, requestedMatchingAudioSide]);

  let game = null;
  if (config.gameType === 'multipleChoice') {
    game = (
      <MultipleChoiceGame
        {...gameProps}
        sourceLang={typingAndChoicePromptSide}
        promptMode={typingAndChoicePromptMode}
        soundEnabled={!skipSound}
      />
    );
  } else if (config.gameType === 'typing') {
    game = (
      <TypingChallengeGame
        {...gameProps}
        sourceLang={typingAndChoicePromptSide}
        promptMode={typingAndChoicePromptMode}
        soundEnabled={!skipSound}
      />
    );
  } else if (config.gameType === 'matching') {
    game = (
      <MatchingPairsGame
        {...gameProps}
        soundEnabled={!skipSound}
        {...(matchingPromptMode === 'audio'
          ? { sourceLang: verifiedMatchingAudioSide!, promptMode: 'audio' as const }
          : { promptMode: 'text' as const })}
      />
    );
  }

  if (!game) return null;

  return (
    <div className="relative flex items-center justify-center h-full w-full">
      <div className="relative w-full">
        <SoundToggle skipSound={skipSound} onToggle={toggleSkipSound} />
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
            className="flex items-center justify-center px-4 py-3.5 rounded-b-xl bg-[#2A2218] text-[#F4EFE2] border-t-2 border-[#2A2218] shadow-[0_-6px_18px_rgba(0,0,0,0.18)]"
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
