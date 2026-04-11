'use client';

import { useEffect, useMemo, useState } from 'react';
import { checkAudioUrlAvailable } from '@/lib/audio-availability';
import type { MiniGameConfig } from '@/lib/minigames';
import type { NormalizedWord } from '@/lib/words';
import { MultipleChoiceGame } from './games/MultipleChoiceGame';
import { TypingChallengeGame } from './games/TypingChallengeGame';
import { MatchingPairsGame } from './games/MatchingPairsGame';
import { getWordAudioSrcByLang, type PromptMode, type SourceLang } from './games/types';

interface Props {
  config: MiniGameConfig;
  role: 'cz' | 'vi';
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

export function getDeterministicSourceLangForGameId(gameId: string): SourceLang {
  return (hashString(gameId) & 1) === 0 ? 'cz' : 'vi';
}

export function shouldUseDeterministicAudioPromptForGameId(gameId: string): boolean {
  return ((hashString(gameId) >> 1) & 1) === 0;
}

function pickAudioSourceLangForQuestion(word: NormalizedWord | undefined): SourceLang | null {
  if (!word) return null;
  if (getWordAudioSrcByLang(word, 'cz')) return 'cz';
  if (getWordAudioSrcByLang(word, 'vi')) return 'vi';
  return null;
}

function pickAudioSourceLangForMatching(words: NormalizedWord[]): SourceLang | null {
  const hasAllCzAudio = words.every((word) => Boolean(getWordAudioSrcByLang(word, 'cz')));
  if (hasAllCzAudio) return 'cz';
  const hasAllViAudio = words.every((word) => Boolean(getWordAudioSrcByLang(word, 'vi')));
  if (hasAllViAudio) return 'vi';
  return null;
}

async function pickVerifiedAudioSourceLangForQuestion(
  word: NormalizedWord | undefined,
): Promise<SourceLang | null> {
  if (!word) return null;

  for (const lang of ['cz', 'vi'] as const) {
    const audioSrc = getWordAudioSrcByLang(word, lang);
    if (!audioSrc) continue;
    if (await checkAudioUrlAvailable(audioSrc)) {
      return lang;
    }
  }

  return null;
}

async function pickVerifiedAudioSourceLangForMatching(
  words: NormalizedWord[],
): Promise<SourceLang | null> {
  for (const lang of ['cz', 'vi'] as const) {
    const audioSources = words.map((word) => getWordAudioSrcByLang(word, lang));
    if (audioSources.some((src) => !src)) continue;

    const availability = await Promise.all(
      audioSources.map((src) => checkAudioUrlAvailable(src)),
    );
    if (availability.every(Boolean)) {
      return lang;
    }
  }

  return null;
}

export function MiniGameCard({ config, role, onDismiss, onResult }: Props) {
  const [finished, setFinished] = useState<{ delta: number } | null>(null);
  const [verifiedQuestionAudioSourceLang, setVerifiedQuestionAudioSourceLang] = useState<SourceLang | null>(null);
  const [verifiedMatchingAudioSourceLang, setVerifiedMatchingAudioSourceLang] = useState<SourceLang | null>(null);
  const level = config.level ?? 1;
  const randomSourceLang = useMemo(
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
  const requestedQuestionAudioSourceLang = useMemo(
    () => (shouldUseAudioPrompt ? pickAudioSourceLangForQuestion(questionWord) : null),
    [shouldUseAudioPrompt, questionWord],
  );
  const typingAndChoiceSourceLang = verifiedQuestionAudioSourceLang ?? randomSourceLang;
  const typingAndChoicePromptMode: PromptMode =
    verifiedQuestionAudioSourceLang ? 'audio' : 'text';

  const requestedMatchingAudioSourceLang = useMemo(
    () => (shouldUseAudioPrompt ? pickAudioSourceLangForMatching(config.words) : null),
    [config.words, shouldUseAudioPrompt],
  );
  const matchingPromptMode: PromptMode =
    verifiedMatchingAudioSourceLang ? 'audio' : 'text';

  useEffect(() => {
    let cancelled = false;

    if (!requestedQuestionAudioSourceLang) {
      setVerifiedQuestionAudioSourceLang(null);
      return () => {
        cancelled = true;
      };
    }

    setVerifiedQuestionAudioSourceLang(null);
    void pickVerifiedAudioSourceLangForQuestion(questionWord).then((lang) => {
      if (!cancelled) {
        setVerifiedQuestionAudioSourceLang(lang);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [questionWord, requestedQuestionAudioSourceLang]);

  useEffect(() => {
    let cancelled = false;

    if (!requestedMatchingAudioSourceLang) {
      setVerifiedMatchingAudioSourceLang(null);
      return () => {
        cancelled = true;
      };
    }

    setVerifiedMatchingAudioSourceLang(null);
    void pickVerifiedAudioSourceLangForMatching(config.words).then((lang) => {
      if (!cancelled) {
        setVerifiedMatchingAudioSourceLang(lang);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [config.words, requestedMatchingAudioSourceLang]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    console.info('[AudioDebug][MiniGameCard]', {
      gameId: config.id,
      gameType: config.gameType,
      shouldUseAudioPrompt,
      randomSourceLang,
      typingAndChoicePromptMode,
      typingAndChoiceSourceLang,
      matchingPromptMode,
      requestedQuestionAudioSourceLang,
      verifiedQuestionAudioSourceLang,
      requestedMatchingAudioSourceLang,
      verifiedMatchingAudioSourceLang,
      level,
      questionWordId: questionWord?.id,
      questionCzAudio: questionWord?.czAudio ?? null,
      questionViAudio: questionWord?.viAudio ?? null,
    });
  }, [
    config.id,
    config.gameType,
    shouldUseAudioPrompt,
    randomSourceLang,
    typingAndChoicePromptMode,
    typingAndChoiceSourceLang,
    matchingPromptMode,
    requestedQuestionAudioSourceLang,
    verifiedQuestionAudioSourceLang,
    requestedMatchingAudioSourceLang,
    verifiedMatchingAudioSourceLang,
    level,
    questionWord?.id,
    questionWord?.czAudio,
    questionWord?.viAudio,
  ]);

  let game = null;
  if (config.gameType === 'multipleChoice') {
    game = (
      <MultipleChoiceGame
        {...gameProps}
        sourceLang={typingAndChoiceSourceLang}
        promptMode={typingAndChoicePromptMode}
      />
    );
  } else if (config.gameType === 'typing') {
    game = (
      <TypingChallengeGame
        {...gameProps}
        sourceLang={typingAndChoiceSourceLang}
        promptMode={typingAndChoicePromptMode}
      />
    );
  } else if (config.gameType === 'matching') {
    game = (
      <MatchingPairsGame
        {...gameProps}
        {...(matchingPromptMode === 'audio'
          ? { sourceLang: verifiedMatchingAudioSourceLang!, promptMode: 'audio' as const }
          : { promptMode: 'text' as const })}
      />
    );
  }

  if (!game) return null;

  return (
    <div className="relative flex items-center justify-center h-full w-full">
      <div className="w-full">
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
            className="flex items-center justify-center px-4 py-3 rounded-b-xl bg-black/15"
            style={{ animation: 'overlay-slide 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}
          >
            <span className="text-sm text-white/70" style={{ color: '#a7a7a7' }} onClick={onDismiss}>Tap to continue</span>
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
