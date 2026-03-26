/**
 * Planner — reads prd.json and selects the next task to implement.
 * Task selection priority: foundation first, risky integrations before routine work.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const PRIORITY_ORDER = [
  'architecture',
  'migration',
  'stability',
  'security',
  'performance',
  'caching',
  'rate-limiting',
  'orchestration',
  'realtime',
  'queues',
  'testing',
  'observability',
  // meta tasks last
  'meta:orchestrator',
  'meta:experimental',
];

/**
 * Read prd.json and return all tasks.
 * @param {string} rootDir
 * @returns {Array<{category: string, description: string, steps: string[], passes: boolean}>}
 */
export function readTasks(rootDir) {
  const prdPath = join(rootDir, 'prd.json');
  const raw = readFileSync(prdPath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Select the next task that hasn't passed yet.
 * Uses PRIORITY_ORDER to prefer foundational work.
 * @param {ReturnType<typeof readTasks>} tasks
 * @returns {ReturnType<typeof readTasks>[0] | null}
 */
export function selectNextTask(tasks) {
  const pending = tasks.filter((t) => !t.passes);
  if (pending.length === 0) return null;

  // Sort by category priority (lower index = higher priority)
  const withPriority = pending.map((t) => ({
    task: t,
    priority: PRIORITY_ORDER.indexOf(t.category),
  }));
  withPriority.sort((a, b) => {
    const pa = a.priority === -1 ? 999 : a.priority;
    const pb = b.priority === -1 ? 999 : b.priority;
    return pa - pb;
  });

  return withPriority[0].task;
}

/**
 * Count pending and completed tasks.
 * @param {ReturnType<typeof readTasks>} tasks
 */
export function getTaskStats(tasks) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.passes).length;
  const pending = total - completed;
  return { total, completed, pending };
}
