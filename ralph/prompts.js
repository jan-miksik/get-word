/**
 * Prompt templates for the structured AI coding agent workflow.
 * Separates planning and implementation prompts for better phase control.
 */

/**
 * Generate the verification prompt — checks build + tests after implementation.
 * @param {object} task
 * @param {string} errorOutput - output from failed build/test
 */
export function buildFixPrompt(task, errorOutput) {
  return `You are fixing a failed build or test in the Get Word codebase (Next.js + Drizzle ORM + Postgres).

TASK: ${task.description} (category: ${task.category})

PHASE: FIXING
The last implementation attempt produced errors:

\`\`\`
${errorOutput.slice(0, 3000)}
\`\`\`

Diagnose the root cause and fix it. Do NOT rewrite everything — make targeted edits.
After fixing, re-run pnpm run build and pnpm test to confirm the fix works.`;
}

/**
 * Generate the simple (combined) prompt — for quick/simple tasks that don't need planning.
 * @param {object} task
 * @param {string} progressSummary
 */
export function buildSimplePrompt(task, progressSummary) {
  return `You are working on the Get Word codebase (Next.js + Drizzle ORM + Postgres).

Pick this task and implement it:
TASK: ${task.description} (category: ${task.category})
STEPS:
${task.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

RECENT PROGRESS:
${progressSummary || 'No prior context.'}

Follow @CLAUDE.md guidelines.
Run: pnpm run build && pnpm test
After completion: mark passes=true in prd.json, update agent-progress.txt, git commit.

When ALL tasks in prd.json have passes=true, output: <complete>ALL_TASKS_DONE</complete>`;
}
