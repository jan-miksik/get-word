'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStateContext } from '@/context/AppStateContext';
import { useI18n } from '@/components/I18nProvider';
import { noTranslateProps } from '@/lib/i18n/no-translate';
import { useWordStream } from '@/features/learning/hooks/useWordStream';
import { includePersonalWordsForActivePair } from '@/features/learning/state/personal-overview';
import { ProgressStatsContent } from './progress/ProgressStatsContent';
import type { ProgressStats } from '@/lib/progress-stats';
import type { NormalizedWord } from '@/lib/words';
import type { ProgressData } from '@/features/sync/contracts';
import type { Role } from '@/features/learning/state';

interface UpcomingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  progressStats: ProgressStats;
  /**
   * A request to open the panel at one section, from `useMenuPanels`. The panel
   * stays mounted between visits, so `progressExpanded` survives a close — an
   * "expand initially" flag would only ever fire on the first mount. Reacting to
   * the changing `requestId` makes the streak chip work on every tap, including
   * after the learner has collapsed the section by hand.
   */
  focusSection?: string | null;
  focusRequestId?: number;
}

function formatRelativeDue(nextDueAt: number | undefined, now: number): string | null {
  if (!nextDueAt) return null;
  const diff = nextDueAt - now;
  if (diff <= 0) return 'now';
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff >= day) return `${Math.round(diff / day)}d`;
  if (diff >= hour) return `${Math.round(diff / hour)}h`;
  if (diff >= minute) return `${Math.round(diff / minute)}m`;
  return '<1m';
}

function stageBarStyle(stageIndex: number): string {
  if (stageIndex >= 9) return 'bg-sea';
  if (stageIndex >= 5) return 'bg-green-rail';
  if (stageIndex >= 1) return 'bg-[#B5651D]';
  return 'bg-[#C9BFA6]';
}

function pickPair(word: NormalizedWord, role: Role): { source: string; target: string } {
  // role === 'knownLanguage' (= old 'cz'): user knows the from-side, so the
  // prompt is the from-side (word.cz) and the target is the to-side (word.vi).
  return role === 'knownLanguage'
    ? { source: word.cz, target: word.vi }
    : { source: word.vi, target: word.cz };
}

function WordRow({
  word,
  progress,
  role,
  now,
}: {
  word: NormalizedWord;
  progress: ProgressData | undefined;
  role: Role;
  now: number;
}) {
  const { source, target } = pickPair(word, role);
  const stageIdx = progress?.stageIndex ?? 0;
  const due = formatRelativeDue(progress?.nextDueAt, now);
  const isDueNow = due === 'now';
  return (
    <li className="flex items-center gap-2 px-2.5 py-[5px] min-h-[28px] rounded-[10px] border-2 border-ink bg-paper-hi">
      <span className={`block w-[3px] h-4 rounded-pill flex-none ${stageBarStyle(stageIdx)}`} aria-hidden />
      <span {...noTranslateProps('flex-1 flex items-baseline gap-1.5 min-w-0')}>
        <span className="text-[0.875rem] leading-tight font-semibold text-ink truncate">
          {source}
        </span>
        <span className="text-[0.75rem] leading-tight text-ink-soft truncate">{target}</span>
      </span>
      {due && (
        <span
          className={`text-[0.75rem] tabular-nums whitespace-nowrap flex-none px-1.5 rounded-md border-2 ${
            isDueNow
              ? 'text-paper-hi bg-sea border-sea font-bold'
              : 'text-ink border-ink bg-transparent font-semibold'
          }`}
        >
          {due}
        </span>
      )}
    </li>
  );
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-baseline justify-between px-1 mb-1.5">
        <span className="text-[0.6875rem] uppercase tracking-wider font-bold text-ink">
          {label}
        </span>
        <span className="text-[0.75rem] tabular-nums font-semibold text-ink-soft">{count}</span>
      </div>
      <ul className="m-0 p-0 list-none flex flex-col gap-1.5">{children}</ul>
    </div>
  );
}

