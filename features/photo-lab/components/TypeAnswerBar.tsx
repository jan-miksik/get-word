'use client';

import { useI18n } from '@/components/I18nProvider';
import { noTranslateProps } from '@/lib/i18n/no-translate';
import type { PhotoLabLabel } from '@/features/photo-lab/types';

export type TypeFeedback = 'correct' | 'close' | 'wrong' | null;

/**
 * Answer bar for typing mode. Its sticky wrapper is a sibling of the zoom
 * viewport, so the form stays unscaled and does not compete with gestures.
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

  // Backgrounds use literal palette colors (not var + opacity modifier):
  // Tailwind compiles var-based opacity to color-mix(), which older iOS Safari
  // drops entirely — the bar rendered fully transparent there.
  return (
    <form
      data-photo-control
      className="flex w-full flex-col gap-2 rounded-2xl border border-[color:var(--ob-ink)]/15 bg-[#F4EFE2]/95 p-3 shadow-lg backdrop-blur-md sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!solvedFeedback) onSubmit();
      }}
    >
      {feedback === 'correct' && (
        <p className="m-0 text-sm font-semibold text-[color:var(--ob-correct)]">
          {t('photoLab.typeCorrect')}
        </p>
      )}
      {feedback === 'close' && (
        <p className="m-0 text-sm font-semibold text-amber-700">
          {t('photoLab.typeClose', { answer: label.target })}
        </p>
      )}
      {feedback === 'wrong' && (
        <p className="m-0 text-sm font-semibold text-[color:var(--ob-wrong)]">
          {t('photoLab.typeWrong')}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span
          {...noTranslateProps(
            'max-w-full truncate text-lg font-semibold text-[color:var(--ob-ink)] sm:max-w-[25%]',
          )}
        >
          {label.known}
        </span>
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
          className={`min-w-0 flex-1 rounded-xl border-2 bg-white/90 px-3 py-2.5 text-sm text-[color:var(--ob-ink)] outline-none sm:text-base ${
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
          className="rounded-xl bg-[var(--ob-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 sm:text-base"
        >
          {t('photoLab.typeCheck')}
        </button>
      </div>
      {!solvedFeedback && (
        <button
          type="button"
          onClick={onShowAnswer}
          className="self-start text-xs text-[color:var(--ob-ink-soft)] underline"
        >
          {t('photoLab.typeShowAnswer')}
        </button>
      )}
    </form>
  );
}
