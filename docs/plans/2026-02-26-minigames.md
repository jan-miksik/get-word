# Minigames Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Inject three inline minigame cards (Multiple Choice, Typing Challenge, Matching Pairs) into the word stream at random 5–10 card intervals, as practice-only cards that respect the Czech/Vietnamese role setting.

**Architecture:** Add a `MiniGameConfig` discriminated union to the stream items. Extend `VirtualizedWordList` to render a `'minigame'` virtual item type. Inject game configs in `page.tsx` via a `useMemo` that mixes them into the flat word stream. Game components live in `components/games/` and are purely presentational (no SRS side-effects).

**Tech Stack:** Next.js 15, React 19, Tailwind v4, CSS variables from `styles.css`, vitest + jsdom for unit tests.

---

## Design Context

App is dark forest-green with navy cards (`rgba(15,23,42,0.96)`), sky-blue accent (`#38bdf8`), border-radius 18px, and CSS vars: `--accent`, `--danger`, `--done`, `--fresh`, `--text`, `--text-soft`, `--border-subtle`, `--shadow-soft`, `--transition-fast`, `--transition-med`.

Each game type gets a subtle top-border accent colour:
- **Multiple Choice** → `--accent` (sky blue `#38bdf8`)
- **Typing Challenge** → `--fresh` (amber `#fbbf24`)
- **Matching Pairs** → `--done` (emerald `#22c55e`)

Minigame cards use the same `.phrase-card` base but add `game-card` class and a visual "game type" pill badge. Answer states:
- Correct → green glow + ✓
- Wrong → red flash (CSS `@keyframes shake`) + show correct answer
- Close (good letters, wrong diacritics) → amber/yellow (Typing only)

---

## Task 1: Core types and utility — `lib/minigames.ts`

**Files:**
- Create: `lib/minigames.ts`
- Create: `lib/__tests__/minigames.test.ts`

**Step 1: Write the failing tests**

```ts
// lib/__tests__/minigames.test.ts
import { describe, it, expect } from 'vitest';
import { matchAnswer, injectMinigames } from '../minigames';
import type { NormalizedWord } from '../words';

const makeWord = (id: string, cz: string, vi: string): NormalizedWord => ({
  id, cz, vi, en: '', category: ['word'],
});

describe('matchAnswer', () => {
  it('returns exact for identical strings', () => {
    expect(matchAnswer('pes', 'pes')).toBe('exact');
  });
  it('is case-insensitive for exact', () => {
    expect(matchAnswer('Pes', 'pes')).toBe('exact');
  });
  it('returns close when only diacritics differ', () => {
    expect(matchAnswer('pesl', 'pešl')).toBe('close'); // š vs s
    expect(matchAnswer('a', 'â')).toBe('close');
    expect(matchAnswer('con meo', 'con mèo')).toBe('close');
  });
  it('returns wrong for different base letters', () => {
    expect(matchAnswer('cat', 'pes')).toBe('wrong');
  });
  it('trims whitespace', () => {
    expect(matchAnswer('  pes  ', 'pes')).toBe('exact');
  });
});

describe('injectMinigames', () => {
  const words = Array.from({ length: 20 }, (_, i) =>
    makeWord(`w${i}`, `cz${i}`, `vi${i}`)
  );
  const pool = words.slice(0, 10).map(w => ({ ...w, _stageIndex: 1 }));

  it('returns original words when pool is too small', () => {
    const result = injectMinigames(words, [], 'cz');
    expect(result.every(item => !('_isMinigame' in item))).toBe(true);
  });

  it('injects at least one game into 20 words with sufficient pool', () => {
    const result = injectMinigames(words, words, 'cz');
    expect(result.some(item => '_isMinigame' in item)).toBe(true);
  });

  it('never injects two consecutive minigames', () => {
    const result = injectMinigames(words, words, 'cz');
    for (let i = 0; i < result.length - 1; i++) {
      if ('_isMinigame' in result[i]) {
        expect('_isMinigame' in result[i + 1]).toBe(false);
      }
    }
  });

  it('each game has at least 4 words', () => {
    const result = injectMinigames(words, words, 'cz');
    result.forEach(item => {
      if ('_isMinigame' in item) {
        expect(item.words.length).toBeGreaterThanOrEqual(4);
      }
    });
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
cd /Users/janmiksik/Desktop/projects/own/+/lang-learning-app/wordlink
pnpm vitest run lib/__tests__/minigames.test.ts
```

