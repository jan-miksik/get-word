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
import { recordRun, getRecentSummary, loadProgress, saveProgress, formatDuration } from './progress.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

const maxIterations = parseInt(process.argv[2] ?? '20', 10);
if (isNaN(maxIterations) || maxIterations < 1) {
  console.error('Usage: node ralph/index.js <max-iterations>');
  process.exit(1);
}

const sessionStartedAt = new Date().toISOString();

// Record session start
const initialProgress = loadProgress(ROOT_DIR);
initialProgress.sessionStartedAt = sessionStartedAt;
saveProgress(ROOT_DIR, initialProgress);

console.log('╔══════════════════════════════════════╗');
console.log('║  Ralph — Autonomous Coding Agent      ║');
console.log('╚══════════════════════════════════════╝');
console.log(`Max iterations: ${maxIterations}`);
console.log(`Root: ${ROOT_DIR}`);
console.log(`Session started: ${sessionStartedAt}`);
if (initialProgress.totalDurationMs > 0) {
  console.log(`Prior total time: ${initialProgress.totalDurationHuman}`);
}
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
    const elapsed = Date.now() - new Date(sessionStartedAt).getTime();
    const prog = loadProgress(ROOT_DIR);
    console.log(`\n✅ All tasks complete!`);
    console.log(`⏱  Session time:   ${formatDuration(elapsed)}`);
    console.log(`⏱  All-time total: ${prog.totalDurationHuman}`);
    process.exit(0);
  }

  console.log(`\nNext task: [${task.category}] ${task.description}`);

  const progressSummary = getRecentSummary(ROOT_DIR, 3);

  const startedAt = new Date().toISOString();
  const { success, complete, error } = await executeTask(task, progressSummary, ROOT_DIR);

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
    const elapsed = Date.now() - new Date(sessionStartedAt).getTime();
    const prog = loadProgress(ROOT_DIR);
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║  ✅ ALL_TASKS_DONE                    ║');
    console.log('╚══════════════════════════════════════╝');
    console.log(`⏱  Session time:   ${formatDuration(elapsed)}`);
    console.log(`⏱  All-time total: ${prog.totalDurationHuman}`);
    process.exit(0);
  }

  // Show timing for this iteration
  const iterDuration = Date.now() - new Date(startedAt).getTime();
  console.log(`\n⏱  Iteration time: ${formatDuration(iterDuration)}`);

  // Show cumulative session time
  const sessionElapsed = Date.now() - new Date(sessionStartedAt).getTime();
  console.log(`⏱  Session total:  ${formatDuration(sessionElapsed)}`);

  if (!success) {
    console.error(`\n⚠️  Task failed: ${error}`);
    console.error('Continuing to next iteration...');
  }

  if (iteration < maxIterations) {
    console.log('\n⏸  2s pause...');
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const finalSessionElapsed = Date.now() - new Date(sessionStartedAt).getTime();
const finalProgress = loadProgress(ROOT_DIR);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`🏁 Reached ${maxIterations} iterations`);
console.log(`⏱  Session time:   ${formatDuration(finalSessionElapsed)}`);
console.log(`⏱  All-time total: ${finalProgress.totalDurationHuman}`);
console.log('📊 Review: git log');
console.log('📝 Progress: cat ralph.progress.json');
console.log('⏭️  Run again if more work remains');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
