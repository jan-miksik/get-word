'use client';

import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { playUserInitiatedAudio } from '@/lib/audio-playback';
import { NormalizedWord, STAGES, shouldMinimizeStudyNoteForStage } from '@/lib/words';
import type { ProgressData } from '@/features/sync/types';
import { SpeakerIcon } from '@/components/icons/SpeakerIcon';
import { useI18n } from '@/components/I18nProvider';
import { useOptionalAppStateContext } from '@/context/AppStateContext';
import type { LearningRole } from '@/features/learning/state/learningRole';
import { RevealHint } from './word-card/RevealHint';
import { LanguageRow } from './word-card/LanguageRow';
import { CustomStagePopover } from './word-card/CustomStagePopover';
import { CommentBlock } from './word-card/CommentBlock';
import {
  formatNextReviewHint,
  getLearningAudioSrc,
  getWordTextSize,
} from './word-card/helpers';
import {
  limitMemoryHookLength,
  MEMORY_HOOK_MAX_LENGTH,
} from '@/features/learning/state/memoryHooks';

interface WordCardProps {
  word: NormalizedWord;
  progress: ProgressData;
  role: LearningRole;
  modeIndex: number;
  showAll: boolean;
  memoryHook: string;
  suggestedHook: string;
  onKnown: () => void;
  onReallyKnown?: () => void;
  onCustomStage?: (stageIndex: number, opts?: { noRepeat?: boolean }) => void;
  onUnknown: () => void;
  onMemoryHookChange: (hook: string) => void;
  isMoved?: boolean;
  isEditMode?: boolean;
  onCategoryToggle?: (category: string) => void;
  showEnglish?: boolean;
  showCategoryBadges?: boolean;
  showPronunciation?: boolean;
  categoryOrder?: string[];
  showMemoryHook?: boolean;
  studyNotesEnabled?: boolean;
  studyNoteMinimizeFromStage?: number;
  fullscreen?: boolean;
  mobileCustomActionOnly?: boolean;
}

