'use client';

import { memo, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { NormalizedWord, Word } from '@/lib/words';
import { ProgressData } from '@/lib/sync';
import type { LearningRole } from '@/features/learning/state/learningRole';
import { WordCard } from './WordCard';
import { CategoryEditButton } from './editable-word-card/CategoryEditButton';
import { EditWordModal } from './editable-word-card/EditWordModal';

export { STANDARD_CATEGORIES, EDIT_ONLY_CATEGORIES, ALL_CATEGORIES } from './editable-word-card/constants';

interface EditableWordCardProps {
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
  onWordChange: (wordId: string, field: keyof Word, value: string | string[]) => void;
  onCategoryToggle: (category: string) => void;
  onCategoryAdd: (category: string) => void;
  onCategoryRemove: (category: string) => void;
  showEnglish?: boolean;
  showCategoryBadges?: boolean;
  showPronunciation?: boolean;
  categoryOrder?: string[];
  showMemoryHook?: boolean;
}

export const EditableWordCard = memo(function EditableWordCard({
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
  onWordChange,
  onCategoryToggle,
  onCategoryAdd,
  onCategoryRemove,
  showEnglish = true,
  showCategoryBadges = false,
  showPronunciation = true,
  categoryOrder,
  showMemoryHook = true,
}: EditableWordCardProps) {
  const { t } = useI18n();
  const [showEditModal, setShowEditModal] = useState(false);

  return (
    <div className="relative">
      {/* Edit button overlay - Glass morphism buttons */}
      <div className="absolute top-2 right-2 z-[100] flex gap-1.5 pointer-events-none">
        <CategoryEditButton
          currentCategories={word.category || []}
          onCategoryAdd={onCategoryAdd}
          onCategoryRemove={onCategoryRemove}
        />

        {/* Text edit button */}
        <button
          data-edit-button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setShowEditModal(true);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="
            group relative flex items-center justify-center
            w-8 h-8 rounded-xl pointer-events-auto
            bg-white/[0.03] backdrop-blur-xl
            border border-white/[0.08]
            shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]
            transition-all duration-200 ease-out
            hover:bg-white/[0.08] hover:border-white/[0.15] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)]
            hover:-translate-y-0.5
            active:translate-y-0 active:shadow-[0_2px_8px_rgba(0,0,0,0.3)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50
          "
          title={t('editor.editTextFields')}
        >
          <span className="text-sm transition-transform duration-200 group-hover:scale-110">✏️</span>
        </button>
      </div>

      {showEditModal && (
        <EditWordModal
          word={word}
          onWordChange={onWordChange}
          onClose={() => setShowEditModal(false)}
        />
      )}

      <WordCard
        word={word}
        progress={progress}
        role={role}
        modeIndex={modeIndex}
        showAll={showAll}
        memoryHook={memoryHook}
        suggestedHook={suggestedHook}
        onKnown={onKnown}
        onReallyKnown={onReallyKnown}
        onCustomStage={onCustomStage}
        onUnknown={onUnknown}
        onMemoryHookChange={onMemoryHookChange}
        isMoved={isMoved}
        isEditMode={true}
        onCategoryToggle={onCategoryToggle}
        showEnglish={showEnglish}
        showCategoryBadges={showCategoryBadges}
        showPronunciation={showPronunciation}
        categoryOrder={categoryOrder}
        showMemoryHook={showMemoryHook}
      />
    </div>
  );
});
