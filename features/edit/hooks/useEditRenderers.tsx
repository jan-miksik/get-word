'use client';

import { useCallback } from 'react';
import { EditableWordCard } from '@/components/EditableWordCard';
import type { Word } from '@/data/words';
import type { ProgressData } from '@/lib/sync';
import type { NormalizedWord } from '@/lib/words';

interface UseEditRenderersOptions {
  progress: Record<string, ProgressData>;
  role: 'cz' | 'vi';
  getWordDisplayMode: (wordId: string) => 0 | 1;
  showAll: boolean;
  getMemoryHook: (wordId: string) => string;
  getSuggestedMemoryHook: (word: NormalizedWord) => string;
  markKnown: (wordId: string) => void;
  markReallyKnown: (wordId: string) => void;
  markUnknown: (wordId: string) => void;
  setMemoryHook: (wordId: string, hook: string) => void;
  lastMovedId: string | null;
  handleWordFieldChange: (wordId: string, field: keyof Word, value: string | string[]) => void;
  handleCategoryToggle: (wordId: string, category: string) => void;
  handleCategoryAdd: (wordId: string, category: string) => void;
  handleCategoryRemove: (wordId: string, category: string) => void;
  showEnglish: boolean;
  showCategoryBadges: boolean;
  categoryOrder: string[];
  shouldRenderMemoryHook: (wordId: string) => boolean;
}

export function useEditRenderers({
  progress,
  role,
  getWordDisplayMode,
  showAll,
  getMemoryHook,
  getSuggestedMemoryHook,
  markKnown,
  markReallyKnown,
  markUnknown,
  setMemoryHook,
  lastMovedId,
  handleWordFieldChange,
  handleCategoryToggle,
  handleCategoryAdd,
  handleCategoryRemove,
  showEnglish,
  showCategoryBadges,
  categoryOrder,
  shouldRenderMemoryHook,
}: UseEditRenderersOptions) {
  const renderEditableCard = useCallback((word: NormalizedWord, _stageIndex?: number) => {
    const prog = progress[word.id] || { stageIndex: 0, knownCount: 0, unknownCount: 0 };
    return (
      <div key={word.id} className="pt-1">
        <EditableWordCard
          word={word}
          progress={prog}
          role={role}
          modeIndex={getWordDisplayMode(word.id)}
          showAll={showAll}
          memoryHook={getMemoryHook(word.id)}
          suggestedHook={getSuggestedMemoryHook(word)}
          onKnown={() => markKnown(word.id)}
          onReallyKnown={() => markReallyKnown(word.id)}
          onUnknown={() => markUnknown(word.id)}
          onMemoryHookChange={(hook) => setMemoryHook(word.id, hook)}
          isMoved={lastMovedId === word.id}
          onWordChange={(wordId, field, value) => handleWordFieldChange(wordId, field, value)}
          onCategoryToggle={(category) => handleCategoryToggle(word.id, category)}
          onCategoryAdd={(category) => handleCategoryAdd(word.id, category)}
          onCategoryRemove={(category) => handleCategoryRemove(word.id, category)}
          showEnglish={showEnglish}
          showCategoryBadges={showCategoryBadges}
          categoryOrder={categoryOrder}
          showMemoryHook={shouldRenderMemoryHook(word.id)}
        />
      </div>
    );
  }, [progress, role, getWordDisplayMode, showAll, getMemoryHook, getSuggestedMemoryHook, markKnown, markReallyKnown, markUnknown, setMemoryHook, lastMovedId, handleWordFieldChange, handleCategoryToggle, handleCategoryAdd, handleCategoryRemove, showEnglish, showCategoryBadges, categoryOrder, shouldRenderMemoryHook]);

  return {
    renderEditableCard,
  };
}
