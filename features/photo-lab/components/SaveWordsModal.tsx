'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { noTranslateProps } from '@/lib/i18n/no-translate';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';
import { markListsChangedForLearningSync } from '@/features/shared/sync/list-refresh-marker';
import {
  fetchPhotoLabSaveList,
  savePhotoLabWordsToList,
  type PhotoLabSavedWord,
  type PhotoLabSaveWordsResult,
} from '../client/saveToList';
import type { PhotoLabLabel, PhotoLabSession } from '../types';

type SaveState =
  | { status: 'editing' }
  | { status: 'saving' }
  | { status: 'saved'; listName: string; items: PhotoLabSavedWord[] }
  | { status: 'error' };

function usableLabels(labels: PhotoLabLabel[]): PhotoLabLabel[] {
  return labels.filter((label) => label.known.trim() && label.target.trim());
}

/**
 * One word pair, stacked rather than in two columns.
 *
 * Two half-width columns turn any longer label ("kuchyňská linka s dřezem")
 * into either a wrapped, ragged row or an ellipsis the phone cannot hover to
 * expand. Stacked, each side gets the dialog's full width, so realistic labels
 * fit on their own line and every row keeps the same height.
 */
function WordPair({
  known,
  target,
  muted = false,
}: {
  known: string;
  target: string;
  muted?: boolean;
}) {
  return (
    <span {...noTranslateProps('flex min-w-0 flex-1 flex-col leading-tight')}>
      <span className={`truncate font-medium ${muted ? '' : 'text-[color:var(--ob-ink)]'}`}>
        {target}
      </span>
      <span className="truncate text-xs text-[color:var(--ob-ink-soft)]">{known}</span>
    </span>
  );
}

/**
 * Copy the words from one analyzed photo into the learner's own list.
 *
 * The photo itself never leaves the device — only the picked word pairs (and
 * the hash of the label audio that was already generated, so the saved words
 * can be pronounced without a second TTS run) are sent.
 *
 * Nothing is ticked to begin with: saving every label is rarely what a learner
 * wants, and a pre-filled list makes the picking step easy to walk past.
 */
