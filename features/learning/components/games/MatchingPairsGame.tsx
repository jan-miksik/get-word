'use client';

import { Fragment, useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
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
import { CardTopControls } from '../CardTopControls';
import { useCardAudio } from '../card-audio/useCardAudio';
import { SuccessMarkSlot } from './SuccessMark';
import { StudyOptionButton, type StudyOptionMatchColor } from './StudyOptionButton';
import { shuffleGameItems } from '@/features/learning/minigames';
import type { SimilarityBand } from '@/features/learning/minigames/similarity';

interface Props {
  /** One button pair per word; 2–6 depending on the variant. */
  words: NormalizedWord[];
  role: LearningRole;
  sourceLang?: WordSide;
  promptMode?: PromptMode;
  soundEnabled?: boolean;
  level?: 1 | 2;
  /** Accepted for the shared minigame prop shape; the round has no difficulty tell of its own. */
  difficultyBand?: SimilarityBand;
  /**
   * Accepted so the shared minigame props stay one shape, and deliberately not
   * shown: a matching round is a whole board of words at different stages, so a
   * single stage badge would be describing one of them at random.
   */
  stageIndex?: number;
  onResult?: (delta: number) => void;
  /** Card-level controls (the sound toggle) that share the card's top lane. */
  topControls?: ReactNode;
  /** Drop the outer card frame so the round reads as part of the study flow. */
  frameless?: boolean;
}

type MatchState = 'idle' | 'selected' | 'matched' | 'wrong';
type MatchColor = StudyOptionMatchColor;
const MATCH_COLOR_COUNT = 6;

export function MatchingPairsGame({
  words,
  role,
  sourceLang,
  promptMode = 'text',
  soundEnabled = false,
  onResult,
  topControls,
  frameless = false,
}: Props) {
  const { t } = useI18n();
  const [rightOrderIds] = useState(() => shuffleGameItems(words.map((word) => word.id)));
  const rightOrder = useMemo(
    () => rightOrderIds
      .map((id) => words.find((word) => word.id === id))
      .filter((word): word is NormalizedWord => Boolean(word)),
    [rightOrderIds, words],
  );

  const [leftSelected, setLeftSelected] = useState<string | null>(null);
  const [rightSelected, setRightSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [matchColors, setMatchColors] = useState<Map<string, MatchColor>>(() => new Map());
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null);
  const [hasAudioPlaybackError, setHasAudioPlaybackError] = useState(false);
  const { play, playAuto } = useCardAudio();

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
      // One point per correct answer, whatever the difficulty level: the
      // score counts answers, not how hard they were.
      onResult?.(1);
    }
  }, [isComplete, onResult]);

  const attempt = (lId: string, rId: string) => {
    if (lId === rId) {
      if (soundEnabled) {
        void playAuto(learningAudioByWordId.get(lId) ?? []);
      }
      setMatchColors(prev => {
        if (prev.has(lId)) return prev;
        const next = new Map(prev);
        const nextColor = ((prev.size % MATCH_COLOR_COUNT) + 1) as MatchColor;
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

  const playPrompt = async (id: string) => {
    const result = await play(audioByWordId.get(id) ?? null);
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

  return (
    <article
      className={`phrase-card game-card game-card--matching${frameless ? ' game-card--bare' : ''}`}
    >
      <CardTopControls>{topControls}</CardTopControls>
      <SuccessMarkSlot show={isComplete} label={t('game.allMatched')} rollKey={words[0]?.id} />
      {frameless ? (
        // Same quiet heading the assembly round uses. The bordered pill only
        // makes sense inside a bordered card.
        <p className="m-0 text-center text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">
          {t('game.match')}
        </p>
      ) : (
        <div className="game-badge">🔗 {t('game.match')}</div>
      )}

      {/* One grid rather than two stacked columns: a wrapped phrase used to make
          its own column taller than the other, so the two halves of a row drifted
          out of line and the board looked broken. Grid rows size together. */}
      <div className="mx-auto mt-4 grid w-full max-w-3xl grid-cols-2 gap-3 sm:mt-8 sm:gap-4">
        {words.map((word, index) => {
          const right = rightOrder[index];
          const leftState = getLeftState(word.id);
          const rightState = right ? getRightState(right.id) : 'idle';
          return (
            <Fragment key={word.id}>
              <StudyOptionButton
                state={leftState}
                size="sm"
                matchColor={leftState === 'matched' ? matchColors.get(word.id) : undefined}
                matchEdge="right"
                onClick={() => handleLeft(word.id)}
                disabled={matched.has(word.id) || !!wrongPair}
                ariaLabel={
                  effectivePromptMode === 'audio'
                    ? t('game.playPrompt', { number: promptNumberById.get(word.id) ?? '' }).trim()
                    : undefined
                }
              >
                {effectivePromptMode === 'audio'
                  ? `🔊`
                  : getWordTextBySide(word, textModePromptSide)}
              </StudyOptionButton>
              {right ? (
                <StudyOptionButton
                  state={rightState}
                  size="sm"
                  matchColor={rightState === 'matched' ? matchColors.get(right.id) : undefined}
                  matchEdge="left"
                  onClick={() => handleRight(right.id)}
                  disabled={matched.has(right.id) || !!wrongPair}
                >
                  {getWordTextBySide(right, textModeAnswerSide)}
                </StudyOptionButton>
              ) : null}
            </Fragment>
          );
        })}
      </div>

      {/* The success mark above already says the round is over; a second
          "all matched" line underneath only repeated it. The reserved height
          stays so finishing a round does not shift the board. */}
      <div className="min-h-[44px]" aria-hidden="true" />
    </article>
  );
}