export const WordCard = memo(function WordCard({
  word,
  progress,
  role,
  modeIndex,
  showAll,
  memoryHook,
  suggestedHook,
  onKnown,
  onReallyKnown,
  onCustomStage,
  onUnknown,
  onMemoryHookChange,
  isMoved,
  isEditMode = false,
  onCategoryToggle,
  showEnglish = true,
  showCategoryBadges = false,
  showPronunciation = false,
  categoryOrder,
  showMemoryHook = true,
  studyNotesEnabled = false,
  studyNoteMinimizeFromStage,
  fullscreen = false,
  mobileCustomActionOnly = false,
}: WordCardProps) {
  const { t } = useI18n();
  const revealMode = useOptionalAppStateContext()?.revealMode ?? 'scratch';
  const [editingHook, setEditingHook] = useState(false);
  const [hookValue, setHookValue] = useState(memoryHook);
  const hookInputRef = useRef<HTMLInputElement>(null);
  const hookDisplayRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [slowPlayback, setSlowPlayback] = useState(false);

  useEffect(() => {
    setHookValue(memoryHook);
  }, [memoryHook]);

  useEffect(() => {
    setSlowPlayback(false);
  }, [word.id]);

  useEffect(() => {
    if (!showMemoryHook) setEditingHook(false);
  }, [showMemoryHook]);

  const knownPresses = progress.knownCount ?? 0;
  const unknownPresses = progress.unknownCount ?? 0;

  // Determine which languages should be covered.
  const shouldCover = (lang: string): boolean => {
    if (showAll) return false;
    // New words are covered too: scratching lets the learner self-assess how
    // well they already know a word from the first encounter, and it surfaces
    // the scratch interaction on the very first card.
    if (lang === 'memory-hook') {
      if (!showMemoryHook) return false;
      const diff = (progress.knownCount ?? 0) - (progress.unknownCount ?? 0);
      return diff >= 5;
    }

    // 'knownLanguage' (old 'cz'): user knows the from-side (cz), so the
    // unknown side they're studying is 'vi' on the front, and the answer
    // reveal shows 'cz' (+ 'en' helper text).
    if (role === 'knownLanguage') {
      if (modeIndex === 0) {
        return lang === 'vi';
      } else {
        return lang === 'cz' || lang === 'en';
      }
    } else {
      if (modeIndex === 0) {
        return lang === 'cz';
      } else {
        return lang === 'vi' || lang === 'en';
      }
    }
  };

  // Show pronunciation for whichever side the user is LEARNING (the side they
  // need help pronouncing). 'knownLanguage' → learning the 'vi' side, etc.
  const shouldShowPron = (langKey: 'cz' | 'vi') => {
    return (
      (langKey === 'cz' && role === 'languageToLearn') ||
      (langKey === 'vi' && role === 'knownLanguage')
    );
  };

  const playAudio = (src: string | string[]) => {
    void playUserInitiatedAudio(audioRef, src).then(({ ok, rate }) => {
      const isSlow = ok && rate < 1;
      setSlowPlayback(isSlow);
      if (!isSlow) return;
      audioRef.current?.addEventListener(
        'ended',
        () => setSlowPlayback(false),
        { once: true },
      );
    });
  };

  const audioSrc = getLearningAudioSrc(role, word);
  const shouldRenderMemoryHook = showMemoryHook;

  // Nothing scrolls the field into view from here. `useVisualViewportHeight`
  // sizes the shell to the area the keyboard leaves, so the card — hook row
  // included — is laid out inside it and is already in view. The centring
  // `scrollIntoView` that used to run on every keyboard resize centred the
  // field in a *container* that still ran under the keyboard, which is what
  // threw it up near the top of the screen the moment typing began.

  // Memory hook editing
  const startEditing = () => {
    setEditingHook(true);
    // Focus synchronously within the tap gesture so iOS opens the keyboard on
    // the first tap. The input is hidden via opacity (not display:none), which
    // keeps it focusable here.
    hookInputRef.current?.focus();
  };

  const finishEditing = () => {
    setEditingHook(false);
    onMemoryHookChange(hookValue);
  };

  const cancelEditing = () => {
    setEditingHook(false);
    setHookValue(memoryHook);
  };

  const isMobileLayout = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(max-width: 767px)').matches === true;

  // A single tap opened the editor too easily on touch layouts (stray taps
  // started typing over the hook), so mobile needs a quick double tap. The
  // dblclick event is unreliable on touch, hence the manual timestamp check.
  const lastHookTapAtRef = useRef(0);
  const handleHookTap = () => {
    if (!isMobileLayout()) {
      if (!memoryHook) startEditing();
      return;
    }
    const isSecondTap = Date.now() - lastHookTapAtRef.current < 350;
    lastHookTapAtRef.current = Date.now();
    if (isSecondTap) startEditing();
  };

  const displayHook = memoryHook || (suggestedHook ? `💡 ${suggestedHook}` : `💭 ${t('card.memoryHookPlaceholder')}`);

  // Stage index / group
  const stageIndex = progress.stageIndex || 0;
  const clampedStageIndex = Math.max(0, Math.min(stageIndex, STAGES.length - 1));
  const stageGroup =
    clampedStageIndex === 0 ? 'new' :
    clampedStageIndex <= 2 ? 'fresh' :
    clampedStageIndex <= 5 ? 'learning' :
    clampedStageIndex <= 6 ? 'seasoned' :
    'mastered';
  const hasCustomStageActions = Boolean(onCustomStage || onReallyKnown);
  const useMobileCustomActionOnly = mobileCustomActionOnly && hasCustomStageActions;

  const orderedDisplayCategories = useMemo(() => {
    const displayCategories = word.category?.filter(
      (category) => category !== 'to fix' || isEditMode,
    ) ?? [];
    if (displayCategories.length === 0) return [];
    const order = Array.isArray(categoryOrder) ? categoryOrder : [];
    if (order.length === 0) return displayCategories;
    const orderIndex = new Map<string, number>();
    order.forEach((name, i) => orderIndex.set(name, i));
    const originalIndex = new Map<string, number>();
    displayCategories.forEach((name, i) => originalIndex.set(name, i));

    return [...displayCategories].sort((a, b) => {
      const ai = orderIndex.get(a);
      const bi = orderIndex.get(b);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
    });
  }, [categoryOrder, isEditMode, word.category]);

  // In edit mode, always show category badges; otherwise use the setting
  const shouldShowCategoryBadges = isEditMode || showCategoryBadges;
  const forgotHint = formatNextReviewHint(STAGES[Math.max(clampedStageIndex - 1, 0)]?.intervalMs ?? 0, t);
  const okayHint = formatNextReviewHint(
    STAGES[Math.min(clampedStageIndex + 1, STAGES.length - 1)]?.intervalMs ?? 0,
    t,
  );
  // While editing the memory hook, keep the answer covered so the "tap to
  // reveal" hint stays visible — the user can still tap to reveal on demand
  // rather than having the answer spoiled automatically.
  const coverCz = shouldCover('cz');
  const coverEn = shouldCover('en');
  const coverVi = shouldCover('vi');
  // Scratch mode covers the word answers via a canvas overlay; the memory hook
  // (which also doubles as a click-to-edit field) is left uncovered there.
  const coverMemoryHook = revealMode === 'scratch' ? false : shouldCover('memory-hook');

  const cardMaxTextLen = Math.max(
    word.cz?.length ?? 0,
    showEnglish ? (word.en?.length ?? 0) : 0,
    word.vi?.length ?? 0,
  );
  const cardTextSizeClass = getWordTextSize(cardMaxTextLen);
  return (
    <article
      className={`phrase-card ${isMoved ? 'card-moved' : ''} ${fullscreen ? 'word-card--fullscreen' : ''} ${editingHook ? 'word-card--editing-hook' : ''}`}
      data-word-id={word.id}
      data-stage-group={stageGroup}
    >
      {/* Category badges */}
      {shouldShowCategoryBadges && orderedDisplayCategories.length > 0 && (
        <div className="word-categories">
          {orderedDisplayCategories.map((cat) => {
            // Convert category name to valid CSS class (replace spaces with hyphens)
            const cssClass = cat.replace(/\s+/g, '-');
            return (
              <span
                key={cat}
                className={`word-category-badge word-category-${cssClass} ${isEditMode && onCategoryToggle ? 'cursor-pointer' : ''}`}
                onClick={isEditMode && onCategoryToggle ? (e) => {
                  e.stopPropagation();
                  onCategoryToggle(cat);
                } : undefined}
              >
                {cat}
              </span>
            );
          })}
        </div>
      )}
      <div className="word-card-content flex flex-col gap-4">
        <LanguageRow hiddenLabel="CZ" lang="cz" covered={coverCz} textSizeClass={cardTextSizeClass}>
          <span>{word.cz}</span>
          {showPronunciation && word.czPron && shouldShowPron('cz') && (
            <span className="text-[1.1rem] sm:text-[1.5rem] text-inherit opacity-70 ml-1.5">{word.czPron}</span>
          )}
        </LanguageRow>

        {showEnglish && (
          <LanguageRow hiddenLabel="EN" lang="en" covered={coverEn} textSizeClass={cardTextSizeClass}>
            {word.en}
          </LanguageRow>
        )}

        <LanguageRow hiddenLabel="VI" lang="vi" covered={coverVi} textSizeClass={cardTextSizeClass}>
          <span>{word.vi}</span>
          {showPronunciation && word.viPron && shouldShowPron('vi') && (
            <span className="text-[1.1rem] sm:text-[1.5rem] text-inherit opacity-70 ml-1.5">{word.viPron}</span>
          )}
        </LanguageRow>

      {/* Memory Hook */}
      {shouldRenderMemoryHook && (
        <div className={`memory-hook-container mt-2 mb-1 ${editingHook ? 'editing' : ''}`}>
          <div
            ref={hookDisplayRef}
            className={`memory-hook-display cover-target relative cursor-pointer touch-manipulation select-none max-sm:w-full !text-[#2A2218] hover:!bg-[#2A2218]/5 ${coverMemoryHook ? 'is-covered' : ''}`}
            data-lang="memory-hook"
            onDoubleClick={startEditing}
            onClick={() => {
              if (!coverMemoryHook) handleHookTap();
            }}
          >
            <span className={`memory-hook-text relative inline-block min-h-[1.4em] ${coverMemoryHook ? '[.is-pressed_&]:!text-[#2A2218]' : '!text-[#2A2218]'} ${!memoryHook ? 'opacity-60 italic' : ''}`}>
              {displayHook}
            </span>
            {coverMemoryHook && <RevealHint />}
          </div>
          <input
            ref={hookInputRef}
            type="text"
            className={`memory-hook-input !border-2 !border-[#2A2218] !bg-[#F4EFE2] !text-[#2A2218] placeholder:!text-[#2A2218]/50 focus:!border-[#1E6FA8] focus:!shadow-none`}
            placeholder={t('card.memoryHookInput')}
            value={hookValue}
            maxLength={MEMORY_HOOK_MAX_LENGTH}
            onChange={(e) => setHookValue(limitMemoryHookLength(e.target.value))}
            onBlur={finishEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                finishEditing();
              } else if (e.key === 'Escape') {
                cancelEditing();
              }
            }}
          />
        </div>
      )}
      </div>

      {/* Study note (comment) — under the memory hook, above the buttons.
          Precedence: hidden when disabled or empty; otherwise minimized once the
          card reaches the configured stage (CommentBlock applies any local
          collapse/expand override on top of that default). Not passed into
          minigames, so it never renders there. */}
      {studyNotesEnabled && word.comment && (
        <CommentBlock
          comment={word.comment}
          listId={word.listId}
          itemId={word.id}
          defaultMinimized={shouldMinimizeStudyNoteForStage(
            stageIndex,
            studyNoteMinimizeFromStage ?? 2,
          )}
        />
      )}

      {/* Actions */}
      <div className="card-actions relative mt-8">
        {audioSrc && (
          <button
            type="button"
            className="audio-btn audio-btn--floating !h-16 !min-h-16 !w-16 !min-w-16 !rounded-full !border-2 !border-[#2A2218] !bg-[#F4EFE2] !text-[#2A2218] !shadow-none hover:!bg-[#1E6FA8] hover:!border-[#1E6FA8] hover:!text-[#F4EFE2] active:!bg-[#1E6FA8] active:!border-[#1E6FA8] active:!text-[#F4EFE2]"
            onClick={() => playAudio(audioSrc)}
            title={role === 'languageToLearn' ? t('card.playCzechAudio') : t('card.playVietnameseAudio')}
            aria-label={t('card.playAudio')}
          >
            <SpeakerIcon size={23} />
            {slowPlayback && (
              <span
                className="pointer-events-none absolute -bottom-1.5 -right-1.5 text-[17px] leading-none"
                aria-hidden="true"
              >
                🐢
              </span>
            )}
          </button>
        )}
        <div
          className={[
            'card-actions-row',
            hasCustomStageActions ? 'card-actions-row--three' : 'card-actions-row--two',
            useMobileCustomActionOnly ? 'card-actions-row--mobile-custom-only' : '',
          ].join(' ')}
        >
          <button
            type="button"
            className="srs-btn srs-btn--forgot !relative !opacity-80 max-md:!pb-0"
            onClick={onUnknown}
            title={`${forgotHint} · ${unknownPresses} ${t('card.forgotten')}`}
          >
            {unknownPresses > 0 && (
              <span
                aria-label={`${unknownPresses} ${t('card.forgotten')}`}
                className="absolute top-[5px] right-[5px] min-[500px]:top-[8px] min-[500px]:right-[10px] text-[#2A2218] text-[0.7rem] font-bold leading-none tabular-nums pointer-events-none"
              >
                {unknownPresses}
              </span>
            )}
            <span className="srs-btn-copy">
              <span className="srs-btn-label">{t('card.forgotten')}</span>
              <span className="srs-btn-hint !opacity-[0.35] !whitespace-normal max-sm:!text-[0.55rem] max-sm:!leading-[1.1] max-sm:!tracking-[0.04em]">{forgotHint}</span>
            </span>
          </button>
          <button
            type="button"
            className="srs-btn srs-btn--okay !relative"
            onClick={onKnown}
            title={`${okayHint} · ${knownPresses} ${t('card.known')}`}
          >
            {knownPresses > 0 && (
              <span
                aria-label={`${knownPresses} ${t('card.known')}`}
                className="absolute top-[5px] right-[5px] min-[500px]:top-[8px] min-[500px]:right-[10px] text-[#1E6FA8] text-[0.7rem] font-bold leading-none tabular-nums pointer-events-none"
              >
                {knownPresses}
              </span>
            )}
            <span className="srs-btn-copy">
              <span className="srs-btn-label">{t('card.ok')}</span>
              <span className="srs-btn-hint !opacity-[0.35] !whitespace-normal max-sm:!text-[0.55rem] max-sm:!leading-[1.1] max-sm:!tracking-[0.04em]">{okayHint}</span>
            </span>
          </button>
          {hasCustomStageActions && (
            <CustomStagePopover
              clampedStageIndex={clampedStageIndex}
              onCustomStage={onCustomStage}
              onReallyKnown={onReallyKnown}
            />
          )}
        </div>
      </div>
    </article>
  );
});
