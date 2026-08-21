'use client';

import { useI18n } from '@/components/I18nProvider';

type SettlingWordsFooterProps = {
  showNotReady: boolean;
  settlingCount: number;
  onToggle: () => void;
};

export function SettlingWordsFooter({
  showNotReady,
  settlingCount,
  onToggle,
}: SettlingWordsFooterProps) {
  const { t } = useI18n();
  if (settlingCount === 0) return null;

  return (
    <div className="study-ink-scope mt-4 border-t border-border-subtle p-4 px-4 text-center">
      <button
        type="button"
        className="cursor-pointer rounded-lg border border-border-subtle bg-background-elevated px-6 py-3 text-sm font-medium text-text transition-all"
        onClick={onToggle}
      >
        {showNotReady
          ? t('learning.settlingHide')
          : t('learning.settlingShow', { count: settlingCount })}
      </button>
    </div>
  );
}