Expected: FAIL – "Cannot find module '../minigames'"

**Step 3: Implement `lib/minigames.ts`**

```ts
import type { NormalizedWord } from './words';

export type GameType = 'multipleChoice' | 'typing' | 'matching';

export interface MiniGameConfig {
  _isMinigame: true;
  id: string;
  gameType: GameType;
  /** 4 words used in the game */
  words: NormalizedWord[];
}

export type StreamItem = NormalizedWord | MiniGameConfig;

/** Returns 'exact' | 'close' (right letters, wrong diacritics) | 'wrong' */
export function matchAnswer(input: string, correct: string): 'exact' | 'close' | 'wrong' {
  const trim = (s: string) => s.trim().toLowerCase();
  if (trim(input) === trim(correct)) return 'exact';
  // Strip all combining diacritical marks (NFD decomposition)
  const strip = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (strip(input) === strip(correct)) return 'close';
  return 'wrong';
}

const GAME_CYCLE: GameType[] = ['multipleChoice', 'typing', 'matching'];

/**
 * Injects MiniGameConfig items into a flat word array at random 5–10 card intervals.
 * Returns a new array mixing NormalizedWord and MiniGameConfig.
 */
export function injectMinigames(
  words: NormalizedWord[],
  learnedPool: NormalizedWord[],
  _role: 'cz' | 'vi',
  seed?: number,
): StreamItem[] {
  // Need at least 4 learned words to build any game
  if (learnedPool.length < 4) return [...words];

  const result: StreamItem[] = [];
  let counter = 0;
  let gameIndex = 0;
  // Use seed for stable randomness if provided (useful for tests); else Math.random
  const rand = seed !== undefined
    ? (() => { let s = seed; return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; }; })()
    : Math.random.bind(Math);

  let nextThreshold = 5 + Math.floor(rand() * 6); // 5–10

  for (const word of words) {
    result.push(word);
    counter++;

    if (counter >= nextThreshold) {
      // Pick 4 words from learnedPool (shuffle deterministically with rand)
      const shuffled = [...learnedPool].sort(() => rand() - 0.5);
      const gameWords = shuffled.slice(0, 4);

      result.push({
        _isMinigame: true,
        id: `game-${gameIndex}-${result.length}`,
        gameType: GAME_CYCLE[gameIndex % GAME_CYCLE.length],
        words: gameWords,
      });

      gameIndex++;
      counter = 0;
      nextThreshold = 5 + Math.floor(rand() * 6);
    }
  }

  return result;
}
```

**Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run lib/__tests__/minigames.test.ts
```

Expected: PASS (all 8 tests)

**Step 5: Commit**

```bash
git add lib/minigames.ts lib/__tests__/minigames.test.ts
git commit -m "feat: add minigames types, matchAnswer, and injectMinigames utility"
```

---

## Task 2: Multiple Choice game component

**Files:**
- Create: `components/games/MultipleChoiceGame.tsx`

**Design:**
- Sky-blue top accent border
- Game type badge pill: "🎯 Choice"
- Large prompt word centered
- 2×2 grid of answer option buttons
- On tap: button turns green (correct) or red (wrong + correct highlighted)
- A small "Next →" link appears after answering to dismiss the card

**Implementation:**

```tsx
// components/games/MultipleChoiceGame.tsx
'use client';

import { useState, useMemo } from 'react';
import type { NormalizedWord } from '@/lib/words';

interface Props {
  words: NormalizedWord[];   // 4 words; words[0] is the question word
  role: 'cz' | 'vi';
  onDismiss: () => void;
}

