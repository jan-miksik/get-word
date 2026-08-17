'use client';

import { useI18n } from '@/components/I18nProvider';
import type { QualitySuggestion } from '@/features/lists/hooks/useQualitySuggestions';

/**
 * A proposed correction, shown under the word it applies to.
 *
 * The learner decides. An editor can look at anonymized pairs and propose a
 * fix, but nothing in a private list changes until its owner presses Accept —
 * which is why this is a quiet inline notice rather than a modal or a banner,
 * and why it lives in the list editor rather than in the study card.
 */
export function QualitySuggestionNotice({
  suggestion,
  busy,
  onAccept,
  onDismiss,
}: {
  suggestion: QualitySuggestion;
  busy: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="mt-1 rounded-lg border border-accent/40 bg-background-elevated px-3 py-2 text-xs">
      <p className="m-0 font-medium text-text">{t('lists.suggestionTitle')}</p>
      <p className="m-0 mt-1 text-text-soft">
        <span className="line-through">{suggestion.currentTarget}</span>
        {' → '}
        <span className="text-text">{suggestion.suggestedTarget ?? suggestion.suggestedKnown}</span>
      </p>
      {suggestion.note && <p className="m-0 mt-1 text-text-soft">{suggestion.note}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="rounded-md bg-accent px-2.5 py-1 text-xs text-white disabled:opacity-40"
        >
          {t('lists.suggestionAccept')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text disabled:opacity-40"
        >
          {t('lists.suggestionKeep')}
        </button>
      </div>
    </div>
  );
}
