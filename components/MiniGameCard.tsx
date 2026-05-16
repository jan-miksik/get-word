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
import { getWordAudioSrcByLang, type PromptMode, type SourceLang } from './games/types';

const SKIP_SOUND_KEY = 'wordlink-skip-sound';

function readSkipSound(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SKIP_SOUND_KEY) === 'true';
}

function SoundToggle({ skipSound, onToggle }: { skipSound: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={skipSound ? 'Sound off — click to enable' : 'Sound on — click to disable'}
      title={skipSound ? 'Enable audio prompts' : 'Disable audio prompts'}
      className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 px-2 py-1 rounded-full transition-all duration-200 select-none hover:scale-110 hover:brightness-125 active:scale-95"
      style={{
        background: skipSound
          ? 'color-mix(in srgb, var(--text-soft) 14%, transparent)'
          : 'color-mix(in srgb, var(--accent) 12%, transparent)',
        border: `1px solid ${skipSound
          ? 'color-mix(in srgb, var(--text-soft) 28%, transparent)'
          : 'color-mix(in srgb, var(--accent) 28%, transparent)'}`,
        color: skipSound ? 'var(--text-soft)' : 'var(--accent)',
        fontSize: '0.65rem',
        letterSpacing: '0.03em',
        fontWeight: 500,
        right: '1rem',
        top: '1rem',
      }}
    >
      {skipSound ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
      <span>{skipSound ? 'text only' : 'sound'}</span>
    </button>
  );
}

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

function pickCachedVerifiedAudioSourceLangForQuestion(
  word: NormalizedWord | undefined,
): SourceLang | null {
  if (!word) return null;

  for (const lang of ['cz', 'vi'] as const) {
    const audioSrc = getWordAudioSrcByLang(word, lang);
    if (!audioSrc) continue;
    const availability = getCachedAudioUrlAvailability(audioSrc);
    if (availability === true) return lang;
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

function pickCachedVerifiedAudioSourceLangForMatching(
  words: NormalizedWord[],
): SourceLang | null {
  for (const lang of ['cz', 'vi'] as const) {
    const audioSources = words.map((word) => getWordAudioSrcByLang(word, lang));
    if (audioSources.some((src) => !src)) continue;

    const availability = audioSources.map((src) => getCachedAudioUrlAvailability(src));
    if (availability.every((result) => result === true)) {
      return lang;
    }
    if (availability.some((result) => result === null)) {
      continue;
    }
  }

  return null;
}

export function MiniGameCard({ config, role, onDismiss, onResult }: Props) {
  const [finished, setFinished] = useState<{ delta: number } | null>(null);
  const [skipSound, setSkipSound] = useState<boolean>(() => readSkipSound());
  const [verifiedQuestionAudioSourceLang, setVerifiedQuestionAudioSourceLang] = useState<SourceLang | null>(() =>
    pickCachedVerifiedAudioSourceLangForQuestion(config.words[0]),
  );
  const [verifiedMatchingAudioSourceLang, setVerifiedMatchingAudioSourceLang] = useState<SourceLang | null>(() =>
    pickCachedVerifiedAudioSourceLangForMatching(config.words),
  );
  const level = config.level ?? 1;

  const toggleSkipSound = useCallback(() => {
    setSkipSound((prev) => {
      const next = !prev;
      localStorage.setItem(SKIP_SOUND_KEY, String(next));
      return next;
    });
  }, []);
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
    !skipSound && verifiedQuestionAudioSourceLang ? 'audio' : 'text';

  const requestedMatchingAudioSourceLang = useMemo(
    () => (shouldUseAudioPrompt ? pickAudioSourceLangForMatching(config.words) : null),
    [config.words, shouldUseAudioPrompt],
  );
  const matchingPromptMode: PromptMode =
    !skipSound && verifiedMatchingAudioSourceLang ? 'audio' : 'text';

  useEffect(() => {
    let cancelled = false;
    const cachedLang = pickCachedVerifiedAudioSourceLangForQuestion(questionWord);

    if (!requestedQuestionAudioSourceLang) {
      setVerifiedQuestionAudioSourceLang(null);
      return () => {
        cancelled = true;
      };
    }

    setVerifiedQuestionAudioSourceLang(cachedLang);
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
    const cachedLang = pickCachedVerifiedAudioSourceLangForMatching(config.words);

    if (!requestedMatchingAudioSourceLang) {
      setVerifiedMatchingAudioSourceLang(null);
      return () => {
        cancelled = true;
      };
    }

    setVerifiedMatchingAudioSourceLang(cachedLang);
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
            <span className="text-sm font-bold uppercase tracking-[0.08em]" onClick={onDismiss}>Tap to continue →</span>
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
