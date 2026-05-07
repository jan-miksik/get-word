/**
 * Progress tracking — structured JSON instead of plain text.
 * Reads/writes ralph.progress.json alongside agent-progress.txt.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const PROGRESS_JSON = 'ralph.progress.json';

/**
 * @typedef {Object} RalphRun
 * @property {string} startedAt
 * @property {string | null} completedAt
 * @property {number | null} durationMs - elapsed time in milliseconds
 * @property {string | null} durationHuman - human-readable duration (e.g. "2m 34s")
 * @property {number} iteration
 * @property {string} taskCategory
 * @property {string} taskDescription
 * @property {string} phase  - planning | implementing | verifying | fixing | done
 * @property {boolean} success
 * @property {string | null} error
 */

/**
 * @typedef {Object} RalphProgress
 * @property {string} lastUpdated
 * @property {number} totalIterations
 * @property {number} totalDurationMs - cumulative time across all runs
 * @property {string} totalDurationHuman - human-readable cumulative time
 * @property {string | null} sessionStartedAt - when the current ralph session began
 * @property {RalphRun[]} runs
 */

/**
 * Format milliseconds as human-readable duration.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Load progress from ralph.progress.json.
 * @param {string} rootDir
 * @returns {RalphProgress}
 */
export function loadProgress(rootDir) {
  const path = join(rootDir, PROGRESS_JSON);
  if (!existsSync(path)) {
    return {
      lastUpdated: new Date().toISOString(),
      totalIterations: 0,
      totalDurationMs: 0,
      totalDurationHuman: '0s',
      sessionStartedAt: null,
      runs: [],
    };
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Save progress to ralph.progress.json.
 * @param {string} rootDir
 * @param {RalphProgress} progress
 */
export function saveProgress(rootDir, progress) {
  const path = join(rootDir, PROGRESS_JSON);
  progress.lastUpdated = new Date().toISOString();
  writeFileSync(path, JSON.stringify(progress, null, 2) + '\n', 'utf-8');
}

/**
 * Append a completed run to the progress log with timing data.
 * @param {string} rootDir
 * @param {Omit<RalphRun, 'completedAt' | 'durationMs' | 'durationHuman'>} run
 */
export function recordRun(rootDir, run) {
  const completedAt = new Date().toISOString();
  const durationMs = new Date(completedAt).getTime() - new Date(run.startedAt).getTime();
  const durationHuman = formatDuration(durationMs);

  const progress = loadProgress(rootDir);
  progress.totalIterations++;
  progress.totalDurationMs = (progress.totalDurationMs || 0) + durationMs;
  progress.totalDurationHuman = formatDuration(progress.totalDurationMs);
  progress.runs.push({ ...run, completedAt, durationMs, durationHuman });
  // Keep last 100 runs to avoid unbounded growth
  if (progress.runs.length > 100) {
    progress.runs = progress.runs.slice(-100);
  }
  saveProgress(rootDir, progress);
}

/**
 * Get a short summary of recent runs for prompt context.
 * @param {string} rootDir
 * @param {number} n - number of recent runs to include
 * @returns {string}
 */
export function getRecentSummary(rootDir, n = 3) {
  const progress = loadProgress(rootDir);
  const recent = progress.runs.slice(-n);
  if (recent.length === 0) return '';
  return recent
    .map(
      (r) =>
        `[${r.taskCategory}] ${r.taskDescription} — ${r.success ? '✓ done' : `✗ ${r.error ?? 'failed'}`} (iter ${r.iteration}, ${r.durationHuman ?? '?'})`
    )
    .join('\n');
}