export function UpcomingPanel({ isOpen, onClose, progressStats, focusSection = null, focusRequestId }: UpcomingPanelProps) {
  const { t } = useI18n();
  const {
    filteredWords,
    allSyncedWords,
    subscribedLists,
    activeListId,
    progress,
    isHydrated,
    role,
    categoryOrder,
    pinnedCategoryIds,
    ownedPersonalListIds,
  } = useAppStateContext();
  const overviewWords = useMemo(
    () =>
      includePersonalWordsForActivePair(
        filteredWords,
        allSyncedWords ?? filteredWords,
        subscribedLists,
        activeListId,
      ),
    [activeListId, allSyncedWords, filteredWords, subscribedLists],
  );
  // The same bucketing the study stream uses, with the same priority inputs —
  // the overview must list words in the order they will actually be served.
  const { priorityWords, priorityDueCount, dueWords, newWords, settlingWords } = useWordStream(
    overviewWords,
    progress,
    isHydrated,
    categoryOrder,
    0,
    pinnedCategoryIds,
    ownedPersonalListIds,
  );
  // `priorityWords` is [...priorityDue, ...priorityNew]; split it back so each
  // half leads its own section, mirroring the stream's order.
  const dueNowWords = useMemo(
    () => [...priorityWords.slice(0, priorityDueCount), ...dueWords],
    [dueWords, priorityDueCount, priorityWords],
  );
  const newWordsOrdered = useMemo(
    () => [...priorityWords.slice(priorityDueCount), ...newWords],
    [newWords, priorityDueCount, priorityWords],
  );

  // Initialized collapsed; intentionally not reset when the panel closes,
  // so it stays expanded for the rest of the session once opened.
  const [progressExpanded, setProgressExpanded] = useState(false);
  // Adjusted during render rather than in an effect: this derives state from a
  // changed prop, so an effect would only add a wasted second pass.
  const [handledFocusRequestId, setHandledFocusRequestId] = useState<number | undefined>(undefined);
  if (focusRequestId !== undefined && focusRequestId !== handledFocusRequestId) {
    setHandledFocusRequestId(focusRequestId);
    if (focusSection === 'progress') setProgressExpanded(true);
  }
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const refreshId = window.setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(refreshId);
      clearInterval(id);
    };
  }, [isOpen]);

  const { upcoming, done } = useMemo(() => {
    const up: NormalizedWord[] = [];
    const dn: NormalizedWord[] = [];
    for (const w of settlingWords) {
      const stage = progress[w.id]?.stageIndex ?? 0;
      if (stage >= 10) dn.push(w);
      else up.push(w);
    }
    up.sort((a, b) => {
      const ad = progress[a.id]?.nextDueAt ?? Number.POSITIVE_INFINITY;
      const bd = progress[b.id]?.nextDueAt ?? Number.POSITIVE_INFINITY;
      return ad - bd;
    });
    return { upcoming: up, done: dn };
  }, [settlingWords, progress]);

  const total = dueNowWords.length + upcoming.length + newWordsOrdered.length + done.length;

  return (
    <section
      className={`upcoming-panel ${isOpen ? 'is-open' : ''}`}
      aria-label={t('top.upcoming')}
      aria-hidden={!isOpen}
      onClick={(e) => e.stopPropagation()}
    >
      {isOpen && (
        <div className="panel-backdrop" onClick={onClose} aria-hidden />
      )}
      <div className="panel-content">
        <div className="px-3.5 pt-3.5 pb-4 flex flex-col h-full">
          <div className="flex items-center justify-between gap-3 mb-3 relative flex-none">
            <h2 className="m-0 text-[1.05rem] font-semibold">
              {t('top.upcoming')}:
              {total > 0 && (
                <span className="ml-2 text-[0.9rem] font-medium opacity-70 tabular-nums">
                  {total}
                </span>
              )}
            </h2>
            <button
              onClick={onClose}
              className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-md p-1 text-[1.25rem] text-text-soft transition-colors duration-150 hover:bg-background-elevated hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              aria-label={t('common.close')}
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setProgressExpanded((v) => !v)}
                aria-expanded={progressExpanded}
                aria-controls="upcoming-progress-stats"
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[10px] border-2 border-ink bg-paper-hi text-[0.875rem] font-semibold text-ink cursor-pointer"
              >
                <span>📊 {t('progress.title')}</span>
                <span
                  aria-hidden
                  className={`text-[0.75rem] transition-transform duration-150 ${progressExpanded ? 'rotate-90' : ''}`}
                >
                  ▸
                </span>
              </button>
              {progressExpanded && (
                <div id="upcoming-progress-stats" className="mt-2">
                  <ProgressStatsContent progressStats={progressStats} />
                </div>
              )}
            </div>
            {total === 0 ? (
              <p className="m-0 text-text-soft">{t('upcoming.empty')}</p>
            ) : (
              <>
                <Section label={t('upcoming.dueNow')} count={dueNowWords.length}>
                  {dueNowWords.map((w) => (
                    <WordRow key={w.id} word={w} progress={progress[w.id]} role={role} now={now} />
                  ))}
                </Section>
                <Section label={t('upcoming.upcoming')} count={upcoming.length}>
                  {upcoming.map((w) => (
                    <WordRow key={w.id} word={w} progress={progress[w.id]} role={role} now={now} />
                  ))}
                </Section>
                <Section label={t('upcoming.new')} count={newWordsOrdered.length}>
                  {newWordsOrdered.map((w) => (
                    <WordRow key={w.id} word={w} progress={progress[w.id]} role={role} now={now} />
                  ))}
                </Section>
                {done.length > 0 && (
                  <div className="mt-4 pt-3 border-t-2 border-ink/30">
                    <Section label={t('upcoming.done')} count={done.length}>
                      {done.map((w) => (
                        <WordRow key={w.id} word={w} progress={progress[w.id]} role={role} now={now} />
                      ))}
                    </Section>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
