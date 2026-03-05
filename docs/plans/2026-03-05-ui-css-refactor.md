# ui.css Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split `styles/ui.css` (1099 lines) into component-scoped files and replace small CSS classes (<5 attrs) with Tailwind utilities.

**Architecture:** Create 7 new CSS files under `styles/`, update `app/globals.css` imports, delete `styles/ui.css`. Small classes are migrated to Tailwind in JSX; CSS class definitions removed.

**Tech Stack:** Tailwind CSS v4 (CSS-based theme via `@theme`), Next.js 15, React

---

## Reference: File Split Map

| New file | CSS classes / rules it receives |
|---|---|
| `styles/layout.css` | `.app`, `.app-content-column`, `.app-header` |
| `styles/top-menu.css` | `.mode-btn` + all `.mode-btn.*` variants, `.top-menu` |
| `styles/panels.css` | `.settings-panel`, `.progress-panel`, `.memory-hooks-panel`, `.category-panel`, `.category-chip`, `.category-clear-btn`, shared `.is-open` media query, `.custom-scrollbar`, `.theme-option`, `.theme-preview*` |
| `styles/bottom-nav.css` | `.bottom-nav`, `.bottom-nav-btn` |
| `styles/word-card.css` | `.phrase-card`, `.word-categories`, `.word-category-badge` variants, `.card-time-badge`, `.audio-btn`, `.memory-hook-display`, `.memory-hook-text` (cascade rules only, NOT base position/display), `.memory-hook-container`, `.memory-hook-input`, `.progress-btn`, `.cover-target`, `.is-covered`, `.card-moved`, `@keyframes card-move`, `@keyframes countdown-pulse`, `@keyframes audio-pulse` |
| `styles/progress-summary.css` | `.progress-summary` only — delete `.text-fresh/.text-accent/.text-done` (Tailwind covers them) |
| `styles/animations.css` | `@keyframes fadeIn`, `@keyframes slideUp` (used globally by EditableWordCard via `animate-[...]`) |

## Reference: Tailwind Replacements

| CSS rule | File | Action |
|---|---|---|
| `.word-category-badge.word-category-editable { cursor: pointer }` | `styles/word-card.css` | Delete rule; add `cursor-pointer` conditionally in `WordCard.tsx:167` |
| `.memory-hook-text { position: relative; display: inline-block }` | `styles/word-card.css` | Delete rule; JSX already has `relative inline-block` on same element |
| `.memory-hook-text.placeholder { opacity: 0.6; font-style: italic }` | `styles/word-card.css` | Delete rule; JSX already has `opacity-60 italic` conditionally |
| `.theme-label { font-size: 0.7rem; color: var(--text-soft); font-weight: 500 }` | `styles/panels.css` | Delete rule; replace class in `SettingsPanel.tsx` with Tailwind |
| `.theme-option.is-selected .theme-label { color: var(--accent) }` | `styles/panels.css` | Delete rule; handle inline in `SettingsPanel.tsx` via conditional class |
| `.progress-summary .text-fresh/accent/done { color: ... }` | `styles/progress-summary.css` | Delete all 3 — Tailwind `text-fresh`, `text-accent`, `text-done` already work |

---

## Task 1: Create `styles/layout.css`

**Files:**
- Create: `styles/layout.css`

**Step 1: Create the file** with `.app`, `.app-content-column`, `.app-header` (ui.css lines 1–40).

```css
.app {
  height: 100vh;
  min-height: 100vh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
  overflow: hidden;
}

@media (min-width: 768px) {
  .app {
    padding-top: 32px;
  }
}

/* Main scroll area uses full width of app so scrollbar is at the right edge */
.app > main {
  width: 100%;
  min-width: 0;
  padding-bottom: calc(env(safe-area-inset-bottom, 12px) + 10rem);
}

/* Centered content column: top menu and cards share this max-width */
.app-content-column {
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  width: 100%;
  padding-inline: 16px;
}

.app-header {
  padding: 14px 14px 4px;
  border-radius: 26px;
  background: radial-gradient(circle at top left, #0f172a 0, #020617 55%);
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow: var(--shadow-soft);
}
```

**Step 2: Verify** the file looks correct visually (no edits needed in JSX).

