'use client';

import { MEMORY_HOOK_DISABLE_STAGE_OPTIONS, STAGES } from '@/lib/words';
import type { I18nKey } from '@/lib/i18n/messages';
import { useI18n } from '@/components/I18nProvider';
import { useAppStateContext } from '@/context/AppStateContext';
import { Section, ToggleSwitch } from '@/components/settings/primitives';
import { OPEN_MEMORY_HOOKS_PANEL_EVENT } from '@/lib/ui-events';

export function MemoryHooksSection() {
  const { t } = useI18n();
  const {
    memoryHooksEnabled,
    setMemoryHooksEnabled,
    memoryHookDisableFromStage,
    setMemoryHookDisableFromStage,
  } = useAppStateContext();

  return (
    <Section label={t('settings.memoryHooks')}>
      <div className="flex items-center justify-between py-0.5">
        <span className="text-sm text-text">{t('settings.memoryHooksEnable')}</span>
        <ToggleSwitch
          checked={memoryHooksEnabled}
          onChange={setMemoryHooksEnabled}
          ariaLabel={t('settings.memoryHooksEnable')}
        />
      </div>
      {memoryHooksEnabled && (
        <label className="flex items-center justify-between gap-3 py-0.5">
          <span className="text-sm text-text">{t('settings.hideAfterInterval')}</span>
          <select
            value={memoryHookDisableFromStage}
            onChange={(e) => setMemoryHookDisableFromStage(Number(e.target.value))}
            aria-label={t('settings.hideMemoryHooksFromInterval')}
            className="rounded-lg border border-border-subtle bg-background px-2 py-1 text-xs text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {MEMORY_HOOK_DISABLE_STAGE_OPTIONS.map((stage) => (
              <option key={stage} value={stage}>
                {t(`stage.${STAGES[stage]?.id ?? stage}` as I18nKey)}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_MEMORY_HOOKS_PANEL_EVENT))}
        className="self-start bg-transparent border-none p-0 text-xs text-accent underline cursor-pointer"
      >
        {t('settings.memoryHooksLearnMore')}
      </button>
    </Section>
  );
}
