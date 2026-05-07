#!/bin/bash

# Ralph - Autonomous AI Coding Loop
# Iteratively works through features in prd.json until complete
#
# Usage: ./ralph.sh <max-iterations>
# Example: ./ralph.sh 20

set -e

if [ -z "$1" ]; then
  echo "Error: Please specify maximum iterations"
  echo "Usage: $0 <max-iterations>"
  echo "Example: $0 20"
  exit 1
fi

MAX_ITERATIONS=$1
PROGRESS_FILE="agent-progress.txt"
PRD_FILE="prd.json"
SESSION_START=$(date +%s)

echo "🤖 Ralph - Autonomous Coding Agent"
echo "📋 Task List: $PRD_FILE"
echo "📝 Progress Log: $PROGRESS_FILE"
echo "🔄 Max Iterations: $MAX_ITERATIONS"
echo "⏱  Started: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

for ((iteration=1; iteration<=MAX_ITERATIONS; iteration++)); do
  ITER_START=$(date +%s)
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Iteration $iteration / $MAX_ITERATIONS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  result=$(claude --dangerously-skip-permissions -p "@$PRD_FILE @$PROGRESS_FILE @CLAUDE.md

Pick ONE task from $PRD_FILE where passes=false.

You don't have to go in order - choose the best next task based on dependencies and what's already done.

Foundation work (db, schema) before APIs. APIs before UI. Risky integrations before routine work.

Implement it following @CLAUDE.md guidelines.

Verify UI changes with Playwright MCP.
Run checks (pnpm run build, pnpm run lint, pnpm test).

After each completed task:
Mark passes=true in the prd.json file (for the completed task), update $PROGRESS_FILE, commit via Git.

When ALL tasks have passes=true, output: <complete>ALL_TASKS_DONE</complete>
" 2>&1) || {
    echo "Error: claude failed with exit code $?"
    echo "Output: $result"
    exit 1
  }

  echo "$result"
  echo ""

  # Show timing
  ITER_END=$(date +%s)
  ITER_ELAPSED=$((ITER_END - ITER_START))
  SESSION_ELAPSED=$((ITER_END - SESSION_START))
  echo "⏱  Iteration: ${ITER_ELAPSED}s | Session: ${SESSION_ELAPSED}s"

  # Check if all work is complete
  if [[ "$result" == *"<complete>ALL_TASKS_DONE</complete>"* ]]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ All tasks complete!"
    echo "⏱  Total session time: ${SESSION_ELAPSED}s"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
  fi

  if [ $iteration -lt $MAX_ITERATIONS ]; then
    echo "⏸  2 second pause..."
    sleep 2
    echo ""
  fi
done

FINAL_ELAPSED=$(($(date +%s) - SESSION_START))
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏁 Reached $MAX_ITERATIONS iterations"
echo "⏱  Total session time: ${FINAL_ELAPSED}s"
echo "📊 Review: git log"
echo "📝 Progress: cat $PROGRESS_FILE"
echo "⏭️  Run again if more work remains"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
