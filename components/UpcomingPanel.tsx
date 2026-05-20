'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStateContext } from '@/context/AppStateContext';
import { useI18n } from '@/components/I18nProvider';
import { useWordStream } from '@/features/learning/hooks/useWordStream';
import type { NormalizedWord } from '@/lib/words';
import type { ProgressData } from '@/lib/sync';
import type { Role } from '@/features/learning/state';

interface UpcomingPanelProps {
  isOpen: boolean;
  onClose: () => void;
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

function stageDotClass(stageIndex: number): string {
  if (stageIndex >= 9) return 'bg-done';
  if (stageIndex >= 5) return 'bg-fresh';
  if (stageIndex >= 1) return 'bg-accent';
  return 'bg-border-subtle';
}

function pickPair(word: NormalizedWord, role: Role): { source: string; target: string } {
  return role === 'cz'
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
    <li className="flex items-center gap-2 px-2.5 py-[3px] min-h-[24px] border-b border-border-subtle/30 last:border-b-0 hover:bg-background-elevated/40">
      <span
        className={`block w-[3px] h-4 rounded-pill flex-none ${stageDotClass(stageIdx)}`}
        aria-hidden
      />
      <span className="flex-1 flex items-baseline gap-1.5 min-w-0">
        <span className="text-[0.8125rem] leading-tight font-medium text-text truncate">
          {source}
        </span>
        <span className="text-[0.6875rem] leading-tight text-text-soft truncate">{target}</span>
      </span>
      <span
        className={`text-[0.6875rem] tabular-nums whitespace-nowrap flex-none ${
          isDueNow ? 'text-accent font-semibold' : 'text-text-soft'
        }`}
      >
        {due ?? '—'}
      </span>
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
      <div className="sticky top-0 z-10 flex items-baseline justify-between px-2.5 py-1 bg-background-elevated/95 backdrop-blur-sm border-b border-border-subtle/60">
        <span className="text-[0.6875rem] uppercase tracking-wide font-semibold text-text-soft">
          {label}
        </span>
        <span className="text-[0.6875rem] tabular-nums text-text-soft">{count}</span>
      </div>
      <ul className="m-0 p-0 list-none">{children}</ul>
    </div>
  );
}

export function UpcomingPanel({ isOpen, onClose }: UpcomingPanelProps) {
  const { t } = useI18n();
  const { filteredWords, progress, isHydrated, role, categoryOrder } = useAppStateContext();
  const { dueWords, newWords, settlingWords } = useWordStream(
    filteredWords,
    progress,
    isHydrated,
    categoryOrder
  );

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
    return { upcoming: up, done: dn };
  }, [settlingWords, progress]);

  const total = dueWords.length + upcoming.length + newWords.length + done.length;

  return (
    <section
      className={`upcoming-panel fixed inset-0 z-[550] ${isOpen ? 'block' : 'hidden'}`}
      aria-label={t('top.upcoming')}
      aria-hidden={!isOpen}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-[rgba(6,10,24,0.5)] backdrop-blur-md md:hidden"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute left-3 right-3 top-16 md:top-[60px] md:left-1/2 md:-translate-x-1/2 md:right-auto md:w-[480px] md:max-w-[calc(100vw-28px)] max-h-[calc(100dvh-5rem)] flex flex-col rounded-2xl border border-border-subtle bg-background-elevated shadow-soft overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[1.05rem] font-semibold m-0 text-text">
              {t('top.upcoming')}
            </h2>
            <span className="text-xs text-text-soft tabular-nums">{total}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="bg-transparent border-none text-xl text-text-soft cursor-pointer p-1 leading-none flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-background hover:text-text"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          {total === 0 ? (
            <div className="p-6 text-center text-sm text-text-soft">
              {t('upcoming.empty')}
            </div>
          ) : (
            <div className="py-1">
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
                <div className="mt-2 pt-2 border-t-2 border-border-subtle">
                  <Section label={t('upcoming.done')} count={done.length}>
                    {done.map((w) => (
                      <WordRow
                        key={w.id}
                        word={w}
                        progress={progress[w.id]}
                        role={role}
                        now={now}
                      />
                    ))}
                  </Section>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