---

## Task 2: Create `styles/top-menu.css`

**Files:**
- Create: `styles/top-menu.css`

**Step 1: Create the file** with all `.mode-btn` variants and `.top-menu` (ui.css lines 43–313).

Copy exactly the block starting at `.mode-btn {` through the end of the `.mode-btn.category-btn[data-count]:not([data-count=""])::after` rule.

---

## Task 3: Create `styles/panels.css`

**Files:**
- Create: `styles/panels.css`

**Step 1: Create the file** with panel rules from ui.css. Include:
- `.settings-panel` (lines 315–335)
- `.settings-panel.is-open` (lines 325–335)
- `.progress-panel` + `.progress-panel.is-open` (lines 337–360)
- `.memory-hooks-panel` + variants (lines 362–392)
- `.category-panel` + `.category-panel.is-open` (lines 395–418)
- `.category-clear-btn` + `:hover` (lines 421–469) — note: duplicate `:hover` exists, include only once
- `.category-chip` + hover + selected states (lines 442–477)
- Shared `@media (min-width: 640px)` panel open max-width (lines 992–1000)
- `.custom-scrollbar` + webkit rules (lines 1023–1044)
- `.theme-option` + `:hover` + `.is-selected` (lines 1047–1069)
- `.theme-preview` + theme-specific variants (lines 1071–1088)
- ~~`.theme-label`~~ → **SKIP** (replaced with Tailwind)
- ~~`.theme-option.is-selected .theme-label`~~ → **SKIP** (replaced with Tailwind)

---

## Task 4: Create `styles/bottom-nav.css`

**Files:**
- Create: `styles/bottom-nav.css`

**Step 1: Create the file** with `.bottom-nav`, `.bottom-nav-btn`, and variants (ui.css lines 481–525).

---

## Task 5: Create `styles/word-card.css`

**Files:**
- Create: `styles/word-card.css`

**Step 1: Create the file**. Include (copying exactly from ui.css):
- `.phrase-card` first block (lines 527–539)
- `.word-categories` (lines 541–550)
- `.word-category-badge` + color variants (lines 552–601)
- ~~`.word-category-badge.word-category-editable { cursor: pointer }`~~ → **SKIP** (replaced with Tailwind)
- `.word-category-badge.word-category-editable:hover` (lines 570–575) → **KEEP** (3 attrs)
- `.phrase-card:nth-child(odd)` (lines 603–605)
- `.card-time-badge` (lines 622–635)
- Stage-group `.card-time-badge` variants (lines 637–656)
- `.audio-btn` + states (lines 658–710)
- `.memory-hook-display` + hover (lines 715–734)
- `.memory-hook-text` → **only the cascade/pseudo rules**, skip the base rule (omit lines 736–739)
- ~~`.memory-hook-text.placeholder`~~ → **SKIP** (lines 741–743, replaced by Tailwind)
- `.memory-hook-container` (lines 746–753)
- `.memory-hook-container .memory-hook-display` (lines 752–754)
- `.memory-hook-container.editing` rules (lines 756–797)
- `.memory-hook-input` + media + focus (lines 760–797)
- `.progress-btn` + states (lines 800–837)
- ~~`.word-category-badge.word-category-editable { cursor: pointer }`~~ already skipped above
- `@keyframes countdown-pulse` (lines 842–855)
- `.phrase-card` transition block (lines 857–868)
- `.card-moved` + `@keyframes card-move` (lines 870–883)
- Cover/reveal rules: `.cover-target::after`, `.is-covered`, `.cover-target.is-pressed` (lines 886–968)
- `.phrase-card` sm media (lines 963–967)
- `@keyframes audio-pulse` (lines 700–710)

---

## Task 6: Create `styles/progress-summary.css`

**Files:**
- Create: `styles/progress-summary.css`

**Step 1: Create the file** with only `.progress-summary`:

```css
/* Progress Summary (simplified view on main page) */
.progress-summary {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 6px 8px;
  backdrop-filter: blur(8px);
  width: 100%;
  z-index: 30;
  font-size: 0.6875rem;
}
```

