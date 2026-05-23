'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { getPlayableAudioUrl } from '@/lib/audio-availability';
import type { NormalizedWord } from '@/lib/words';
import {
  flipSide,
  getWordAudioSrcBySide,
  getWordAudioSrcsBySide,
  getWordTextBySide,
  knownSideForRole,
  learningSideForRole,
  type LearningRole,
  type PromptMode,
  type WordSide,
} from './types';
import { useI18n } from '@/components/I18nProvider';

interface Props {
  words: NormalizedWord[];
  role: LearningRole;
  sourceLang?: WordSide;
  promptMode?: PromptMode;
  soundEnabled?: boolean;
  level?: 1 | 2;
  onResult?: (delta: number) => void;
}

type MatchState = 'idle' | 'selected' | 'matched' | 'wrong';
type MatchColor = 1 | 2 | 3 | 4;

export function MatchingPairsGame({
  words,
  role,
  sourceLang,
  promptMode = 'text',
  soundEnabled = false,
  level = 1,
  onResult,
}: Props) {
  const { t } = useI18n();
  const rightOrder = useMemo(
    () => [...words].sort(() => Math.random() - 0.5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words]
  );

  const [leftSelected, setLeftSelected] = useState<string | null>(null);
  const [rightSelected, setRightSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [matchColors, setMatchColors] = useState<Map<string, MatchColor>>(() => new Map());
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null);
  const [hasAudioPlaybackError, setHasAudioPlaybackError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const requestedPromptSide: WordSide = sourceLang ?? knownSideForRole(role);
  const learningSide: WordSide = learningSideForRole(role);
  const audioByWordId = useMemo(
    () => new Map(words.map((word) => [word.id, getWordAudioSrcBySide(word, requestedPromptSide)])),
    [words, requestedPromptSide],
  );
  const learningAudioByWordId = useMemo(
    () => new Map(words.map((word) => [word.id, getWordAudioSrcsBySide(word, learningSide)])),
    [words, learningSide],
  );
  const hasCompleteAudio = useMemo(
    () => words.every((word) => Boolean(audioByWordId.get(word.id))),
    [words, audioByWordId],
  );
  const effectivePromptMode: PromptMode =
    promptMode === 'audio' && hasCompleteAudio && !hasAudioPlaybackError ? 'audio' : 'text';
  const textModePromptSide: WordSide =
    promptMode === 'audio' && !hasCompleteAudio
      ? knownSideForRole(role)
      : requestedPromptSide;
  const textModeAnswerSide: WordSide = flipSide(textModePromptSide);
  const promptNumberById = useMemo(
    () => new Map(words.map((word, index) => [word.id, index + 1])),
    [words],
  );

  const isComplete = matched.size === words.length;
  const resultFired = useRef(false);

  useEffect(() => {
    if (isComplete && !resultFired.current) {
      resultFired.current = true;
      onResult?.(level === 2 ? 2 : 1);
    }
  }, [isComplete, level, onResult]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const attempt = (lId: string, rId: string) => {
    if (lId === rId) {
      if (soundEnabled) {
        void playClip(learningAudioByWordId.get(lId) ?? []);
      }
      setMatchColors(prev => {
        if (prev.has(lId)) return prev;
        const next = new Map(prev);
        const nextColor = ((prev.size % 4) + 1) as MatchColor;
        next.set(lId, nextColor);
        return next;
      });
      setMatched(prev => new Set([...prev, lId]));
      setLeftSelected(null);
      setRightSelected(null);
    } else {
      setWrongPair([lId, rId]);
      setTimeout(() => {
        setWrongPair(null);
        setLeftSelected(null);
        setRightSelected(null);
      }, 600);
    }
  };

  const playClip = async (
    audioSrc: string | string[] | null,
  ): Promise<{ ok: boolean; interrupted: boolean }> => {
    const candidateAudioSrcs = (Array.isArray(audioSrc) ? audioSrc : [audioSrc])
      .filter((src): src is string => Boolean(src))
      .filter((src, idx, arr) => arr.indexOf(src) === idx);
    if (!candidateAudioSrcs.length) {
      return { ok: false, interrupted: false };
    }

    const playAudioSrc = async (audioSrc: string): Promise<{ ok: boolean; reason?: string }> =>
      new Promise((resolve) => {
        let settled = false;
        const done = (result: { ok: boolean; reason?: string }) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        try {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          const audio = new Audio(audioSrc);
          audio.onerror = () => done({ ok: false, reason: 'audio-error' });
          audioRef.current = audio;
          audio.play()
            .then(() => done({ ok: true }))
            .catch((err) => {
              const message = err instanceof Error ? err.message : String(err);
              const interrupted = /interrupted by a call to pause/i.test(message);
              done({ ok: false, reason: interrupted ? 'interrupted' : message });
            });
        } catch {
          done({ ok: false, reason: 'exception' });
        }
      });

    for (let i = 0; i < candidateAudioSrcs.length; i += 1) {
      const playableSrc = await getPlayableAudioUrl(candidateAudioSrcs[i]);
      if (!playableSrc) continue;

      const result = await playAudioSrc(playableSrc);
      if (result.ok) return { ok: true, interrupted: false };
      if (result.reason === 'interrupted') return { ok: false, interrupted: true };
    }

    return { ok: false, interrupted: false };
  };

  const playPrompt = async (id: string) => {
    const result = await playClip(audioByWordId.get(id) ?? null);
    if (result.ok || result.interrupted) return;
    setHasAudioPlaybackError(true);
  };

  const handleLeft = (id: string) => {
    if (matched.has(id) || wrongPair) return;
    if (effectivePromptMode === 'audio') {
      void playPrompt(id);
    }
    const next = id === leftSelected ? null : id;
    setLeftSelected(next);
    if (next && rightSelected) attempt(next, rightSelected);
  };

  const handleRight = (id: string) => {
    if (matched.has(id) || wrongPair) return;
    const next = id === rightSelected ? null : id;
    setRightSelected(next);
    if (leftSelected && next) attempt(leftSelected, next);
  };

  const getLeftState = (id: string): MatchState => {
    if (matched.has(id)) return 'matched';
    if (wrongPair?.[0] === id) return 'wrong';
    if (leftSelected === id) return 'selected';
    return 'idle';
  };

  const getRightState = (id: string): MatchState => {
    if (matched.has(id)) return 'matched';
    if (wrongPair?.[1] === id) return 'wrong';
    if (rightSelected === id) return 'selected';
    return 'idle';
  };

  const getMatchColorClass = (id: string, state: MatchState) => {
    if (state !== 'matched') return '';
    const color = matchColors.get(id);
    return color ? ` game-match-btn--c${color}` : '';
  };

  return (
    <article className="phrase-card game-card game-card--matching">
      <div className="game-badge">🔗 {t('game.match')}</div>

      <div className="game-match-grid">
        <div className="game-match-col">
          {words.map(w => {
            const state = getLeftState(w.id);
            return (
              <button
                key={w.id}
                type="button"
                className={`game-match-btn game-match-btn--${state}${getMatchColorClass(w.id, state)}`}
                onClick={() => handleLeft(w.id)}
                disabled={matched.has(w.id) || !!wrongPair}
                aria-label={
                  effectivePromptMode === 'audio'
                    ? t('game.playPrompt', { number: promptNumberById.get(w.id) ?? '' }).trim()
                    : undefined
                }
              >
                {effectivePromptMode === 'audio'
                  ? `🔊`
                  : getWordTextBySide(w, textModePromptSide)}
              </button>
            );
          })}
        </div>
        <div className="game-match-col">
          {rightOrder.map(w => {
            const state = getRightState(w.id);
            return (
              <button
                key={w.id}
                type="button"
                className={`game-match-btn game-match-btn--${state}${getMatchColorClass(w.id, state)}`}
                onClick={() => handleRight(w.id)}
                disabled={matched.has(w.id) || !!wrongPair}
              >
                {getWordTextBySide(w, textModeAnswerSide)}
              </button>
            );
          })}
        </div>
      </div>

      {isComplete ? (
        <div className="game-feedback game-feedback--exact">✓ {t('game.allMatched')}</div>
      ) : (
        <div className="min-h-[44px]" aria-hidden="true" />
      )}
    </article>
  );
}