export function MultipleChoiceGame({ words, role, onDismiss }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  // The question word is always words[0]
  const questionWord = words[0];
  // Prompt = show known language; options = target language
  const prompt = role === 'cz' ? questionWord.cz : questionWord.vi;
  const getOption = (w: NormalizedWord) => role === 'cz' ? w.vi : w.cz;
  const correctAnswer = getOption(questionWord);

  // Shuffle options once (stable via useMemo)
  const options = useMemo(
    () => [...words].sort(() => Math.random() - 0.5).map(w => ({
      id: w.id,
      label: getOption(w),
      isCorrect: w.id === questionWord.id,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, role]
  );

  const answered = selected !== null;

  const handleSelect = (optionId: string) => {
    if (answered) return;
    setSelected(optionId);
  };

  return (
    <article className="phrase-card game-card game-card--choice">
      <div className="game-badge">🎯 Choice</div>

      <div className="game-prompt">{prompt}</div>

      <div className="game-options-grid">
        {options.map(opt => {
          let state: 'idle' | 'correct' | 'wrong' | 'reveal' = 'idle';
          if (answered) {
            if (opt.id === selected && opt.isCorrect) state = 'correct';
            else if (opt.id === selected && !opt.isCorrect) state = 'wrong';
            else if (opt.isCorrect) state = 'reveal';
          }
          return (
            <button
              key={opt.id}
              type="button"
              className={`game-option game-option--${state}`}
              onClick={() => handleSelect(opt.id)}
              disabled={answered}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="game-feedback">
          {selected && options.find(o => o.id === selected)?.isCorrect
            ? '✓ Correct!'
            : `✗  ${correctAnswer}`}
          <button type="button" className="game-dismiss" onClick={onDismiss}>
            Next →
          </button>
        </div>
      )}
    </article>
  );
}
```

**Step: Commit**

```bash
git add components/games/MultipleChoiceGame.tsx
git commit -m "feat: add MultipleChoiceGame component"
```

---

## Task 3: Typing Challenge game component

**Files:**
- Create: `components/games/TypingChallengeGame.tsx`

**Design:**
- Amber top accent border
- Game type badge: "⌨️ Type it"
- Prompt word centered
- Text input field with `[Check]` button
- Result states: green border (exact), amber border (close — right letters, wrong diacritics), red border (wrong) + shows correct
- Dismiss after one attempt via "Next →"

**Implementation:**

```tsx
// components/games/TypingChallengeGame.tsx
'use client';

import { useState, useRef } from 'react';
import type { NormalizedWord } from '@/lib/words';
import { matchAnswer } from '@/lib/minigames';

interface Props {
  words: NormalizedWord[];   // words[0] is the question word
  role: 'cz' | 'vi';
  onDismiss: () => void;
}

export function TypingChallengeGame({ words, role, onDismiss }: Props) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<'exact' | 'close' | 'wrong' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const questionWord = words[0];
  const prompt = role === 'cz' ? questionWord.cz : questionWord.vi;
  const correctAnswer = role === 'cz' ? questionWord.vi : questionWord.cz;

  const check = () => {
    if (result !== null) return;
    const r = matchAnswer(value, correctAnswer);
    setResult(r);
  };

  const resultLabels = {
    exact: '✓ Perfect!',
    close: '~ Close! Watch the diacritics',
    wrong: `✗  ${correctAnswer}`,
  };

  return (
    <article className="phrase-card game-card game-card--typing">
      <div className="game-badge">⌨️ Type it</div>

      <div className="game-prompt">{prompt}</div>

      <div className="game-typing-area">
        <input
          ref={inputRef}
          type="text"
          className={`game-input${result ? ` game-input--${result}` : ''}`}
          placeholder="Type translation…"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') check(); }}
          disabled={result !== null}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {result === null && (
          <button type="button" className="game-check-btn" onClick={check}>
            Check
          </button>
        )}
      </div>

      {result !== null && (
        <div className={`game-feedback game-feedback--${result}`}>
          {resultLabels[result]}
          <button type="button" className="game-dismiss" onClick={onDismiss}>
            Next →
          </button>
        </div>
      )}
    </article>
  );
}
```

**Step: Commit**

```bash
git add components/games/TypingChallengeGame.tsx
git commit -m "feat: add TypingChallengeGame component with diacritics-aware matching"
```

---

## Task 4: Matching Pairs game component

**Files:**
- Create: `components/games/MatchingPairsGame.tsx`

**Design:**
- Emerald top accent border
- Game type badge: "🔗 Match"
- Two columns: left = known language, right = shuffled target language
- Tap one from each column; correct = both turn green and lock; wrong = brief red flash then reset selection
- Complete state when all 4 pairs matched; shows "Done! →" dismiss

**Implementation:**

```tsx
// components/games/MatchingPairsGame.tsx
'use client';

import { useState, useMemo } from 'react';
import type { NormalizedWord } from '@/lib/words';

interface Props {
  words: NormalizedWord[];   // exactly 4 words
  role: 'cz' | 'vi';
  onDismiss: () => void;
}

type SelectionState = 'idle' | 'selected' | 'matched' | 'wrong';

export function MatchingPairsGame({ words, role, onDismiss }: Props) {
  // Shuffle right column once
  const rightOrder = useMemo(
    () => [...words].sort(() => Math.random() - 0.5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words]
  );

  const [leftSelected, setLeftSelected] = useState<string | null>(null);
  const [rightSelected, setRightSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null);

  const getLeft = (w: NormalizedWord) => role === 'cz' ? w.cz : w.vi;
  const getRight = (w: NormalizedWord) => role === 'cz' ? w.vi : w.cz;

  const isComplete = matched.size === words.length;

  const attempt = (lId: string, rId: string) => {
    if (lId === rId) {
      // Correct match
      setMatched(prev => new Set([...prev, lId]));
      setLeftSelected(null);
      setRightSelected(null);
    } else {
      // Wrong
      setWrongPair([lId, rId]);
      setTimeout(() => {
        setWrongPair(null);
        setLeftSelected(null);
        setRightSelected(null);
      }, 600);
    }
  };

  const handleLeft = (id: string) => {
    if (matched.has(id) || wrongPair) return;
    const newLeft = id === leftSelected ? null : id;
    setLeftSelected(newLeft);
    if (newLeft && rightSelected) attempt(newLeft, rightSelected);
  };

  const handleRight = (id: string) => {
    if (matched.has(id) || wrongPair) return;
    const newRight = id === rightSelected ? null : id;
    setRightSelected(newRight);
    if (leftSelected && newRight) attempt(leftSelected, newRight);
  };

  const getLeftState = (id: string): SelectionState => {
    if (matched.has(id)) return 'matched';
    if (wrongPair?.[0] === id) return 'wrong';
    if (leftSelected === id) return 'selected';
    return 'idle';
  };

  const getRightState = (id: string): SelectionState => {
    if (matched.has(id)) return 'matched';
    if (wrongPair?.[1] === id) return 'wrong';
    if (rightSelected === id) return 'selected';
    return 'idle';
  };

  return (
    <article className="phrase-card game-card game-card--matching">
      <div className="game-badge">🔗 Match</div>

      <div className="game-match-grid">
        <div className="game-match-col">
          {words.map(w => (
            <button
              key={w.id}
              type="button"
              className={`game-match-btn game-match-btn--${getLeftState(w.id)}`}
              onClick={() => handleLeft(w.id)}
              disabled={matched.has(w.id) || !!wrongPair}
            >
              {getLeft(w)}
            </button>
          ))}
        </div>
        <div className="game-match-col">
          {rightOrder.map(w => (
            <button
              key={w.id}
              type="button"
              className={`game-match-btn game-match-btn--${getRightState(w.id)}`}
              onClick={() => handleRight(w.id)}
              disabled={matched.has(w.id) || !!wrongPair}
            >
              {getRight(w)}
            </button>
          ))}
        </div>
      </div>

      {isComplete && (
        <div className="game-feedback game-feedback--exact">
          ✓ All matched!
          <button type="button" className="game-dismiss" onClick={onDismiss}>
            Next →
          </button>
        </div>
      )}
    </article>
  );
}
```

**Step: Commit**

```bash
git add components/games/MatchingPairsGame.tsx
git commit -m "feat: add MatchingPairsGame component"
```

---

## Task 5: MiniGameCard wrapper + CSS styles

**Files:**
- Create: `components/MiniGameCard.tsx`
- Modify: `styles.css` — append `.game-card` styles at the end

### 5a: MiniGameCard.tsx

```tsx
// components/MiniGameCard.tsx
'use client';

import type { MiniGameConfig } from '@/lib/minigames';
import { MultipleChoiceGame } from './games/MultipleChoiceGame';
import { TypingChallengeGame } from './games/TypingChallengeGame';
import { MatchingPairsGame } from './games/MatchingPairsGame';

interface Props {
  config: MiniGameConfig;
  role: 'cz' | 'vi';
  onDismiss: () => void;
}

export function MiniGameCard({ config, role, onDismiss }: Props) {
  if (config.gameType === 'multipleChoice') {
    return <MultipleChoiceGame words={config.words} role={role} onDismiss={onDismiss} />;
  }
  if (config.gameType === 'typing') {
    return <TypingChallengeGame words={config.words} role={role} onDismiss={onDismiss} />;
  }
  if (config.gameType === 'matching') {
    return <MatchingPairsGame words={config.words} role={role} onDismiss={onDismiss} />;
  }
  return null;
}
```

### 5b: CSS — append to `styles.css`

Add these styles at the very end of `styles.css`:

```css
/* ─── Minigame Cards ─────────────────────────────────────── */

/* Base game card — sits on top of .phrase-card */
.game-card {
  position: relative;
  overflow: hidden;
  padding: 20px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Coloured top-border accent per game type */
.game-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: 18px 18px 0 0;
}
.game-card--choice::before  { background: var(--accent); }
.game-card--typing::before  { background: var(--fresh); }
.game-card--matching::before { background: var(--done); }

/* Game type badge pill */
.game-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-soft);
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  padding: 3px 10px;
  width: fit-content;
}

/* Prompt word */
.game-prompt {
  font-size: 1.5rem;
  font-weight: 700;
  text-align: center;
  letter-spacing: -0.01em;
  color: var(--text);
  padding: 8px 0 4px;
  line-height: 1.2;
}

/* Multiple choice 2×2 grid */
.game-options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.game-option {
  padding: 12px 10px;
  border-radius: 12px;
  border: 1.5px solid var(--border-subtle);
  background: rgba(255,255,255,0.04);
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast);
  text-align: center;
  line-height: 1.3;
}

