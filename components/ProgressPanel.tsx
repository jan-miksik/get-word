'use client';

import { STAGES } from '@/lib/words';
import type { ProgressStats } from '@/lib/progress-stats';

interface ProgressPanelProps {
  isOpen: boolean;
  progressStats: ProgressStats;
  onClose: () => void;
}

export function ProgressPanel({ isOpen, progressStats, onClose }: ProgressPanelProps) {
  const progressPercent = progressStats.total > 0 
    ? Math.round((progressStats.fresh + progressStats.learning + progressStats.done) / progressStats.total * 100) 
    : 0;
  const totalAnswers = progressStats.totalKnown + progressStats.totalUnknown;
  const accuracy = totalAnswers > 0 
    ? Math.round((progressStats.totalKnown / totalAnswers) * 100) 
    : 0;

  return (
    <section
      className={`progress-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Progress"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-4" id="progress-panel-content">
        <div className="py-3 max-w-full sm:py-6">
          <div className="mb-4 relative">
            <h1 className="text-[1.35rem] font-semibold m-0 text-text">📊 Learning Progress</h1>
            <button
              onClick={onClose}
              className="absolute top-0 right-0 bg-transparent border-none text-xl text-text-soft cursor-pointer p-1 leading-none flex items-center justify-center w-6 h-6 rounded-md transition-all hover:bg-background-elevated hover:text-text"
              aria-label="Close progress"
            >
              ×
            </button>
          </div>

          {/* Overall stats */}
          <div className="grid grid-cols-2 gap-2 mb-4 sm:grid-cols-4">
            <div className="bg-background-elevated border border-border-subtle rounded-lg p-2.5 text-center">
              <div className="text-2xl font-bold text-accent mb-0.5">{progressStats.total}</div>
              <div className="text-xs text-text-soft font-medium">Total Words</div>
            </div>
            <div className="bg-background-elevated border border-border-subtle rounded-lg p-2.5 text-center">
              <div className="text-2xl font-bold text-accent mb-0.5">{progressPercent}%</div>
              <div className="text-xs text-text-soft font-medium">Progress</div>
              <div className="text-[0.6875rem] text-text-soft mt-0.5">
                {progressStats.fresh + progressStats.learning + progressStats.done} / {progressStats.total}
              </div>
            </div>
            <div className="bg-background-elevated border border-border-subtle rounded-lg p-2.5 text-center">
              <div className="text-2xl font-bold text-accent mb-0.5">{progressStats.readyCount}</div>
              <div className="text-xs text-text-soft font-medium">Ready Now</div>
            </div>
            <div className="bg-background-elevated border border-border-subtle rounded-lg p-2.5 text-center">
              <div className="text-2xl font-bold text-accent mb-0.5">{progressStats.done}</div>
              <div className="text-xs text-text-soft font-medium">Done</div>
              <div className="text-[0.6875rem] text-text-soft mt-0.5">Stage 9-10</div>
            </div>
          </div>

          {/* Learning status breakdown */}
          <div className="mb-5">
            <h2 className="text-base font-semibold m-0 mb-2.5 text-text">Learning Status</h2>
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-background-elevated border border-border-subtle rounded-lg p-2.5 text-center">
                <div className="text-xl font-bold mb-1 text-text-soft">{progressStats.new}</div>
                <div className="text-[0.6875rem] text-text-soft font-medium">New / Not Started</div>
              </div>
              <div className="bg-background-elevated border border-border-subtle rounded-lg p-2.5 text-center">
                <div className="text-xl font-bold mb-1 text-fresh">{progressStats.fresh}</div>
                <div className="text-[0.6875rem] text-text-soft font-medium">Fresh</div>
              </div>
              <div className="bg-background-elevated border border-accent-strong rounded-lg p-2.5 text-center">
                <div className="text-xl font-bold mb-1 text-accent">{progressStats.learning}</div>
                <div className="text-[0.6875rem] text-text-soft font-medium">Learning</div>
              </div>
              <div className="bg-background-elevated border border-border-subtle rounded-lg p-2.5 text-center">
                <div className="text-xl font-bold mb-1 text-done">{progressStats.done}</div>
                <div className="text-[0.6875rem] text-text-soft font-medium">Done</div>
              </div>
            </div>
          </div>

          {/* Words by Stage */}
          <div className="mb-5">
            <h2 className="text-base font-semibold m-0 mb-2.5 text-text">Words by Stage</h2>
            <div className="flex flex-col gap-1.5">
              {STAGES.map((stage, index) => {
                const count = progressStats.byStage[index];
                if (count === 0 && index > 0) return null; // Skip empty stages except stage 0

                const barPercent = progressStats.total > 0 ? (count / progressStats.total * 100) : 0;
                const isMastered = index >= 7;

                return (
                  <div
                    key={index}
                    className={`bg-background-elevated border border-border-subtle rounded-lg py-2 px-3 flex items-center gap-2`}
                  >
                    <div className="flex-1 text-[0.8125rem] font-medium text-text">{stage.name}</div>
                    <div className="text-sm font-semibold text-accent min-w-[28px] text-right">{count}</div>
                    <div className="w-[60px] h-1 bg-border-subtle rounded-pill overflow-hidden">
                      <div
                        className={`h-full rounded-pill transition-[width] duration-[220ms] ease-med ${isMastered ? 'bg-done' : 'bg-accent'}`}
                        style={{ width: `${barPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Answer statistics */}
          <div className="mb-5">
            <h2 className="text-base font-semibold m-0 mb-2.5 text-text">Answer Statistics</h2>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-background-elevated border border-border-subtle rounded-lg p-2.5 text-center">
                <div className="text-[0.6875rem] text-text-soft mb-1 font-medium">Correct</div>
                <div className="text-xl font-bold text-done">{progressStats.totalKnown}</div>
              </div>
              <div className="bg-background-elevated border border-border-subtle rounded-lg p-2.5 text-center">
                <div className="text-[0.6875rem] text-text-soft mb-1 font-medium">Incorrect</div>
                <div className="text-xl font-bold text-danger">{progressStats.totalUnknown}</div>
              </div>
              <div className="bg-background-elevated border border-border-subtle rounded-lg p-2.5 text-center">
                <div className="text-[0.6875rem] text-text-soft mb-1 font-medium">Accuracy</div>
                <div className="text-xl font-bold text-text">{accuracy}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
