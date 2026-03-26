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
 * @property {RalphRun[]} runs
 */

/**
 * Load progress from ralph.progress.json.
 * @param {string} rootDir
 * @returns {RalphProgress}
 */
export function loadProgress(rootDir) {
  const path = join(rootDir, PROGRESS_JSON);
  if (!existsSync(path)) {
    return { lastUpdated: new Date().toISOString(), totalIterations: 0, runs: [] };
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
 * Append a completed run to the progress log.
 * @param {string} rootDir
 * @param {Omit<RalphRun, 'completedAt'>} run
 */
export function recordRun(rootDir, run) {
  const progress = loadProgress(rootDir);
  progress.totalIterations++;
  progress.runs.push({ ...run, completedAt: new Date().toISOString() });
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
        `[${r.taskCategory}] ${r.taskDescription} — ${r.success ? '✓ done' : `✗ ${r.error ?? 'failed'}`} (iter ${r.iteration})`
    )
    .join('\n');
}