.game-option:not(:disabled):hover {
  background: rgba(255,255,255,0.08);
  border-color: var(--accent);
  transform: translateY(-1px);
}

.game-option--idle   { /* default */ }
.game-option--correct {
  background: rgba(34, 197, 94, 0.18);
  border-color: var(--done);
  color: var(--done);
}
.game-option--wrong {
  background: rgba(251, 113, 133, 0.18);
  border-color: var(--danger);
  color: var(--danger);
  animation: game-shake 0.35s ease;
}
.game-option--reveal {
  background: rgba(34, 197, 94, 0.10);
  border-color: rgba(34, 197, 94, 0.4);
  color: var(--done);
  opacity: 0.8;
}

/* Typing area */
.game-typing-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.game-input {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1.5px solid var(--border-subtle);
  background: rgba(255,255,255,0.04);
  color: var(--text);
  font-size: 1rem;
  font-weight: 500;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  text-align: center;
}

.game-input:focus {
  border-color: var(--fresh);
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15);
}

.game-input--exact {
  border-color: var(--done);
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
}

.game-input--close {
  border-color: var(--fresh);
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.2);
}

.game-input--wrong {
  border-color: var(--danger);
  box-shadow: 0 0 0 3px rgba(251, 113, 133, 0.15);
  animation: game-shake 0.35s ease;
}

