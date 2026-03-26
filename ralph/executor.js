/**
 * Executor — runs Claude CLI and captures output.
 * Implements the state machine: planning → implementing → verifying → fixing → done
 */
import { execSync, spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { buildSimplePrompt, buildFixPrompt } from './prompts.js';

const COMPLETE_SIGNAL = '<complete>ALL_TASKS_DONE</complete>';
const MAX_FIX_ATTEMPTS = 2;

/**
 * @typedef {'idle' | 'implementing' | 'verifying' | 'fixing' | 'done'} Phase
 */

/**
 * Run Claude with a prompt in the given directory.
 * Returns { output, exitCode }.
 * @param {string} prompt
 * @param {string} rootDir
 * @returns {{ output: string, exitCode: number }}
 */
export function runClaude(prompt, rootDir) {
  const result = spawnSync(
    'claude',
    ['--dangerously-skip-permissions', '-p', prompt],
    {
      cwd: rootDir,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 10 * 60 * 1000, // 10 min
    }
  );

  const output = (result.stdout ?? '') + (result.stderr ?? '');
  return { output, exitCode: result.status ?? 1 };
}

/**
 * Run build + API tests and return { ok, output }.
 * @param {string} rootDir
 * @returns {{ ok: boolean, output: string }}
 */
export function runVerification(rootDir) {
  try {
    const buildOutput = execSync('npm run build 2>&1', { cwd: rootDir, encoding: 'utf-8', timeout: 120_000 });
    const testOutput = execSync('cd apps/api && npx vitest run 2>&1', { cwd: rootDir, encoding: 'utf-8', timeout: 120_000 });
    return { ok: true, output: buildOutput + '\n' + testOutput };
  } catch (err) {
    return { ok: false, output: err.stdout ?? err.message ?? String(err) };
  }
}

/**
 * Run one complete iteration of the state machine for a task.
 * State transitions:
 *   implementing → verifying → done (success)
 *   verifying    → fixing    → verifying (up to MAX_FIX_ATTEMPTS)
 *
 * @param {object} task
 * @param {string} progressSummary
 * @param {string} rootDir
 * @returns {{ success: boolean, complete: boolean, output: string, error: string | null }}
 */
export async function executeTask(task, progressSummary, rootDir) {
  let phase = 'implementing';
  let fixAttempts = 0;
  let allOutput = '';
  let lastError = null;

  console.log(`\n[ralph] Phase: ${phase.toUpperCase()}`);

  // Implementing phase
  const implPrompt = buildSimplePrompt(task, progressSummary);
  const { output: implOutput, exitCode } = runClaude(implPrompt, rootDir);
  allOutput += implOutput;

  if (exitCode !== 0) {
    lastError = `Claude exited with code ${exitCode}`;
    return { success: false, complete: false, output: allOutput, error: lastError };
  }

  // Check for complete signal
  if (implOutput.includes(COMPLETE_SIGNAL)) {
    return { success: true, complete: true, output: allOutput, error: null };
  }

  // Verifying phase
  phase = 'verifying';
  console.log(`\n[ralph] Phase: ${phase.toUpperCase()}`);

  let { ok: verifyOk, output: verifyOutput } = runVerification(rootDir);
  allOutput += '\n' + verifyOutput;

  // Fixing loop
  while (!verifyOk && fixAttempts < MAX_FIX_ATTEMPTS) {
    fixAttempts++;
    phase = 'fixing';
    console.log(`\n[ralph] Phase: ${phase.toUpperCase()} (attempt ${fixAttempts}/${MAX_FIX_ATTEMPTS})`);

    const fixPrompt = buildFixPrompt(task, verifyOutput);
    const { output: fixOutput, exitCode: fixCode } = runClaude(fixPrompt, rootDir);
    allOutput += '\n' + fixOutput;
    lastError = fixCode !== 0 ? `Fix attempt ${fixAttempts} failed (exit ${fixCode})` : null;

    // Re-verify after fix
    phase = 'verifying';
    const reVerify = runVerification(rootDir);
    allOutput += '\n' + reVerify.output;
    verifyOk = reVerify.ok;
    verifyOutput = reVerify.output;
  }

  if (!verifyOk) {
    lastError = `Verification failed after ${fixAttempts} fix attempt(s). See output for details.`;
    return { success: false, complete: false, output: allOutput, error: lastError };
  }

  return { success: true, complete: false, output: allOutput, error: null };
}