export function SaveWordsModal({
  session,
  onClose,
  onPick,
  onSaved,
}: {
  session: PhotoLabSession;
  onClose: () => void;
  /**
   * Present inside the tabbed "Add your own words" screen: the picked pairs go
   * into that screen's basket instead of straight into the list, so they end on
   * the same Check step as typed and proposed words. The dialog then stops at
   * picking — the category, the destination and the receipt all belong to the
   * shared flow.
   */
  onPick?: (items: { known: string; target: string; audioHash: string | null }[]) => void;
  /**
   * Present when the lab is open over the study view, which is holding a synced
   * snapshot taken before this save: the words land in the database but the
   * deck and the category counts keep showing the old set until it re-reads.
   */
  onSaved?: (result: PhotoLabSaveWordsResult) => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const labels = useMemo(() => usableLabels(session.labels), [session.labels]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [listName, setListName] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState(() => t('photoLab.saveCategoryDefault'));
  const [state, setState] = useState<SaveState>({ status: 'editing' });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus({ preventScroll: true });
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void fetchPhotoLabSaveList(session.languageFrom, session.languageTo).then((result) => {
      if (cancelled || !result) return;
      setListName(result.name);
    });
    return () => {
      cancelled = true;
    };
  }, [session.languageFrom, session.languageTo]);

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = selectedIds.size === labels.length && labels.length > 0;
  const selectedCount = selectedIds.size;

  const save = async () => {
    if (selectedCount === 0) return;
    const picked = labels.filter((label) => selectedIds.has(label.id));
    if (onPick) {
      onPick(
        picked.map((label) => ({
          known: label.known,
          target: label.target,
          audioHash: session.audioHashes?.[label.id] ?? null,
        })),
      );
      onClose();
      return;
    }
    setState({ status: 'saving' });
    const result = await savePhotoLabWordsToList({
      languageFrom: session.languageFrom,
      languageTo: session.languageTo,
      categoryName,
      items: labels
        .filter((label) => selectedIds.has(label.id))
        .map((label) => ({
          known: label.known,
          target: label.target,
          audioHash: session.audioHashes?.[label.id] ?? null,
        })),
    });
    if (!result) {
      setState({ status: 'error' });
      return;
    }
    setState({ status: 'saved', listName: result.listName, items: result.items });
    if (result.addedCount > 0) {
      // Standalone, the learning page is not mounted; the marker is what its
      // boot reads to skip the conditional fetch and pull the new words in.
      if (onSaved) onSaved(result);
      else markListsChangedForLearningSync(null);
    }
  };

  if (typeof document === 'undefined') return null;

  const saving = state.status === 'saving';

  const modal = (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-lab-save-title"
        tabIndex={-1}
        // The app body is dark, so native checkboxes inherit a dark scheme and
        // render as grey blocks on this warm light panel.
        style={{ ...warmPaletteVars, colorScheme: 'light' }}
        className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl border-2 border-[color:var(--ob-ink)] bg-[var(--ob-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[color:var(--ob-ink)] shadow-xl outline-none sm:max-h-[85dvh] sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="photo-lab-save-title" className="m-0 text-base font-semibold">
          {t(onPick ? 'photoLab.pickModalTitle' : 'photoLab.saveModalTitle')}
        </h2>

        {state.status === 'saved' ? (
          <>
            <p className="m-0 mt-1 text-xs text-[color:var(--ob-ink-soft)]">
              {t('photoLab.saveDestination', { list: state.listName })}
            </p>
            <ul className="mt-4 flex min-h-0 flex-1 list-none flex-col gap-1 overflow-y-auto p-0">
              {state.items.map((item) => (
                <li
                  key={`${item.known}|${item.target}`}
                  className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${
                    item.outcome === 'duplicate' ? 'text-[color:var(--ob-ink-soft)]' : ''
                  }`}
                >
                  <span aria-hidden="true" className="w-4 shrink-0 text-center">
                    {item.outcome === 'added' ? '✓' : '•'}
                  </span>
                  <WordPair
                    known={item.known}
                    target={item.target}
                    muted={item.outcome === 'duplicate'}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs text-[color:var(--ob-ink-soft)]">
                {t('photoLab.saveResultSummary', {
                  added: state.items.filter((item) => item.outcome === 'added').length,
                  duplicates: state.items.filter((item) => item.outcome === 'duplicate').length,
                })}
              </span>
              <button
                type="button"
                autoFocus
                onClick={onClose}
                className="rounded-lg bg-[var(--ob-ink)] px-4 py-2 text-sm font-medium text-[var(--ob-surface)] transition-opacity hover:opacity-85"
              >
                {t('common.close')}
              </button>
            </div>
          </>
        ) : (
          <>
            {onPick ? (
              <p className="m-0 mt-1 text-xs text-[color:var(--ob-ink-soft)]">
                {t('photoLab.pickHint')}
              </p>
            ) : (
              <p className="m-0 mt-1 text-xs text-[color:var(--ob-ink-soft)]">
                {listName
                  ? t('photoLab.saveDestination', { list: listName })
                  : t('photoLab.saveDestinationLoading')}
              </p>
            )}

            <label
              hidden={Boolean(onPick)}
              className="mt-4 flex flex-col gap-1 text-xs font-medium text-[color:var(--ob-ink-soft)]"
            >
              {t('photoLab.saveCategoryLabel')}
              <input
                type="text"
                value={categoryName}
                disabled={saving}
                maxLength={60}
                onChange={(e) => setCategoryName(e.target.value)}
                className="rounded-lg border-2 border-[color:var(--ob-ink)]/40 bg-[var(--ob-surface)] px-3 py-2 text-sm font-normal text-[color:var(--ob-ink)]"
              />
            </label>

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[color:var(--ob-ink-soft)]">
                {t('photoLab.saveSelectedCount', { count: selectedCount, total: labels.length })}
              </span>
              <button
                type="button"
                disabled={saving || labels.length === 0}
                onClick={() =>
                  setSelectedIds(allSelected ? new Set() : new Set(labels.map((l) => l.id)))
                }
                className="rounded-lg border border-[color:var(--ob-ink)]/25 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--ob-surface-hover)]"
              >
                {t(allSelected ? 'photoLab.saveSelectNone' : 'photoLab.saveSelectAll')}
              </button>
            </div>

            <ul className="mt-2 flex min-h-0 flex-1 list-none flex-col gap-1 overflow-y-auto p-0">
              {labels.map((label) => (
                <li key={label.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-[var(--ob-surface-hover)]">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(label.id)}
                      disabled={saving}
                      onChange={() => toggle(label.id)}
                      className="h-4 w-4 shrink-0 accent-[var(--ob-accent)]"
                    />
                    <WordPair known={label.known} target={label.target} />
                  </label>
                </li>
              ))}
            </ul>

            {state.status === 'error' && (
              <p className="m-0 mt-3 text-sm font-medium text-[#B91C1C]">
                {t('photoLab.saveError')}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded-lg border border-[color:var(--ob-ink)]/25 px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--ob-surface-hover)]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={saving || selectedCount === 0}
                onClick={() => void save()}
                className="rounded-lg bg-[var(--ob-ink)] px-4 py-2 text-sm font-medium text-[var(--ob-surface)] transition-opacity hover:opacity-85 disabled:opacity-40"
              >
                {saving
                  ? t('photoLab.saving')
                  : selectedCount > 0
                    ? t(onPick ? 'photoLab.pickConfirm' : 'photoLab.saveConfirm', {
                        count: selectedCount,
                      })
                    : t('photoLab.saveConfirmEmpty')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
