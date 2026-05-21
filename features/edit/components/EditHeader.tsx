'use client';

import { useI18n } from '@/components/I18nProvider';

interface EditHeaderProps {
  isSaving: boolean;
  saveMessage: string | null;
  onCancel: () => void;
  onSave: () => void;
}

export function EditHeader({
  isSaving,
  saveMessage,
  onCancel,
  onSave,
}: EditHeaderProps) {
  const { t } = useI18n();
  const errorPrefix = t('editor.errorPrefix', { message: '' });
  const isError = saveMessage?.startsWith(errorPrefix) ?? false;

  return (
    <div className="py-3 border-b border-border-subtle bg-background-elevated">
      <div className="app-content-column flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-accent">✏️ {t('editor.mode')}</span>
          {saveMessage && (
            <span className={`text-sm ${isError ? 'text-danger' : 'text-accent'}`}>
              {saveMessage}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-full border border-border-subtle bg-transparent px-3 py-1.5 text-xs text-text"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className={`rounded-full border-none bg-accent px-3 py-1.5 text-xs font-medium text-background ${isSaving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          >
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
