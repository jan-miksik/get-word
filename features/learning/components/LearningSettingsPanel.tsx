'use client';

import type { MinigameFrequencyRange } from '@/features/learning/minigames';
import { useI18n } from '@/components/I18nProvider';
import { FineTuneSection } from './settings/FineTuneSection';
import { MemoryHooksSection } from './settings/MemoryHooksSection';
import { StudyNotesSection } from './settings/StudyNotesSection';
import { RevealSection } from './settings/RevealSection';
import { MinigamesSection } from './settings/MinigamesSection';
import { FrontierFeaturesSection } from './settings/FrontierFeaturesSection';
import { StudyGoalSection } from './settings/StudyGoalSection';

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
      className={`settings-panel learning-settings-panel md:!w-[calc(100vw-2rem)] md:!max-w-[720px] ${isOpen ? 'is-open fixed inset-0' : ''}`}
      aria-label={t('top.learningSettings')}
      onClick={(e) => e.stopPropagation()}
    >
      {isOpen && onClose && (
        <div className="panel-backdrop" onClick={onClose} aria-hidden />
      )}
      <div className="panel-content md:!max-h-[calc(100dvh-5rem)]">
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

          <StudyGoalSection minigameFrequency={minigameFrequency} />
          <FineTuneSection />
          <MemoryHooksSection />
          <StudyNotesSection />
          <RevealSection />
          <MinigamesSection
            minigameFrequency={minigameFrequency}
            onMinigameFrequencyChange={onMinigameFrequencyChange}
          />

          <div className="mt-2 border-t-2 border-dashed border-ink/30 pt-4">
            <FrontierFeaturesSection />
          </div>

        </div>
      </div>
    </section>
  );
}
