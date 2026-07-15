'use client';

import { useI18n } from '@/components/I18nProvider';
import type { PhotoLabLabel } from '@/features/photo-lab/types';

export type TypeFeedback = 'correct' | 'close' | 'wrong' | null;

/**
 * Bottom answer bar for typing mode. Lives in the photo viewport's overlay
 * layer (outside the zoom-transformed wrapper) so it never scales or pans.
 */
export function TypeAnswerBar({
  label,
  value,
  feedback,
  inputRef,
  onChange,
  onSubmit,
  onShowAnswer,
}: {
  label: PhotoLabLabel;
  value: string;
  feedback: TypeFeedback;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onShowAnswer: () => void;
}) {
  const { t } = useI18n();
  const solvedFeedback = feedback === 'correct' || feedback === 'close';

  return (
    <form
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 bg-gradient-to-t from-black/70 to-black/0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!solvedFeedback) onSubmit();
      }}
    >
      {feedback === 'correct' && (
        <p className="m-0 text-sm font-semibold text-[#4ade80]">{t('photoLab.typeCorrect')}</p>
      )}
      {feedback === 'close' && (
        <p className="m-0 text-sm font-semibold text-[#fbbf24]">
          {t('photoLab.typeClose', { answer: label.target })}
        </p>
      )}
      {feedback === 'wrong' && (
        <p className="m-0 text-sm font-semibold text-[#fca5a5]">{t('photoLab.typeWrong')}</p>
      )}
      <div className="flex items-center gap-2">
        <span className="max-w-[35%] truncate text-sm font-medium text-white">{label.known}</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          enterKeyHint="done"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t('photoLab.typePlaceholder')}
          disabled={solvedFeedback}
          onChange={(e) => onChange(e.target.value)}
          className={`min-w-0 flex-1 rounded-lg border-2 bg-white/95 px-3 py-2 text-sm text-[color:var(--ob-ink)] outline-none ${
            feedback === 'wrong'
              ? 'border-[color:var(--ob-wrong)]'
              : solvedFeedback
                ? 'border-[color:var(--ob-correct)]'
                : 'border-transparent focus:border-[color:var(--ob-accent)]'
          }`}
        />
        <button
          type="submit"
          disabled={solvedFeedback || value.trim().length === 0}
          className="rounded-lg bg-[var(--ob-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {t('photoLab.typeCheck')}
        </button>
      </div>
      {!solvedFeedback && (
        <button
          type="button"
          onClick={onShowAnswer}
          className="self-start text-xs text-white/80 underline"
        >
          {t('photoLab.typeShowAnswer')}
        </button>
      )}
    </form>
  );
}
