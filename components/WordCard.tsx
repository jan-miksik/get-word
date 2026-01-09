'use client';

import { useState, useRef, useEffect } from 'react';
import { NormalizedWord } from '@/lib/words';
import { ProgressData } from '@/lib/storage';

interface WordCardProps {
  word: NormalizedWord;
  index: number;
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
}

export function WordCard({
  word,
  index,
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
}: WordCardProps) {
  const [editingHook, setEditingHook] = useState(false);
  const [hookValue, setHookValue] = useState(memoryHook);
  const [isMounted, setIsMounted] = useState(false);
  const hookInputRef = useRef<HTMLInputElement>(null);
  const hookDisplayRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setHookValue(memoryHook);
  }, [memoryHook]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Determine which languages should be covered
  const shouldCover = (lang: string): boolean => {
    if (showAll) return false;
    if (lang === 'memory-hook') return !showAll;
    
    if (role === 'cz') {
      if (modeIndex === 0) {
        return lang === 'vi' || lang === 'memory-hook';
      } else {
        return lang === 'cz' || lang === 'en';
      }
    } else {
      if (modeIndex === 0) {
        return lang === 'cz';
      } else {
        return lang === 'vi' || lang === 'en' || lang === 'memory-hook';
      }
    }
  };

  const shouldShowPron = (langKey: 'cz' | 'vi') => {
    return (langKey === 'cz' && role === 'vi') || (langKey === 'vi' && role === 'cz');
  };

  // Audio playback
  const playAudio = (src: string | string[]) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      const audioSrc = Array.isArray(src) ? src[0] : src;
      audioRef.current = new Audio(audioSrc);
      audioRef.current.play().catch(() => {});
    } catch {}
  };

  // Helper to normalize audio paths for Next.js (add leading slash if needed)
  const normalizeAudioPath = (path: string | string[]): string => {
    const pathStr = Array.isArray(path) ? path[0] : path;
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

  // Format remaining time
  const formatRemaining = (ms: number) => {
    if (ms <= 0) return 'ready now';
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) return `${seconds}s`;
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  // Only calculate time-based values on client to avoid hydration mismatches
  const isDue = isMounted && progress.nextDueAt ? Date.now() >= progress.nextDueAt : false;
  const showCountdown = isMounted && progress.stageIndex > 0 && progress.nextDueAt && !isDue;

  // Get categories to display (exclude "to fix" unless in edit mode)
  const displayCategories = word.category?.filter(
    (cat) => cat !== 'to fix' || isEditMode
  ) || [];

  // In edit mode, always show category badges; otherwise use the setting
  const shouldShowCategoryBadges = isEditMode || showCategoryBadges;

  return (
    <article className={`phrase-card ${isMoved ? 'card-moved' : ''}`} data-index={index}>
      {/* Category badges */}
      {shouldShowCategoryBadges && displayCategories.length > 0 && (
        <div className="word-categories">
          {displayCategories.map((cat) => {
            // Convert category name to valid CSS class (replace spaces with hyphens)
            const cssClass = cat.replace(/\s+/g, '-');
            return (
              <span
                key={cat}
                className={`word-category-badge word-category-${cssClass} ${isEditMode && onCategoryToggle ? 'word-category-editable' : ''}`}
                onClick={isEditMode && onCategoryToggle ? (e) => {
                  e.stopPropagation();
                  onCategoryToggle(cat);
                } : undefined}
                style={isEditMode && onCategoryToggle ? { cursor: 'pointer' } : undefined}
              >
                {cat}
              </span>
            );
          })}
        </div>
      )}
      <div className="phrase-languages">
        {/* Czech */}
        <div className="phrase-row">
          <div className="lang-label">CZ</div>
          <div className="lang-value">
            <div
              className={`cover-target ${shouldCover('cz') ? 'is-covered' : ''}`}
              data-lang="cz"
            >
              <span className="lang-text">
                <span>{word.cz}</span>
                {word.czPron && shouldShowPron('cz') && (
                  <span className="pron-hint">{word.czPron}</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* English */}
        {showEnglish && (
          <div className="phrase-row">
            <div className="lang-label">EN</div>
            <div className="lang-value">
              <div
                className={`cover-target ${shouldCover('en') ? 'is-covered' : ''}`}
                data-lang="en"
              >
                <span className="lang-text">{word.en}</span>
              </div>
            </div>
          </div>
        )}

        {/* Vietnamese */}
        <div className="phrase-row">
          <div className="lang-label">VI</div>
          <div className="lang-value">
            <div
              className={`cover-target ${shouldCover('vi') ? 'is-covered' : ''}`}
              data-lang="vi"
            >
              <span className="lang-text">
                <span>{word.vi}</span>
                {word.viPron && shouldShowPron('vi') && (
                  <span className="pron-hint">{word.viPron}</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Memory Hook */}
      <div className={`memory-hook-container ${editingHook ? 'editing' : ''}`}>
        <div
          ref={hookDisplayRef}
          className={`memory-hook-display cover-target ${shouldCover('memory-hook') ? 'is-covered' : ''}`}
          data-lang="memory-hook"
          onDoubleClick={startEditing}
          onClick={() => !memoryHook && !shouldCover('memory-hook') && startEditing()}
        >
          <span className={`memory-hook-text ${!memoryHook ? 'placeholder' : ''}`}>
            {displayHook}
          </span>
        </div>
        <input
          ref={hookInputRef}
          type="text"
          className="memory-hook-input"
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
          style={{ display: editingHook ? 'block' : 'none' }}
        />
      </div>

      {/* Countdown */}
      {showCountdown && (
        <div className="countdown" data-next-due-at={progress.nextDueAt}>
          <span className="countdown-dot"></span>
          <span className="countdown-label">
            {formatRemaining(progress.nextDueAt! - Date.now())}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="progress-actions">
        <button
          type="button"
          className="progress-btn unknown"
          onClick={onUnknown}
        >
          ✖ <span className="count">{progress.unknownCount > 0 ? `(${progress.unknownCount})` : ''}</span>
        </button>
        <button
          type="button"
          className="progress-btn known"
          onClick={onKnown}
        >
          ✔ <span className="count">{progress.knownCount > 0 ? `(${progress.knownCount})` : ''}</span>
        </button>
        {onReallyKnown && (
          <button
            type="button"
            className="progress-btn known really-known"
            onClick={onReallyKnown}
            title="Mark as really known (skip one time frame)"
          >
            ✔✔
          </button>
        )}
                {audioSrc && (
          <button
            type="button"
            className="audio-btn"
            onClick={() => playAudio(audioSrc)}
            title={role === 'vi' ? 'Play Czech audio' : 'Play Vietnamese audio'}
          >
            🔊
          </button>
        )}
      </div>
    </article>
  );
}