.game-check-btn {
  padding: 10px 28px;
  border-radius: var(--radius-pill);
  border: 1.5px solid var(--fresh);
  background: rgba(251, 191, 36, 0.1);
  color: var(--fresh);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast);
}

.game-check-btn:hover {
  background: rgba(251, 191, 36, 0.2);
  transform: translateY(-1px);
}

/* Matching pairs grid */
.game-match-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.game-match-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.game-match-btn {
  padding: 11px 8px;
  border-radius: 12px;
  border: 1.5px solid var(--border-subtle);
  background: rgba(255,255,255,0.04);
  color: var(--text);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  text-align: center;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast);
  line-height: 1.3;
}

.game-match-btn:not(:disabled):hover {
  background: rgba(255,255,255,0.08);
  border-color: var(--done);
  transform: translateY(-1px);
}

.game-match-btn--selected {
  background: rgba(34, 197, 94, 0.1);
  border-color: var(--done);
  color: var(--done);
}

.game-match-btn--matched {
  background: rgba(34, 197, 94, 0.15);
  border-color: var(--done);
  color: var(--done);
  opacity: 0.7;
  cursor: default;
}

.game-match-btn--wrong {
  background: rgba(251, 113, 133, 0.18);
  border-color: var(--danger);
  color: var(--danger);
  animation: game-shake 0.35s ease;
}

