'use client';

import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { getPlayableAudioUrl } from '@/lib/audio-availability';
import { NormalizedWord, STAGES } from '@/lib/words';
import { ProgressData } from '@/lib/sync';
import { SpeakerIcon } from '@/components/icons/SpeakerIcon';

function formatInterval(ms: number): string {
  if (ms <= 0) return '';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

function formatNextReviewHint(intervalMs: number): string {
  const label = formatInterval(intervalMs);
  return label ? `Repeat in ${label}` : 'Repeat now';
}

interface WordCardProps {
  word: NormalizedWord;
  progress: ProgressData;
  role: 'cz' | 'vi';
  modeIndex: number;
  showAll: boolean;
  memoryHook: string;
  suggestedHook: string;
  onKnown: () => void;
  onReallyKnown?: () => void;
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
  fullscreen?: boolean;
}

function RevealHint() {
  return (
    <span
      aria-hidden="true"
      className="reveal-hint pointer-events-none absolute inset-x-[-0.625rem] inset-y-[-0.1875rem] z-[3] flex items-center justify-center rounded-xl transition-[opacity,transform] duration-500 ease-out"
    >
      <span className="reveal-hint__label text-[0.6rem] font-bold uppercase tracking-[0.13em] text-[#6b5e48]">
        Tap to reveal
      </span>
    </span>
  );
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
  fullscreen = false,
}: WordCardProps) {
  const [editingHook, setEditingHook] = useState(false);
  const [hookValue, setHookValue] = useState(memoryHook);
  const hookInputRef = useRef<HTMLInputElement>(null);
  const hookDisplayRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setHookValue(memoryHook);
  }, [memoryHook]);

  useEffect(() => {
    if (!showMemoryHook) setEditingHook(false);
  }, [showMemoryHook]);

  const knownPresses = progress.knownCount ?? 0;
  const unknownPresses = progress.unknownCount ?? 0;
  const totalInteractions = knownPresses + unknownPresses;
  const isFirstSeen = totalInteractions === 0;

  // Determine which languages should be covered.
  const shouldCover = (lang: string): boolean => {
    if (showAll) return false;
    // First time seeing this word: show everything without cover.
    if (isFirstSeen) return false;
    if (lang === 'memory-hook') {
      if (!showMemoryHook) return false;
      const diff = (progress.knownCount ?? 0) - (progress.unknownCount ?? 0);
      return diff >= 5;
    }

    if (role === 'cz') {
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

  const shouldShowPron = (langKey: 'cz' | 'vi') => {
    return (langKey === 'cz' && role === 'vi') || (langKey === 'vi' && role === 'cz');
  };

  // Audio playback
  const playAudio = (src: string | string[]) => {
    void (async () => {
      const audioSrc = Array.isArray(src) ? src[0] : src;
      const playableUrl = await getPlayableAudioUrl(audioSrc);
      if (!playableUrl) return;

      try {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
        audioRef.current = new Audio(playableUrl);
        audioRef.current.play().catch(() => {});
      } catch {}
    })();
  };

  // Helper to normalize audio paths for Next.js (add leading slash if needed)
  const normalizeAudioPath = (path: string | string[]): string => {
    const pathStr = Array.isArray(path) ? path[0] : path;
    if (/^(?:https?:|blob:|data:)/i.test(pathStr)) return pathStr;
    // Ensure path starts with / for Next.js public directory
    // Paths in data are like "speech/cz/file.mp3", need to be "/speech/cz/file.mp3"
    return pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
  };

  // Get audio source for current role
  const getAudioSrc = (): string | null => {
    if (role === 'vi' && word.czAudio) {
      return normalizeAudioPath(word.czAudio);
    } else if (role === 'cz' && word.viAudio) {
      return normalizeAudioPath(word.viAudio);
    }
    return null;
  };

  const audioSrc = getAudioSrc();
  const shouldRenderMemoryHook = showMemoryHook;

  // Scroll the focused input into view after the keyboard finishes opening
  useEffect(() => {
    if (!editingHook || typeof window === 'undefined') return;
    const el = hookInputRef.current;
    if (!el) return;

    const scrollIntoCenter = () => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // visualViewport fires when the keyboard opens/resizes on mobile
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', scrollIntoCenter);
      return () => vv.removeEventListener('resize', scrollIntoCenter);
    }
    // Fallback: scroll after a short delay on browsers without visualViewport
    const t = setTimeout(scrollIntoCenter, 350);
    return () => clearTimeout(t);
  }, [editingHook]);

  // Memory hook editing
  const startEditing = () => {
    setEditingHook(true);
    setTimeout(() => hookInputRef.current?.focus(), 0);
  };

  const finishEditing = () => {
    setEditingHook(false);
    onMemoryHookChange(hookValue);
  };

  const cancelEditing = () => {
    setEditingHook(false);
    setHookValue(memoryHook);
  };

  const displayHook = memoryHook || (suggestedHook ? `💡 ${suggestedHook}` : '💭 Add memory hook...');

  // Stage index / group
  const stageIndex = progress.stageIndex || 0;
  const clampedStageIndex = Math.max(0, Math.min(stageIndex, STAGES.length - 1));
  const stageGroup =
    clampedStageIndex === 0 ? 'new' :
    clampedStageIndex <= 3 ? 'fresh' :
    clampedStageIndex <= 6 ? 'learning' :
    clampedStageIndex <= 8 ? 'seasoned' :
    'mastered';

  // Get categories to display (exclude "to fix" unless in edit mode)
  const displayCategories = word.category?.filter(
    (cat) => cat !== 'to fix' || isEditMode
  ) || [];

  const orderedDisplayCategories = useMemo(() => {
    if (!Array.isArray(displayCategories) || displayCategories.length === 0) return [];
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
  }, [displayCategories, categoryOrder]);

  // In edit mode, always show category badges; otherwise use the setting
  const shouldShowCategoryBadges = isEditMode || showCategoryBadges;
  const forgotHint = formatNextReviewHint(STAGES[Math.max(clampedStageIndex - 1, 0)]?.intervalMs ?? 0);
  const okayHint = formatNextReviewHint(
    STAGES[Math.min(clampedStageIndex + 1, STAGES.length - 1)]?.intervalMs ?? 0
  );
  const easyHint = formatNextReviewHint(
    STAGES[Math.min(clampedStageIndex + 2, STAGES.length - 1)]?.intervalMs ?? 0
  );
  const coverCz = shouldCover('cz');
  const coverEn = shouldCover('en');
  const coverVi = shouldCover('vi');
  const coverMemoryHook = shouldCover('memory-hook');

  return (
    <article className={`phrase-card ${isMoved ? 'card-moved' : ''} ${fullscreen ? 'word-card--fullscreen' : ''}`} data-word-id={word.id} data-stage-group={stageGroup}>
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
      <div className={`word-card-content flex flex-col gap-4 ${editingHook ? 'word-card-content--editing-hook' : ''}`}>
        {/* Czech */}
        <div className="flex justify-center items-center gap-1.5">
          <div className="hidden">CZ</div>
          <div className="flex-none w-full text-center text-[0.98rem] font-medium leading-[1.35] sm:text-[1.02rem]">
            <div
              className={`cover-target relative cursor-pointer touch-manipulation select-none max-sm:w-full ${coverCz ? 'is-covered' : ''}`}
              data-lang="cz"
            >
              <span className="lang-text inline-block relative min-h-[1.4em]">
                <span>{word.cz}</span>
                {showPronunciation && word.czPron && shouldShowPron('cz') && (
                  <span className="text-[1.1rem] sm:text-[1.5rem] text-inherit opacity-70 ml-1.5">{word.czPron}</span>
                )}
              </span>
              {coverCz && <RevealHint />}
            </div>
          </div>
        </div>

        {/* English */}
        {showEnglish && (
          <div className="flex justify-center items-center gap-1.5">
            <div className="hidden">EN</div>
            <div className="flex-none w-full text-center text-[0.98rem] font-medium leading-[1.35] sm:text-[1.02rem]">
              <div
                className={`cover-target relative cursor-pointer touch-manipulation select-none max-sm:w-full ${coverEn ? 'is-covered' : ''}`}
                data-lang="en"
              >
                <span className="lang-text inline-block relative min-h-[1.4em]">{word.en}</span>
                {coverEn && <RevealHint />}
              </div>
            </div>
          </div>
        )}

        {/* Vietnamese */}
        <div className="flex justify-center items-center gap-1.5">
          <div className="hidden">VI</div>
          <div className="flex-none w-full text-center text-[0.98rem] font-medium leading-[1.35] sm:text-[1.02rem]">
            <div
              className={`cover-target relative cursor-pointer touch-manipulation select-none max-sm:w-full ${coverVi ? 'is-covered' : ''}`}
              data-lang="vi"
            >
              <span className="lang-text inline-block relative min-h-[1.4em]">
                <span>{word.vi}</span>
                {showPronunciation && word.viPron && shouldShowPron('vi') && (
                  <span className="text-[1.1rem] sm:text-[1.5rem] text-inherit opacity-70 ml-1.5">{word.viPron}</span>
                )}
              </span>
              {coverVi && <RevealHint />}
            </div>
          </div>
        </div>

      {/* Memory Hook */}
      {shouldRenderMemoryHook && (
        <div className={`memory-hook-container mt-2 mb-1 ${editingHook ? 'editing' : ''}`}>
          <div
            ref={hookDisplayRef}
            className={`memory-hook-display cover-target relative cursor-pointer touch-manipulation select-none max-sm:w-full !text-[#2A2218] hover:!bg-[#2A2218]/5 ${coverMemoryHook ? 'is-covered' : ''}`}
            data-lang="memory-hook"
            onDoubleClick={startEditing}
            onClick={() => !memoryHook && !coverMemoryHook && startEditing()}
          >
            <span className={`memory-hook-text relative inline-block min-h-[1.4em] ${!memoryHook ? 'opacity-60 italic' : ''}`}>
              {displayHook}
            </span>
            {coverMemoryHook && <RevealHint />}
          </div>
          <input
            ref={hookInputRef}
            type="text"
            className={`memory-hook-input ${editingHook ? 'block' : 'hidden'} !border-2 !border-[#2A2218] !bg-[#F4EFE2] !text-[#2A2218] placeholder:!text-[#2A2218]/50 focus:!border-[#1E6FA8] focus:!shadow-none`}
            placeholder="Enter memory hook..."
            value={hookValue}
            onChange={(e) => setHookValue(e.target.value)}
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

      {/* Actions */}
      <div className="card-actions relative mt-8">
        {audioSrc && (
          <button
            type="button"
            className="audio-btn audio-btn--floating !h-16 !min-h-16 !w-16 !min-w-16 !rounded-full !border-2 !border-[#2A2218] !bg-[#F4EFE2] !text-[#2A2218] !shadow-none hover:!bg-[#1E6FA8] hover:!border-[#1E6FA8] hover:!text-[#F4EFE2] active:!bg-[#1E6FA8] active:!border-[#1E6FA8] active:!text-[#F4EFE2]"
            onClick={() => playAudio(audioSrc)}
            title={role === 'vi' ? 'Play Czech audio' : 'Play Vietnamese audio'}
            aria-label="Play audio"
          >
            <SpeakerIcon size={23} />
          </button>
        )}
        <div className={`card-actions-row ${onReallyKnown ? 'card-actions-row--three' : 'card-actions-row--two'}`}>
          <button
            type="button"
            className="srs-btn srs-btn--forgot !relative !border-[#ae6161] !opacity-80"
            onClick={onUnknown}
            title={`${forgotHint} · ${unknownPresses} forgotten`}
          >
            {unknownPresses > 0 && (
              <span
                aria-label={`${unknownPresses} forgotten`}
                className="absolute top-1.5 right-1.5 min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-[#ae6161]/20 text-[#ae6161] text-[0.65rem] font-bold leading-none tabular-nums"
              >
                {unknownPresses}
              </span>
            )}
            <span className="srs-btn-copy">
              <span className="srs-btn-label">Forgotten</span>
              <span className="srs-btn-hint !opacity-[0.35]">{forgotHint}</span>
            </span>
          </button>
          <button
            type="button"
            className="srs-btn srs-btn--okay !relative"
            onClick={onKnown}
            title={`${okayHint} · ${knownPresses} known`}
          >
            {knownPresses > 0 && (
              <span
                aria-label={`${knownPresses} known`}
                className="absolute top-1.5 right-1.5 min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-[#1E6FA8]/20 text-[#1E6FA8] text-[0.65rem] font-bold leading-none tabular-nums"
              >
                {knownPresses}
              </span>
            )}
            <span className="srs-btn-copy">
              <span className="srs-btn-label">OK</span>
              <span className="srs-btn-hint !opacity-[0.35]">{okayHint}</span>
            </span>
          </button>
          {onReallyKnown && (
            <button
              type="button"
              className="srs-btn srs-btn--easy !relative !border-[#12750f]"
              onClick={onReallyKnown}
              title={easyHint}
            >
              <span className="srs-btn-copy">
                <span className="srs-btn-label">Easy</span>
                <span className="srs-btn-hint !opacity-[0.35]">{easyHint}</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
});
