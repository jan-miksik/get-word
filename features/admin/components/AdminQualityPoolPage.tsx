'use client';

import { useEffect, useMemo, useState, Fragment } from 'react';
import Link from 'next/link';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';
import {
  PAGE_SIZE_OPTIONS,
  useQualityPool,
  type BulkProgress,
} from '@/features/admin/client/useQualityPool';
import {
  hasAudioGap,
  type QualityAudioFilter,
  type QualityAudioSide,
  type QualityPoolRow,
  type QualitySort,
  type QualityVerdict,
} from '@/features/admin/quality-types';
import type { QualityFlagCode } from '@/lib/quality-flags';
import type { I18nKey } from '@/lib/i18n/locales/en';

const FLAG_LABELS: Record<QualityFlagCode, I18nKey> = {
  looks_untranslated: 'adminQuality.flagLooksUntranslated',
  missing_target_capitalization: 'adminQuality.flagCapitalization',
  missing_article_for_noun: 'adminQuality.flagArticle',
  parenthetical_in_translation: 'adminQuality.flagParenthetical',
  register_marker_mismatch: 'adminQuality.flagRegister',
  formatting_fix_available: 'adminQuality.flagFormatting',
  maybe_question: 'adminQuality.flagMaybeQuestion',
  maybe_exclamation: 'adminQuality.flagMaybeExclamation',
  divergent_targets: 'adminQuality.flagDivergent',
  dominated_minority: 'adminQuality.flagDominatedMinority',
  category_name_leak: 'adminQuality.flagCategoryLeak',
  audio_suspicious_size: 'adminQuality.flagAudioSuspicious',
};

const AUDIO_FILTERS: { value: QualityAudioFilter; key: I18nKey }[] = [
  { value: 'any', key: 'adminQuality.audioAny' },
  { value: 'missing', key: 'adminQuality.audioMissing' },
  { value: 'known_gap', key: 'adminQuality.audioKnownGap' },
  { value: 'target_gap', key: 'adminQuality.audioTargetGap' },
  { value: 'incomplete', key: 'adminQuality.audioIncomplete' },
  { value: 'failed', key: 'adminQuality.audioFailed' },
  { value: 'legacy', key: 'adminQuality.audioLegacy' },
  { value: 'ready', key: 'adminQuality.audioReady' },
];

const SORTS: { value: QualitySort; key: I18nKey }[] = [
  { value: 'suspicion', key: 'adminQuality.sortSuspicion' },
  { value: 'occurrences', key: 'adminQuality.sortOccurrences' },
  { value: 'audio', key: 'adminQuality.sortAudio' },
  { value: 'newest', key: 'adminQuality.sortNewest' },
  { value: 'alphabetical', key: 'adminQuality.sortAlphabetical' },
];

const VERDICTS: { value: QualityVerdict | 'any'; key: I18nKey }[] = [
  { value: 'any', key: 'adminQuality.verdictAny' },
  { value: 'unreviewed', key: 'adminQuality.verdictUnreviewed' },
  { value: 'suspect', key: 'adminQuality.verdictSuspect' },
  { value: 'suggested', key: 'adminQuality.verdictSuggested' },
  { value: 'ok', key: 'adminQuality.verdictOk' },
];

/**
 * Audio state as counts, never a single tick. A pair studied in twelve items
 * where four have audio is neither done nor missing, and the whole point of
 * the per-side counts is that the half-done case stays visible.
 */
function AudioCell({ side, label }: { side: QualityAudioSide; label: string }) {
  const { t } = useI18n();
  const total =
    side.ready_count + side.missing_count + side.failed_count + side.pending_count;
  const suspicious = side.assets.some((asset) => asset.suspicious);

  const tone =
    side.failed_count > 0
      ? 'text-danger'
      : side.ready_count === 0
        ? 'text-text-soft'
        : side.missing_count > 0
          ? 'text-accent'
          : 'text-text';

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="text-text-soft/70">{label}</span>
      <span className={`tabular-nums ${tone}`}>
        {side.ready_count}/{total}
      </span>
      <span className="flex flex-wrap gap-1">
        {side.failed_count > 0 && (
          <Badge tone="danger">
            {t('adminQuality.badgeFailed')} {side.failed_count}
          </Badge>
        )}
        {side.legacy_count > 0 && (
          <Badge tone="warn">
            {t('adminQuality.badgeLegacy')} {side.legacy_count}
          </Badge>
        )}
        {suspicious && <Badge tone="warn">{t('adminQuality.badgeSuspiciousClip')}</Badge>}
      </span>
    </div>
  );
}

