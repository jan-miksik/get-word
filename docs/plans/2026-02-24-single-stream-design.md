# Single Stream Design (2026-02-24)

## Summary
Remove the "Ready to repeat" tab and merge due cards into the main stream.

## Stream Order
1. Due cards (isDue) — sorted by nextDueAt ascending (most overdue first), flat, no headers
2. New/forgotten cards (stageIndex 0) — flat, immediately after due
3. Settling in (stageIndex > 0, not due) — hidden behind "Show N settling in" button (unchanged)

## Stage Label on Card
Small text label in the card, near action buttons:
- Stage 0: no label
- Stage 1+: current interval name e.g. "3 days"
- Due cards: "● 1 day" (accent dot + interval)

## BottomNav → Info Bar
Remove tab buttons. Single centered read-only element:
- readyCount > 0 → "● N ready to repeat"
- readyCount === 0 → hidden

## VirtualizedWordList
Add `showHeaders?: boolean` prop (default true). When false: skip header items, remove sticky stage-name header. List renders flat cards only.

## State Changes
Remove `currentTab` / `setCurrentTab` from useAppState — no longer needed.
