'use client';

import { STUDY_NOTE_MINIMIZE_STAGE_OPTIONS, STAGES } from '@/lib/words';
import type { I18nKey } from '@/lib/i18n/messages';
import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import { Section, ToggleSwitch } from './primitives';

export function StudyNotesSection() {
  const { t } = useI18n();
  const {
    studyNotesEnabled,
    setStudyNotesEnabled,
    studyNoteMinimizeFromStage,
    setStudyNoteMinimizeFromStage,
  } = useAppStateContext();

  return (
    <Section label={t('settings.studyNotes')}>
      <div className="flex items-center justify-between py-0.5">
        <span className="text-sm text-text">{t('settings.studyNotesShow')}</span>
        <ToggleSwitch
          checked={studyNotesEnabled}
          onChange={setStudyNotesEnabled}
          ariaLabel={t('settings.studyNotesShow')}
        />
      </div>
      {studyNotesEnabled && (
        <label className="flex items-center justify-between gap-3 py-0.5">
          <span className="text-sm text-text">{t('settings.studyNotesCollapse')}</span>
          <select
            value={studyNoteMinimizeFromStage}
            onChange={(e) => setStudyNoteMinimizeFromStage(Number(e.target.value))}
            aria-label={t('settings.studyNotesCollapseFromStage')}
            className="rounded-lg border border-border-subtle bg-background px-2 py-1 text-xs text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {STUDY_NOTE_MINIMIZE_STAGE_OPTIONS.map((stage) => (
              <option key={stage} value={stage}>
                {t(`stage.${STAGES[stage]?.id ?? stage}` as I18nKey)}
              </option>
            ))}
          </select>
        </label>
      )}
    </Section>
  );
}