/* Feedback row */
.game-feedback {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-subtle);
}

.game-feedback--exact { color: var(--done); }
.game-feedback--close { color: var(--fresh); }
.game-feedback--wrong { color: var(--danger); }

.game-dismiss {
  margin-left: auto;
  padding: 6px 16px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-soft);
  font-size: 0.8rem;
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
  white-space: nowrap;
}

.game-dismiss:hover {
  color: var(--text);
  border-color: var(--text-soft);
}

/* Shake animation for wrong answers */
@keyframes game-shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-5px); }
  40%       { transform: translateX(5px); }
  60%       { transform: translateX(-4px); }
  80%       { transform: translateX(4px); }
}
```

**Step: Commit**

```bash
git add components/MiniGameCard.tsx styles.css
git commit -m "feat: add MiniGameCard wrapper and minigame CSS styles"
```

---

## Task 6: Extend VirtualizedWordList to support minigame items

**Files:**
- Modify: `components/VirtualizedWordList.tsx`

**Changes needed:**
1. Import `MiniGameConfig` and `StreamItem` from `@/lib/minigames`
2. Add `{ type: 'minigame'; config: MiniGameConfig; stageIndex: number }` to `VirtualItem` union
3. Change `groupedWords: NormalizedWord[][]` prop to `groupedWords: (NormalizedWord | MiniGameConfig)[][]`
4. Add `renderMiniGame?: (config: MiniGameConfig) => ReactNode` prop
5. In the `items` useMemo: check `'_isMinigame' in word` to push the right item type
6. In `estimateSize`: return `520` for minigame items
7. In `getItemKey`: use `config.id` for minigame items
8. In `totalWords` count: exclude minigame items (so empty-state check isn't affected by injected games)
9. In the render: handle `item.type === 'minigame'` → call `renderMiniGame?.(item.config) ?? null`

**Key diff for the items useMemo** (around line 43–60 in current file):

```ts
// Old:
words.forEach(word => {
  flat.push({ type: 'card', word, stageIndex });
});

// New:
words.forEach(item => {
  if ('_isMinigame' in item) {
    flat.push({ type: 'minigame', config: item, stageIndex });
  } else {
    flat.push({ type: 'card', word: item, stageIndex });
  }
});
```

**Key diff for estimateSize** (around line 110–123):

```ts
// Add before the return 420:
if (item.type === 'minigame') return 520;
```

**Key diff for getItemKey** (around line 104–109):

```ts
// Add before the word.id return:
if (item.type === 'minigame') return item.config.id;
```

**Key diff for totalWords** (around line 164–166):

```ts
// Old:
return groupedWords.reduce((sum, words) => sum + (words?.length || 0), 0);

