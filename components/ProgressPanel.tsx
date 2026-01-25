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
      <div className="progress-panel-inner" id="progress-panel-content">
        <div className="progress-overview">
          <div className="progress-header relative">
            <h1>📊 Learning Progress</h1>
            <button
              onClick={onClose}
              className="absolute top-0 right-0 bg-transparent border-none text-xl text-text-soft cursor-pointer p-1 leading-none flex items-center justify-center w-6 h-6 rounded-md transition-all hover:bg-background-elevated hover:text-text"
              aria-label="Close progress"
            >
              ×
            </button>
          </div>

          {/* Overall stats */}
          <div className="progress-stats-grid">
            <div className="progress-stat-card">
              <div className="progress-stat-value">{progressStats.total}</div>
              <div className="progress-stat-label">Total Words</div>
            </div>
            <div className="progress-stat-card">
              <div className="progress-stat-value">{progressPercent}%</div>
              <div className="progress-stat-label">Progress</div>
              <div className="progress-stat-subtitle">
                {progressStats.fresh + progressStats.learning + progressStats.done} / {progressStats.total}
              </div>
            </div>
            <div className="progress-stat-card">
              <div className="progress-stat-value">{progressStats.readyCount}</div>
              <div className="progress-stat-label">Ready Now</div>
            </div>
            <div className="progress-stat-card">
              <div className="progress-stat-value">{progressStats.done}</div>
              <div className="progress-stat-label">Done</div>
              <div className="progress-stat-subtitle">Stage 9-10</div>
            </div>
          </div>

          {/* Learning status breakdown */}
          <div className="progress-section">
            <h2>Learning Status</h2>
            <div className="progress-status-grid">
              <div className="progress-status-card new">
                <div className="progress-status-value">{progressStats.new}</div>
                <div className="progress-status-label">New / Not Started</div>
              </div>
              <div className="progress-status-card fresh">
                <div className="progress-status-value">{progressStats.fresh}</div>
                <div className="progress-status-label">Fresh</div>
              </div>
              <div className="progress-status-card learning">
                <div className="progress-status-value">{progressStats.learning}</div>
                <div className="progress-status-label">Learning</div>
              </div>
              <div className="progress-status-card done">
                <div className="progress-status-value">{progressStats.done}</div>
                <div className="progress-status-label">Done</div>
              </div>
            </div>
          </div>

          {/* Words by Stage */}
          <div className="progress-section">
            <h2>Words by Stage</h2>
            <div className="progress-stage-list">
              {STAGES.map((stage, index) => {
                const count = progressStats.byStage[index];
                if (count === 0 && index > 0) return null; // Skip empty stages except stage 0
                
                const barPercent = progressStats.total > 0 ? (count / progressStats.total * 100) : 0;
                
                return (
                  <div
                    key={index}
                    className={`progress-stage-item ${index === 0 ? 'stage-new' : ''} ${index >= 7 ? 'stage-mastered' : ''}`}
                  >
                    <div className="progress-stage-name">{stage.name}</div>
                    <div className="progress-stage-count">{count}</div>
                    <div className="progress-stage-bar">
                      <div
                        className="progress-stage-bar-fill"
                        style={{ width: `${barPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Answer statistics */}
          <div className="progress-section">
            <h2>Answer Statistics</h2>
            <div className="progress-answer-stats">
              <div className="progress-answer-item">
                <div className="progress-answer-label">Correct</div>
                <div className="progress-answer-value correct">{progressStats.totalKnown}</div>
              </div>
              <div className="progress-answer-item">
                <div className="progress-answer-label">Incorrect</div>
                <div className="progress-answer-value incorrect">{progressStats.totalUnknown}</div>
              </div>
              <div className="progress-answer-item">
                <div className="progress-answer-label">Accuracy</div>
                <div className="progress-answer-value">{accuracy}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
