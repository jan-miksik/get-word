'use client';

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
  return (
    <div className="py-3 border-b border-border-subtle bg-background-elevated">
      <div className="app-content-column flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-accent font-semibold">✏️ REŽIM ÚPRAV</span>
          {saveMessage && (
            <span className={`text-sm ${saveMessage.includes('Chyba') ? 'text-danger' : 'text-accent'}`}>
              {saveMessage}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="py-1.5 px-3 rounded-full border border-border-subtle bg-transparent text-text cursor-pointer text-xs"
          >
            Zrušit
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className={`py-1.5 px-3 rounded-full border-none bg-accent text-background text-xs font-medium ${isSaving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          >
            {isSaving ? 'Ukládám...' : 'Uložit'}
          </button>
        </div>
      </div>
    </div>
  );
}