// New: only count actual word items
return groupedWords.reduce(
  (sum, items) =>
    sum + (items?.filter(i => !('_isMinigame' in i)).length || 0),
  0
);
```

**Key diff for render** (around line 350–364, after footer handling):

```tsx
// Add after the footer block and before the word card block:
if (item.type === 'minigame') {
  return (
    <div
      key={item.config.id}
      data-index={virtualRow.index}
      ref={virtualizer.measureElement}
      className="absolute top-0 left-0 right-0"
      style={{ transform: `translateY(${offset}px)`, width: '100%', willChange: 'transform' }}
    >
      {renderMiniGame?.(item.config) ?? null}
    </div>
  );
}
```

**Step: Commit**

```bash
git add components/VirtualizedWordList.tsx
git commit -m "feat: extend VirtualizedWordList to render minigame items"
```

---

## Task 7: Wire everything together in page.tsx

**Files:**
- Modify: `app/page.tsx`

**Changes needed:**

1. Import `injectMinigames`, `MiniGameConfig`, `StreamItem` from `@/lib/minigames`
2. Import `MiniGameCard` from `@/components/MiniGameCard`
3. Add `dismissedGames` state: `const [dismissedGames, setDismissedGames] = useState<Set<string>>(new Set())`
4. Add `learnedPool` memo (words with stageIndex > 0)
5. Replace `streamGroupedWords` useMemo: inject minigames into due+new slots
6. Add `renderMiniGame` callback
7. Pass `renderMiniGame` to `VirtualizedWordList`

**New learnedPool memo:**

```ts
const learnedPool = useMemo(
  () => filteredWords.filter(w => (progress[w.id]?.stageIndex ?? 0) > 0),
  [filteredWords, progress]
);
```

**Updated streamGroupedWords useMemo** (replace the existing one):

```ts
const streamGroupedWords = useMemo((): (NormalizedWord | MiniGameConfig)[][] => {
  const groups: (NormalizedWord | MiniGameConfig)[][] = STAGES.map(() => []);

  if (!isHydrated) return groups;

  // Inject games into due + new words combined stream
  const combined = [...dueWords, ...newWords];
  const injected = injectMinigames(combined, learnedPool, role);
  // Re-split: due words live in slot 0, new in slot 1
  const dueCount = dueWords.length;
  let wordsSeen = 0;
  injected.forEach(item => {
    if (!('_isMinigame' in item)) wordsSeen++;
    // Assign items to slot 0 until we've passed all due words
    if (wordsSeen <= dueCount) {
      groups[0].push(item);
    } else {
      groups[1].push(item);
    }
  });

  if (showNotReady) {
    settlingWords.forEach(word => {
      const sIdx = Math.max(2, Math.min(progress[word.id]?.stageIndex ?? 2, STAGES.length - 1));
      groups[sIdx].push(word);
    });
  }

  return groups;
}, [dueWords, newWords, settlingWords, showNotReady, progress, filteredWords, isHydrated, role, learnedPool]);
```

**renderMiniGame callback** (add alongside renderCard):

```ts
const renderMiniGame = useCallback((config: MiniGameConfig) => {
  if (dismissedGames.has(config.id)) return null;
  return (
    <div key={config.id} className="pt-8">
      <MiniGameCard
        config={config}
        role={role}
        onDismiss={() => setDismissedGames(prev => new Set([...prev, config.id]))}
      />
    </div>
  );
}, [dismissedGames, role]);
```

**VirtualizedWordList — add renderMiniGame prop:**

```tsx
<VirtualizedWordList
  key="stream"
  dataTab="stream"
  groupedWords={streamGroupedWords}
  renderCard={renderCard}
  renderMiniGame={renderMiniGame}   // ← add this line
  showHeaders={false}
  scrollElement={phrasesScrollElement}
  emptyMessage="No words to display."
  stageFooter={...}
/>
```

**Step: Commit**

```bash
git add app/page.tsx
git commit -m "feat: inject minigame cards into word stream in page.tsx"
```

---

## Task 8: Smoke test and verify

**Step 1: Run unit tests**

```bash
pnpm vitest run
```

Expected: all tests pass (including existing tests + new minigames tests)

**Step 2: Run dev server and visually verify**

```bash
pnpm dev
```

Open http://localhost:3000 and verify:
- [ ] Minigame cards appear in the scroll stream every ~5–10 word cards
- [ ] Game type rotates: Choice → Typing → Matching → Choice…
- [ ] Multiple Choice: tapping an option shows green/red, then "Next →" dismisses
- [ ] Typing: typing correct answer shows green, diacritic mismatch shows amber, wrong shows red
- [ ] Matching Pairs: correct pair locks in green, wrong flashes red
- [ ] Dismissed games disappear cleanly from the stream
- [ ] Changing `role` (CZ/VI) swaps prompt/answer languages in all games
- [ ] No console errors

**Step 3: Commit if all looks good**

```bash
git add -A
git commit -m "feat: minigames — multiple choice, typing challenge, matching pairs in stream"
```