function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'warn' | 'danger' | 'notice';
}) {
  const tones = {
    neutral: 'border-border-subtle text-text-soft',
    notice: 'border-border-subtle text-text-soft italic',
    warn: 'border-accent/50 text-accent',
    danger: 'border-danger/60 text-danger',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.65rem] leading-none ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function FlagBadges({ row }: { row: QualityPoolRow }) {
  const { t } = useI18n();
  if (row.heuristic_flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {row.heuristic_flags.map((flag) => (
        <Badge
          key={`${flag.code}-${flag.side ?? 'both'}`}
          // A notice is a prompt to look, not an accusation. `divergent_targets`
          // fires on legitimate polysemy (bank → banka / břeh), so it must not
          // read like a defect.
          tone={flag.weight === 'notice' ? 'notice' : flag.weight === 'high' ? 'danger' : 'warn'}
        >
          {t(FLAG_LABELS[flag.code] ?? ('adminQuality.flagUnknown' as I18nKey))}
        </Badge>
      ))}
    </span>
  );
}

export function AdminQualityPoolPage() {
  const settingsLanguage = useSettingsLanguage();
  return (
    <I18nProvider language={settingsLanguage}>
      <AdminQualityPoolContent />
    </I18nProvider>
  );
}

function AdminQualityPoolContent() {
  const { t } = useI18n();
  const {
    state,
    query,
    updateQuery,
    goToOffset,
    pagination,
    saveVerdict,
    generateAudio,
    generateAudioBulk,
    markOkBulk,
    auditPairs,
  } = useQualityPool();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // One row at a time, like the moderation queue: its buttons disable while
  // the request is in flight so a double click cannot fire two writes.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const runAction = async (poolKey: string, action: () => Promise<unknown>) => {
    setBusyKey(poolKey);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  };

  const toggleExpanded = (poolKey: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(poolKey)) next.delete(poolKey);
      else next.add(poolKey);
      return next;
    });
  };

  const rows = state.status === 'ready' ? state.page.rows : [];

  // A selection only ever means rows the editor can still see. Paging or
  // changing a filter loads a different set, and acting on a pair that scrolled
  // out of the page is exactly the kind of surprise a bulk button must not have.
  useEffect(() => {
    if (state.status !== 'ready') return;
    const visible = new Set(state.page.rows.map((row) => row.pool_key));
    setSelected((previous) => {
      const next = new Set([...previous].filter((key) => visible.has(key)));
      return next.size === previous.size ? previous : next;
    });
  }, [state]);

  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.pool_key)),
    [rows, selected],
  );

  const toggleSelected = (poolKey: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(poolKey)) next.delete(poolKey);
      else next.add(poolKey);
      return next;
    });
  };

  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.pool_key)));
  };

  const runBulk = async (
    keys: string[],
    action: (
      poolKeys: string[],
      onProgress: (progress: BulkProgress) => void,
    ) => Promise<{ ok: number; failures: { poolKey: string; error: string }[] }>,
  ) => {
    if (keys.length === 0) return;
    setActionError(null);
    setBulkResult(null);
    setBulkProgress({ done: 0, total: keys.length });
    try {
      const outcome = await action(keys, setBulkProgress);
      setBulkResult(
        t('adminQuality.bulkDone', {
          ok: outcome.ok,
          failed: outcome.failures.length,
        }),
      );
      if (outcome.failures.length > 0) {
        setActionError(outcome.failures[0].error);
      }
      setSelected(new Set());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBulkProgress(null);
    }
  };

  /**
   * The AI check is one request for the whole selection, so it does not go
   * through `runBulk` — there is no per-pair progress to report, only a run
   * that is either in flight or finished.
   */
  const runAudit = async () => {
    const keys = selectedRows.map((row) => row.pool_key);
    if (keys.length === 0) return;
    setActionError(null);
    setBulkResult(null);
    setBulkProgress({ done: 0, total: keys.length });
    try {
      const result = await auditPairs(keys);
      setBulkResult(
        t('adminQuality.aiCheckDone', {
          audited: result.audited ?? 0,
          cached: result.cached ?? 0,
        }),
      );
      setSelected(new Set());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBulkProgress(null);
    }
  };

  /** Only the selected pairs this action can actually change. */
  const selectedWithGap = (side: 'known' | 'target') =>
    selectedRows
      .filter((row) => hasAudioGap(side === 'known' ? row.known : row.target, row.occurrences))
      .map((row) => row.pool_key);

  const versions = useMemo(
    () =>
      state.status === 'ready'
        ? {
            heuristic: state.page.heuristic_version,
            llm: state.page.llm_audit_version,
          }
        : null,
    [state],
  );

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="m-0 text-xl font-semibold">{t('adminQuality.title')}</h1>
            <Link href="/admin/stats" className="text-sm text-accent underline">
              {t('adminQuality.back')}
            </Link>
          </div>
          <p className="m-0 text-sm text-text-soft">{t('adminQuality.subtitle')}</p>
          <p className="m-0 text-xs text-text-soft/70">{t('adminQuality.privacyNote')}</p>
        </header>

        {state.status === 'unauthorized' && <Notice>{t('adminQuality.unauthorized')}</Notice>}
        {state.status === 'forbidden' && <Notice>{t('adminQuality.forbidden')}</Notice>}
        {state.status === 'error' && <Notice>{t('adminQuality.error')}</Notice>}

        <div className="grid gap-3 rounded-lg border border-border-subtle bg-background-elevated p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-text-soft">
            {t('adminQuality.filterSearch')}
            <input
              type="search"
              value={query.search ?? ''}
              onChange={(event) => updateQuery({ search: event.target.value })}
              className="rounded-md border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-soft">
            {t('adminQuality.filterAudio')}
            <select
              value={query.audio ?? 'any'}
              onChange={(event) =>
                updateQuery({ audio: event.target.value as QualityAudioFilter })
              }
              className="rounded-md border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
            >
              {AUDIO_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.key)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-soft">
            {t('adminQuality.filterVerdict')}
            <select
              value={query.verdict ?? 'any'}
              onChange={(event) =>
                updateQuery({ verdict: event.target.value as QualityVerdict | 'any' })
              }
              className="rounded-md border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
            >
              {VERDICTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.key)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-soft">
            {t('adminQuality.filterSort')}
            <select
              value={query.sort ?? 'suspicion'}
              onChange={(event) => updateQuery({ sort: event.target.value as QualitySort })}
              className="rounded-md border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.key)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-soft">
            {t('adminQuality.filterPageSize')}
            <select
              value={String(query.limit ?? PAGE_SIZE_OPTIONS[1])}
              onChange={(event) => updateQuery({ limit: Number(event.target.value) })}
              className="rounded-md border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-text-soft sm:col-span-2">
            <input
              type="checkbox"
              checked={query.staleOnly ?? false}
              onChange={(event) => updateQuery({ staleOnly: event.target.checked })}
            />
            {t('adminQuality.filterStale')}
            {versions && (
              <span className="text-text-soft/60">
                (H{versions.heuristic} / L{versions.llm})
              </span>
            )}
          </label>
        </div>

        {actionError && <Notice>{actionError}</Notice>}
        {bulkResult && <Notice>{bulkResult}</Notice>}

        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-background-elevated px-4 py-3 text-sm">
            <span className="text-text">
              {t('adminQuality.bulkSelected', { count: selectedRows.length })}
            </span>
            {bulkProgress ? (
              <span className="tabular-nums text-text-soft">
                {t('adminQuality.bulkProgress', {
                  done: bulkProgress.done,
                  total: bulkProgress.total,
                })}
              </span>
            ) : (
              <>
                <BulkButton
                  count={selectedWithGap('target').length}
                  label={t('adminQuality.bulkGenerateTarget')}
                  onClick={() =>
                    runBulk(selectedWithGap('target'), (keys, onProgress) =>
                      generateAudioBulk(keys, 'target', onProgress),
                    )
                  }
                />
                <BulkButton
                  count={selectedWithGap('known').length}
                  label={t('adminQuality.bulkGenerateKnown')}
                  onClick={() =>
                    runBulk(selectedWithGap('known'), (keys, onProgress) =>
                      generateAudioBulk(keys, 'known', onProgress),
                    )
                  }
                />
                <BulkButton
                  count={selectedRows.length}
                  label={t('adminQuality.bulkAiCheck')}
                  onClick={runAudit}
                />
                <BulkButton
                  count={selectedRows.length}
                  label={t('adminQuality.bulkMarkOk')}
                  onClick={() =>
                    runBulk(
                      selectedRows.map((row) => row.pool_key),
                      (keys, onProgress) => markOkBulk(keys, onProgress),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="ml-auto text-xs text-text-soft underline"
                >
                  {t('adminQuality.bulkClear')}
                </button>
              </>
            )}
          </div>
        )}

        {state.status === 'loading' && (
          <p className="text-sm text-text-soft">{t('adminQuality.loading')}</p>
        )}

        {state.status === 'ready' && rows.length === 0 && (
          <Notice>{t('adminQuality.empty')}</Notice>
        )}

        {state.status === 'ready' && rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-background-elevated text-left text-text-soft">
                  <th className="w-8 px-3 py-2 font-medium">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label={t('adminQuality.selectAll')}
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">{t('adminQuality.colPair')}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('adminQuality.colUses')}
                  </th>
                  <th className="px-3 py-2 font-medium">{t('adminQuality.colKnownAudio')}</th>
                  <th className="px-3 py-2 font-medium">{t('adminQuality.colTargetAudio')}</th>
                  <th className="px-3 py-2 font-medium">{t('adminQuality.colSignals')}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('adminQuality.colScore')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.pool_key}>
                    <tr
                      className="cursor-pointer border-t border-border-subtle hover:bg-background-elevated/60"
                      onClick={() => toggleExpanded(row.pool_key)}
                    >
                      {/* Stops the click from also expanding the row — a
                          checkbox that unfolds a detail panel makes selecting
                          a page unreadable. */}
                      <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(row.pool_key)}
                          onChange={() => toggleSelected(row.pool_key)}
                          aria-label={`${row.text_known} → ${row.text_target}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="block">
                          {row.text_known}{' '}
                          <span className="text-text-soft">→</span> {row.text_target}
                        </span>
                        <span className="text-xs text-text-soft/70">
                          {row.language_from} → {row.language_to}
                          {row.topics.length > 0 && ` · ${row.topics.join(', ')}`}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.occurrences}
                        <span className="text-xs text-text-soft/70">
                          {' '}
                          / {row.list_count}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <AudioCell side={row.known} label={row.language_from} />
                      </td>
                      <td className="px-3 py-2">
                        <AudioCell side={row.target} label={row.language_to} />
                      </td>
                      <td className="px-3 py-2">
                        <FlagBadges row={row} />
                        {row.verdict !== 'unreviewed' && (
                          <Badge tone="neutral">
                            {t(
                              VERDICTS.find((option) => option.value === row.verdict)?.key ??
                                ('adminQuality.verdictAny' as I18nKey),
                            )}
                          </Badge>
                        )}
                        {/* Its own labelled badge: a bare glyph next to the
                            verdict tells an editor nothing about why the row
                            is back in the queue. */}
                        {row.verdict_stale && (
                          <Badge tone="warn">{t('adminQuality.verdictStale')}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.llm_score ?? '—'}
                      </td>
                    </tr>
                    {expanded.has(row.pool_key) && (
                      <tr className="border-t border-border-subtle bg-background-elevated/40">
                        <td colSpan={7} className="px-3 py-3">
                          <RowDetail row={row} />
                          <RowActions
                            row={row}
                            busy={busyKey === row.pool_key}
                            onGenerateAudio={(side) => runAction(row.pool_key, () => generateAudio(row.pool_key, side))}
                            onSaveVerdict={(input) => runAction(row.pool_key, () => saveVerdict(row.pool_key, input))}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between text-sm text-text-soft">
            <span>
              {pagination.from}–{pagination.to} / {pagination.total}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                disabled={!pagination.hasPrevious}
                onClick={() => goToOffset(pagination.offset - pagination.limit)}
                className="rounded-md border border-border-subtle px-3 py-1 disabled:opacity-40"
              >
                {t('adminQuality.previous')}
              </button>
              <button
                type="button"
                disabled={!pagination.hasNext}
                onClick={() => goToOffset(pagination.offset + pagination.limit)}
                className="rounded-md border border-border-subtle px-3 py-1 disabled:opacity-40"
              >
                {t('adminQuality.next')}
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

type VerdictInput = {
  verdict: 'ok' | 'suspect' | 'suggested';
  suggestedKnown?: string | null;
  suggestedTarget?: string | null;
  note?: string | null;
};

/**
 * The actions on a pool row.
 *
 * "Suggest a correction" writes only to the review table. The learner's own
 * item is never edited here — they are offered the change and apply or decline
 * it themselves, so nothing in a private list moves without its owner.
 */
function RowActions({
  row,
  busy,
  onGenerateAudio,
  onSaveVerdict,
}: {
  row: QualityPoolRow;
  busy: boolean;
  onGenerateAudio: (side: 'known' | 'target') => void;
  onSaveVerdict: (input: VerdictInput) => void;
}) {
  const { t } = useI18n();
  // Pre-filled from the model's suggestion when there is one, so accepting the
  // AI's proposal is one click and editing it is still possible.
  const [target, setTarget] = useState(row.suggested_target ?? row.llm_suggested_target ?? '');
  const [note, setNote] = useState(row.suggestion_note ?? '');

  // Same predicate as the `known_gap` / `target_gap` filters and the bulk
  // action, so a row those list is a row this offers to repair.
  const knownIncomplete = hasAudioGap(row.known, row.occurrences);
  const targetIncomplete = hasAudioGap(row.target, row.occurrences);

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border-subtle pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {knownIncomplete && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onGenerateAudio('known')}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text disabled:opacity-40"
          >
            {t('adminQuality.actionGenerateKnown')}
          </button>
        )}
        {targetIncomplete && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onGenerateAudio('target')}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text disabled:opacity-40"
          >
            {t('adminQuality.actionGenerateTarget')}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onSaveVerdict({ verdict: 'ok' })}
          className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text disabled:opacity-40"
        >
          {t('adminQuality.actionMarkOk')}
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs text-text-soft">
          {t('adminQuality.actionSuggestLabel')}
          <input
            type="text"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder={row.text_target}
            className="rounded-md border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-text-soft">
          {t('adminQuality.actionNoteLabel')}
          <input
            type="text"
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            className="rounded-md border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </label>
        <button
          type="button"
          disabled={busy || target.trim() === '' || target.trim() === row.text_target}
          onClick={() =>
            onSaveVerdict({
              verdict: 'suggested',
              suggestedTarget: target.trim(),
              note: note.trim() === '' ? null : note.trim(),
            })
          }
          className="rounded-md bg-accent px-3 py-2 text-xs text-white disabled:opacity-40"
        >
          {t('adminQuality.actionSuggest')}
        </button>
      </div>

      <p className="m-0 text-xs text-text-soft/70">{t('adminQuality.actionSuggestHint')}</p>
    </div>
  );
}

function RowDetail({ row }: { row: QualityPoolRow }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3 text-sm">
      {row.heuristic_flags.length > 0 && (
        <ul className="m-0 list-disc space-y-1 pl-5">
          {row.heuristic_flags.map((flag) => (
            <li key={`${flag.code}-${flag.side ?? 'both'}`} className="text-text-soft">
              <span className="text-text">{t(FLAG_LABELS[flag.code])}</span>
              {flag.message ? ` — ${flag.message}` : ''}
              {flag.meta ? ` (${JSON.stringify(flag.meta)})` : ''}
            </li>
          ))}
        </ul>
      )}

      {row.llm_reason && (
        <p className="m-0">
          <span className="text-text-soft">{t('adminQuality.llmReason')}: </span>
          {row.llm_reason}
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        {row.known.assets.map((asset) =>
          asset.content_hash ? (
            <AudioPreview key={asset.id} hash={asset.content_hash} label={row.text_known} />
          ) : null,
        )}
        {row.target.assets.map((asset) =>
          asset.content_hash ? (
            <AudioPreview key={asset.id} hash={asset.content_hash} label={row.text_target} />
          ) : null,
        )}
      </div>
    </div>
  );
}

/**
 * `/api/audio/:hash` is keyed by the media asset's content hash, not its row
 * id — hence `asset.content_hash` here, with `asset.id` used only as the React
 * key. An asset whose hash is null has nothing to play and is skipped.
 */
function AudioPreview({ hash, label }: { hash: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-xs text-text-soft">
      <span>{label}</span>
      <audio controls preload="none" src={`/api/audio/${hash}`} className="h-8" />
    </span>
  );
}

/**
 * A bulk button carries the number of selected pairs it would actually change,
 * which is not always the number selected — recording the target side skips
 * pairs already fully recorded. Showing the real count, and disabling at zero,
 * is what keeps "17 selected" from producing 3 requests with no explanation.
 */
function BulkButton({
  count,
  label,
  onClick,
}: {
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={count === 0}
      onClick={onClick}
      className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text disabled:opacity-40"
    >
      {label} ({count})
    </button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-border-subtle bg-background-elevated px-4 py-3 text-sm text-text-soft">
      {children}
    </p>
  );
}