**Do NOT copy** `.progress-summary .text-fresh/.text-accent/.text-done` — Tailwind `text-fresh`, `text-accent`, `text-done` utilities already work (configured in `app/tailwind.css` via `--color-fresh`, `--color-accent`, `--color-done`).

---

## Task 7: Create `styles/animations.css`

**Files:**
- Create: `styles/animations.css`

**Step 1: Create the file** with the two shared keyframes used globally via Tailwind `animate-[...]`:

```css
/* Used by EditableWordCard modal via Tailwind animate-[fadeIn_...] */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Used by EditableWordCard modal via Tailwind animate-[slideUp_...] */
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

---

## Task 8: Update `app/globals.css`

**Files:**
- Modify: `app/globals.css`

**Step 1: Replace** the `ui.css` import with 7 new imports:

```css
/* Global styles */
@import url('../styles.css');
@import url('../styles/animations.css');
@import url('../styles/layout.css');
@import url('../styles/top-menu.css');
@import url('../styles/panels.css');
@import url('../styles/bottom-nav.css');
@import url('../styles/word-card.css');
@import url('../styles/progress-summary.css');
@import url('../styles/themes.css');
@import url('../styles/minigames.css');
```

---

## Task 9: Tailwind replacement in `WordCard.tsx`

**Files:**
- Modify: `components/WordCard.tsx`

**Step 1: Remove `.word-category-editable` class and its redundant inline style**

At line 167, change:
```tsx
className={`word-category-badge word-category-${cssClass} ${isEditMode && onCategoryToggle ? 'word-category-editable' : ''}`}
```
and remove the `style={isEditMode && onCategoryToggle ? { cursor: 'pointer' } : undefined}` prop.

Replace with:
```tsx
className={`word-category-badge word-category-${cssClass} ${isEditMode && onCategoryToggle ? 'cursor-pointer' : ''}`}
```

**Step 2: `.memory-hook-text` and `.memory-hook-text.placeholder`** — no JSX change needed. The class name `memory-hook-text` stays (needed for cascade rules). The `relative inline-block` and `opacity-60 italic` are already in the JSX as Tailwind (line 242). The CSS base rule and `.placeholder` rule are simply not copied into the new file.

---

## Task 10: Tailwind replacement in `SettingsPanel.tsx`

**Files:**
- Modify: `components/SettingsPanel.tsx`

**Step 1: Replace `theme-label` class** on lines 155, 163, 170.

Each `<span className="theme-label">` becomes:
```tsx
<span className={`text-[0.7rem] font-medium ${theme === 'THEME_VALUE' ? 'text-accent' : 'text-text-soft'}`}>
```

Where `THEME_VALUE` matches the button's theme (`'default'`, `'warm'`, `'calm'`).

So the three spans become:
```tsx
// Line 155 (inside theme === 'default' button):
<span className={`text-[0.7rem] font-medium ${theme === 'default' ? 'text-accent' : 'text-text-soft'}`}>Dark</span>

// Line 163 (inside theme === 'warm' button):
<span className={`text-[0.7rem] font-medium ${theme === 'warm' ? 'text-accent' : 'text-text-soft'}`}>Warm</span>

// Line 170 (inside theme === 'calm' button):
<span className={`text-[0.7rem] font-medium ${theme === 'calm' ? 'text-accent' : 'text-text-soft'}`}>Calm</span>
```

---

## Task 11: Delete `styles/ui.css`

**Step 1: Delete** `styles/ui.css` once all tasks above are done.

**Step 2: Start the dev server** and visually verify the app looks correct.

Run: `pnpm dev`

Check:
- App layout renders (`.app` shell, header)
- Top menu buttons and mode buttons work
- Settings/progress/memory/category panels open correctly
- Bottom nav renders
- Word cards display with badges, audio button, memory hooks, progress buttons
- Cover/reveal behavior works
- Theme switcher updates `.theme-label` color correctly
- No console errors about missing CSS

---

## Task 12: Commit

```bash
git add styles/layout.css styles/top-menu.css styles/panels.css styles/bottom-nav.css styles/word-card.css styles/progress-summary.css styles/animations.css app/globals.css components/WordCard.tsx components/SettingsPanel.tsx
git rm styles/ui.css
git commit -m "refactor: split ui.css into component-scoped files, replace small classes with Tailwind"
```
