#!/usr/bin/env node
/**
 * Ralph — Structured Autonomous AI Coding Orchestrator (Node.js)
 *
 * Replaces the bash loop in ralph.sh with a structured state machine:
 *   planner (task selection) → executor (implementing/verifying/fixing) → progress (structured JSON)
 *
 * Usage: node ralph/index.js [max-iterations]
 * Example: node ralph/index.js 20
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { readTasks, selectNextTask, getTaskStats } from './planner.js';
import { executeTask } from './executor.js';
import { recordRun, getRecentSummary } from './progress.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

const maxIterations = parseInt(process.argv[2] ?? '20', 10);
if (isNaN(maxIterations) || maxIterations < 1) {
  console.error('Usage: node ralph/index.js <max-iterations>');
  process.exit(1);
}

console.log('╔══════════════════════════════════════╗');
console.log('║  Ralph — Autonomous Coding Agent      ║');
console.log('╚══════════════════════════════════════╝');
console.log(`Max iterations: ${maxIterations}`);
console.log(`Root: ${ROOT_DIR}`);
console.log('');

for (let iteration = 1; iteration <= maxIterations; iteration++) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Iteration ${iteration} / ${maxIterations}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Re-read tasks on every iteration (claude may have updated prd.json)
  const tasks = readTasks(ROOT_DIR);
  const stats = getTaskStats(tasks);
  console.log(`Tasks: ${stats.completed}/${stats.total} done, ${stats.pending} pending`);

  const task = selectNextTask(tasks);
  if (!task) {
    console.log('\n✅ All tasks complete!');
    process.exit(0);
  }

  console.log(`\nNext task: [${task.category}] ${task.description}`);

  const progressSummary = getRecentSummary(ROOT_DIR, 3);

  const startedAt = new Date().toISOString();
  const { success, complete, output, error } = await executeTask(task, progressSummary, ROOT_DIR);

  // Record structured progress
  recordRun(ROOT_DIR, {
    startedAt,
    iteration,
    taskCategory: task.category,
    taskDescription: task.description,
    phase: success ? 'done' : 'fixing',
    success,
    error,
  });

  if (complete) {
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║  ✅ ALL_TASKS_DONE                    ║');
    console.log('╚══════════════════════════════════════╝');
    process.exit(0);
  }

  if (!success) {
    console.error(`\n⚠️  Task failed: ${error}`);
    console.error('Continuing to next iteration...');
  }

  if (iteration < maxIterations) {
    console.log('\n⏸  2s pause...');
    await new Promise((r) => setTimeout(r, 2000));
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`🏁 Reached ${maxIterations} iterations`);
console.log('📊 Review: git log');
console.log('📝 Progress: cat ralph.progress.json');
console.log('⏭️  Run again if more work remains');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
