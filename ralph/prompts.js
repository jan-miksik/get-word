/**
 * Prompt templates for the structured AI coding agent workflow.
 * Separates planning and implementation prompts for better phase control.
 */

/**
 * Generate the planning prompt for a given task.
 * Claude produces a concise implementation plan before touching code.
 * @param {object} task
 * @param {string} progressSummary
 */
export function buildPlanningPrompt(task, progressSummary) {
  return `You are implementing a feature for the Heppy Market codebase (Cloudflare Workers + Nuxt 4).

TASK: ${task.description} (category: ${task.category})

STEPS TO COMPLETE:
${task.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

RECENT PROGRESS:
${progressSummary || 'No prior context.'}

PHASE: PLANNING
Before touching any code, output a concise implementation plan:
1. List the files you will modify or create
2. Describe the key design decisions
3. Identify any risks or blockers
4. Confirm you understand the task scope

Output the plan in <plan> tags. Do NOT write code yet.`;
}

/**
 * Generate the implementation prompt for a given task.
 * Uses the plan as context and drives Claude to implement.
 * @param {object} task
 * @param {string} plan - from buildPlanningPrompt output
 * @param {string} progressSummary
 */
export function buildImplementationPrompt(task, plan, progressSummary) {
  return `You are implementing a feature for the Heppy Market codebase (Cloudflare Workers + Nuxt 4).

TASK: ${task.description} (category: ${task.category})

IMPLEMENTATION PLAN (already approved):
${plan}

RECENT PROGRESS:
${progressSummary || 'No prior context.'}

PHASE: IMPLEMENTING
Follow the plan above. Implement each step using targeted edits (not full file rewrites).

Rules:
- Use Edit tool for targeted changes, Write only for new files
- Run npm run build to verify TypeScript after changes
- Run npm run test (API tests only) to verify correctness
- After completing all steps: mark passes=true in prd.json, update agent-progress.txt, git commit

When ALL tasks in prd.json have passes=true, output: <complete>ALL_TASKS_DONE</complete>`;
}

/**
 * Generate the verification prompt — checks build + tests after implementation.
 * @param {object} task
 * @param {string} errorOutput - output from failed build/test
 */
export function buildFixPrompt(task, errorOutput) {
  return `You are fixing a failed build or test in the Heppy Market codebase.

TASK: ${task.description} (category: ${task.category})

PHASE: FIXING
The last implementation attempt produced errors:

\`\`\`
${errorOutput.slice(0, 3000)}
\`\`\`

Diagnose the root cause and fix it. Do NOT rewrite everything — make targeted edits.
After fixing, re-run npm run build and npm run test to confirm the fix works.`;
}

/**
 * Generate the simple (combined) prompt — for quick/simple tasks that don't need planning.
 * @param {object} task
 * @param {string} progressSummary
 */
export function buildSimplePrompt(task, progressSummary) {
  return `You are working on the Heppy Market codebase (Cloudflare Workers + Nuxt 4).

Pick this task and implement it:
TASK: ${task.description} (category: ${task.category})
STEPS:
${task.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

RECENT PROGRESS:
${progressSummary || 'No prior context.'}

Follow @CLAUDE.md guidelines.
Run: npm run build && npx vitest run --project api
After completion: mark passes=true in prd.json, update agent-progress.txt, git commit.

When ALL tasks in prd.json have passes=true, output: <complete>ALL_TASKS_DONE</complete>`;
}
