'use client';

import type { MinigameFrequencyRange } from '@/lib/minigames';
import { useI18n } from '@/components/I18nProvider';
import { TypingModeSection } from '@/components/settings/TypingModeSection';
import { MemoryHooksSection } from '@/components/settings/MemoryHooksSection';
import { StudyNotesSection } from '@/components/settings/StudyNotesSection';
import { RevealSection } from '@/components/settings/RevealSection';
import { MinigamesSection } from '@/components/settings/MinigamesSection';
import { FrontierFeaturesSection } from '@/components/settings/FrontierFeaturesSection';

interface LearningSettingsPanelProps {
  minigameFrequency: MinigameFrequencyRange;
  onMinigameFrequencyChange: (value: MinigameFrequencyRange) => void;
  isOpen: boolean;
  onClose?: () => void;
}

export function LearningSettingsPanel({
  minigameFrequency,
  onMinigameFrequencyChange,
  isOpen,
  onClose,
}: LearningSettingsPanelProps) {
  const { t } = useI18n();

  return (
    <section
      className={`settings-panel learning-settings-panel ${isOpen ? 'is-open fixed inset-0' : ''}`}
      aria-label={t('top.learningSettings')}
      onClick={(e) => e.stopPropagation()}
    >
      {isOpen && onClose && (
        <div className="panel-backdrop" onClick={onClose} aria-hidden />
      )}
      <div className="panel-content">
        <div className="p-5 sm:p-6 flex flex-col gap-4">

          <div className="relative flex items-center min-h-8">
            <h2 className="m-0 text-base font-semibold text-text">{t('top.learningSettings')}</h2>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="absolute right-0 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg bg-transparent border-none text-xl text-text-soft cursor-pointer leading-none transition-all hover:bg-background-elevated hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                aria-label={t('common.close')}
              >
                ×
              </button>
            )}
          </div>

          <TypingModeSection />
          <MemoryHooksSection />
          <StudyNotesSection />
          <RevealSection />
          <MinigamesSection
            minigameFrequency={minigameFrequency}
            onMinigameFrequencyChange={onMinigameFrequencyChange}
          />

          <div className="mt-2 border-t-2 border-dashed border-[#2A2218]/30 pt-4">
            <FrontierFeaturesSection />
          </div>

        </div>
      </div>
    </section>
  );
}
