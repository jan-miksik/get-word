'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStateContext } from '@/context/AppStateContext';
import { useI18n } from '@/components/I18nProvider';
import { useWordStream } from '@/features/learning/hooks/useWordStream';
import { ProgressStatsContent } from './progress/ProgressStatsContent';
import type { ProgressStats } from '@/lib/progress-stats';
import type { NormalizedWord } from '@/lib/words';
import type { ProgressData } from '@/lib/sync';
import type { Role } from '@/features/learning/state';

interface UpcomingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  progressStats: ProgressStats;
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
  if (stageIndex >= 9) return 'bg-[#1E6FA8]';
  if (stageIndex >= 5) return 'bg-[#3F8F4D]';
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
    <li className="flex items-center gap-2 px-2.5 py-[5px] min-h-[28px] rounded-[10px] border-2 border-[#2A2218] bg-[#FFF8E8]">
      <span className={`block w-[3px] h-4 rounded-pill flex-none ${stageBarStyle(stageIdx)}`} aria-hidden />
      <span className="flex-1 flex items-baseline gap-1.5 min-w-0">
        <span className="text-[0.875rem] leading-tight font-semibold text-[#2A2218] truncate">
          {source}
        </span>
        <span className="text-[0.75rem] leading-tight text-[#6B5E48] truncate">{target}</span>
      </span>
      {due && (
        <span
          className={`text-[0.75rem] tabular-nums whitespace-nowrap flex-none px-1.5 rounded-md border-2 ${
            isDueNow
              ? 'text-[#FFF8E8] bg-[#1E6FA8] border-[#1E6FA8] font-bold'
              : 'text-[#2A2218] border-[#2A2218] bg-transparent font-semibold'
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
        <span className="text-[0.6875rem] uppercase tracking-wider font-bold text-[#2A2218]">
          {label}
        </span>
        <span className="text-[0.75rem] tabular-nums font-semibold text-[#6B5E48]">{count}</span>
      </div>
      <ul className="m-0 p-0 list-none flex flex-col gap-1.5">{children}</ul>
    </div>
  );
}

export function UpcomingPanel({ isOpen, onClose, progressStats }: UpcomingPanelProps) {
  const { t } = useI18n();
  const { filteredWords, progress, isHydrated, role, categoryOrder } = useAppStateContext();
  const { dueWords, newWords, settlingWords } = useWordStream(
    filteredWords,
    progress,
    isHydrated,
    categoryOrder
  );

  // Initialized collapsed; intentionally not reset when the panel closes,
  // so it stays expanded for the rest of the session once opened.
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
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

  const total = dueWords.length + upcoming.length + newWords.length + done.length;

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
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[10px] border-2 border-[#2A2218] bg-[#FFF8E8] text-[0.875rem] font-semibold text-[#2A2218] cursor-pointer"
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
                <Section label={t('upcoming.dueNow')} count={dueWords.length}>
                  {dueWords.map((w) => (
                    <WordRow key={w.id} word={w} progress={progress[w.id]} role={role} now={now} />
                  ))}
                </Section>
                <Section label={t('upcoming.upcoming')} count={upcoming.length}>
                  {upcoming.map((w) => (
                    <WordRow key={w.id} word={w} progress={progress[w.id]} role={role} now={now} />
                  ))}
                </Section>
                <Section label={t('upcoming.new')} count={newWords.length}>
                  {newWords.map((w) => (
                    <WordRow key={w.id} word={w} progress={progress[w.id]} role={role} now={now} />
                  ))}
                </Section>
                {done.length > 0 && (
                  <div className="mt-4 pt-3 border-t-2 border-[#2A2218]/30">
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
