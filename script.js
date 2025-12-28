/**
 * wordlink – minimal client-side app
 *
 * Modes:
 * - hide-cz: hides Czech, shows EN + VI
 * - hide-envi: hides EN + VI, shows Czech
 * - hide-vi: hides Vietnamese, shows CZ + EN
 * - show-all: shows everything
 *
 * In hidden modes, the covered fields reveal while press / long-press is held.
 */

import { WORDS as RAW_WORDS } from "./slova.js";

function inferWordType(entry) {
  const explicit = Array.isArray(entry.category)
    ? entry.category.find((tag) => tag === "word" || tag === "phrase")
    : null;
  if (explicit) return explicit;

  // Strip non-letter/number characters (emojis, punctuation) for a fair token count
  const normalized = (entry.cz || "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!normalized) return "word";

  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
  return tokenCount > 1 ? "phrase" : "word";
}

function normalizeWords(list) {
  return list.map((entry) => {
    const baseTags = Array.isArray(entry.category)
      ? entry.category.filter((tag) => tag !== "word" && tag !== "phrase")
      : [];
    const typeTag = inferWordType(entry);
    const category = [...new Set([...baseTags, typeTag])];
    return { ...entry, category };
  });
}

const WORDS = normalizeWords(RAW_WORDS);

/** @type {{ cz: string; en: string; vi: string; section?: string; czPron?: string; viPron?: string; czAudio?: string | string[]; viAudio?: string | string[]; czHint?: string; viHint?: string }[]} */

const STORAGE_KEY = "wordlink_progress_v1";
const ROLE_KEY = "wordlink_role_v1";
const MEMORY_HOOK_KEY = "wordlink_memory_hooks_v1";
const CATEGORY_FILTER_KEY = "wordlink_category_filter_v1";

// Spaced-repetition stages (0 = new/forgotten, then growing intervals)
const STAGES = [
  { id: 0, name: "New / forgotten", intervalMs: 0 }, // learn now
  { id: 1, name: "1 minute", intervalMs: 1 * 60 * 1000 },
  { id: 2, name: "10 minutes", intervalMs: 10 * 60 * 1000 },
  { id: 3, name: "1 hour", intervalMs: 60 * 60 * 1000 },
  { id: 4, name: "8 hours", intervalMs: 8 * 60 * 60 * 1000 },
  { id: 5, name: "1 day", intervalMs: 24 * 60 * 60 * 1000 },
  
  { id: 6, name: "3 days", intervalMs: 3 * 24 * 60 * 60 * 1000 },
  { id: 7, name: "7 days", intervalMs: 7 * 24 * 60 * 60 * 1000 },
  { id: 8, name: "14 days", intervalMs: 14 * 24 * 60 * 60 * 1000 },

  { id: 9, name: "30 days", intervalMs: 30 * 24 * 60 * 60 * 1000 },
  { id: 10, name: "60 days", intervalMs: 60 * 24 * 60 * 60 * 1000 },
];

let currentMode = null; // legacy, no direct button binding now
let lastMovedIndex = null;
let currentRole = loadRole(); // "cz" or "vi"
let modeIndex = 0; // 0 or 1 depending on role
let showAll = false; // when true, always show everything

// Single shared audio element for playback
let currentAudio = null;

function playAudio(src) {
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    currentAudio = new Audio(src);
    currentAudio.play().catch(() => {
      // ignore playback errors (e.g., user gesture requirements)
    });
  } catch {
    // ignore
  }
}

/**
 * Load progress map from localStorage.
 * Shape: { [index: string]: { categoryIndex: number; lastKnownAt?: number; lastUnknownAt?: number; knownCount: number; unknownCount: number } }
 */
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveProgress(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

const progressMap = loadProgress();
let currentTab = "all"; // "all" | "ready"

/**
 * Load memory hooks from localStorage.
 * Shape: { [index: string]: string }
 */
function loadMemoryHooks() {
  try {
    const raw = localStorage.getItem(MEMORY_HOOK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMemoryHooks(map) {
  try {
    localStorage.setItem(MEMORY_HOOK_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

const memoryHooksMap = loadMemoryHooks();
const selectedCategories = loadCategoryFilter();

function getMemoryHook(index) {
  return memoryHooksMap[String(index)] || "";
}

/**
 * Category filter persistence helpers.
 */
function loadCategoryFilter() {
  try {
    const raw = localStorage.getItem(CATEGORY_FILTER_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const cleaned = parsed.filter(
      (item) => typeof item === "string" && item !== "word" && item !== "phrase"
    );
    return new Set(cleaned);
  } catch {
    return new Set();
  }
}

function saveCategoryFilter(set) {
  try {
    localStorage.setItem(CATEGORY_FILTER_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

/**
 * Get a suggested (built-in) sound mnemonic for the current learner role.
 * This is only meant as a fallback when the user hasn't written their own hook.
 */
function getSuggestedMemoryHook(index) {
  const phrase = WORDS[index];
  if (!phrase) return "";
  if (currentRole === "vi") return phrase.viHint || "";
  if (currentRole === "cz") return phrase.czHint || "";
  return "";
}

function setMemoryHook(index, value) {
  const key = String(index);
  if (value && value.trim()) {
    memoryHooksMap[key] = value.trim();
  } else {
    delete memoryHooksMap[key];
  }
  saveMemoryHooks(memoryHooksMap);
}

function getProgress(index) {
  const key = String(index);
  const data = progressMap[key];
  if (data && typeof data.stageIndex === "number") {
    return data;
  }
  // migrate old shape with categoryIndex
  if (data && typeof data.categoryIndex === "number") {
    const migrated = {
      stageIndex: Math.max(0, Math.min(data.categoryIndex, STAGES.length - 1)),
      knownCount: data.knownCount || 0,
      unknownCount: data.unknownCount || 0,
      lastKnownAt: data.lastKnownAt,
      lastUnknownAt: data.lastUnknownAt,
      nextDueAt: data.nextDueAt,
    };
    progressMap[String(index)] = migrated;
    return migrated;
  }
  return {
    stageIndex: 0,
    knownCount: 0,
    unknownCount: 0,
  };
}

/**
 * Category helpers.
 */
function getAvailableCategories() {
  const counts = new Map();
  WORDS.forEach((phrase) => {
    const cats = Array.isArray(phrase.category) ? phrase.category : [];
    cats.forEach((cat) => {
      if (cat === "word" || cat === "phrase") return;
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function matchesCategoryFilter(phrase) {
  if (!selectedCategories.size) return true;
  const cats = Array.isArray(phrase.category) ? phrase.category : [];
  return cats.some((cat) => selectedCategories.has(cat));
}

function getFilteredIndices() {
  const result = [];
  WORDS.forEach((phrase, index) => {
    if (matchesCategoryFilter(phrase)) {
      result.push(index);
    }
  });
  return result;
}

function isDue(progress) {
  if (!progress || progress.stageIndex === 0) return false;
  if (!progress.nextDueAt) return false;
  return Date.now() >= progress.nextDueAt;
}

function loadRole() {
  try {
    const raw = localStorage.getItem(ROLE_KEY);
    if (raw === "cz" || raw === "vi") return raw;
  } catch {
    // ignore
  }
  return "vi";
}

function saveRole(role) {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    // ignore
  }
}

/**
 * Create a language row (Czech / English / Vietnamese).
 * @param {string} label
 * @param {string} value
 * @param {"cz" | "en" | "vi"} langKey
 * @param {string | undefined} pron
 * @returns {HTMLElement}
 */
function createLangRow(label, value, langKey, pron) {
  const row = document.createElement("div");
  row.className = "phrase-row";

  const labelEl = document.createElement("div");
  labelEl.className = "lang-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.className = "lang-value";

  const coverTarget = document.createElement("div");
  coverTarget.className = "cover-target";
  coverTarget.dataset.lang = langKey;

  const textWrapper = document.createElement("span");
  textWrapper.className = "lang-text";

  const mainSpan = document.createElement("span");
  mainSpan.textContent = value;
  textWrapper.appendChild(mainSpan);

  const shouldShowPron =
    (langKey === "cz" && currentRole === "vi") ||
    (langKey === "vi" && currentRole === "cz");

  if (pron && shouldShowPron) {
    const pronEl = document.createElement("span");
    pronEl.className = "pron-hint";
    pronEl.textContent = pron;
    textWrapper.appendChild(pronEl);
  }

  coverTarget.appendChild(textWrapper);
  valueEl.appendChild(coverTarget);

  row.appendChild(labelEl);
  row.appendChild(valueEl);

  return row;
}

/**
 * Attach press-and-hold behavior to a cover target.
 * In hidden modes, press reveals the text and release hides again.
 * @param {HTMLElement} el
 */
function attachPressHandlers(el) {
  let pressed = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isScrolling = false;
  let pressTimeout = null;
  let hasMoved = false;
  const SCROLL_THRESHOLD = 5; // pixels - reduced threshold for better scroll detection
  const PRESS_DELAY = 150; // ms - increased delay to better distinguish scrolls

  const setPressed = (value) => {
    pressed = value;
    if (pressed) {
      el.classList.add("is-pressed");
    } else {
      el.classList.remove("is-pressed");
    }
  };

  const onDown = (event) => {
    // For touch events, track initial position and time
    if (event.type === "touchstart" && event.touches.length > 0) {
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      touchStartTime = Date.now();
      isScrolling = false;
      pressed = false;
      hasMoved = false;
      
      // Set a timeout to activate press if no movement (to handle press without movement)
      pressTimeout = setTimeout(() => {
        if (!isScrolling && !hasMoved && touchStartX !== 0) {
          setPressed(true);
        }
      }, PRESS_DELAY);
      
      // Don't preventDefault yet - wait to see if it's a scroll
      return;
    }
    
    // For mouse events, prevent default immediately
    event.preventDefault();
    setPressed(true);
  };

  const onMove = (event) => {
    if (event.type === "touchmove" && event.touches.length > 0 && touchStartX !== 0) {
      const deltaX = Math.abs(event.touches[0].clientX - touchStartX);
      const deltaY = Math.abs(event.touches[0].clientY - touchStartY);
      const totalDelta = Math.max(deltaX, deltaY);
      
      hasMoved = true;
      
      // If user moved at all, they might be scrolling - be more permissive
      if (totalDelta > SCROLL_THRESHOLD) {
        isScrolling = true;
        setPressed(false);
        if (pressTimeout) {
          clearTimeout(pressTimeout);
          pressTimeout = null;
        }
        // Don't preventDefault - allow scrolling
        return;
      }
      
      // Small movement detected - cancel press timeout and allow scroll
      // Only activate press if user holds still for the full delay
      if (pressTimeout && totalDelta > 2) {
        clearTimeout(pressTimeout);
        pressTimeout = null;
      }
      
      // Only prevent default if we're already in pressed state (user held still)
      if (!isScrolling && pressed) {
        // Already pressed, keep preventing default
        event.preventDefault();
      }
    }
  };

  const onUp = () => {
    if (pressTimeout) {
      clearTimeout(pressTimeout);
      pressTimeout = null;
    }
    setPressed(false);
    touchStartX = 0;
    touchStartY = 0;
    touchStartTime = 0;
    isScrolling = false;
    hasMoved = false;
  };

  el.addEventListener("mousedown", onDown);
  el.addEventListener("touchstart", onDown, { passive: true });
  el.addEventListener("touchmove", onMove, { passive: false });

  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchend", onUp);
  window.addEventListener("touchcancel", onUp);
}

/**
 * Calculate progress statistics.
 * @returns {Object} Statistics object
 */
function calculateProgressStats(filteredIndices) {
  const indices =
    Array.isArray(filteredIndices) && filteredIndices.length
      ? filteredIndices
      : WORDS.map((_, idx) => idx);
  const stats = {
    total: indices.length,
    byStage: STAGES.map(() => 0),
    totalKnown: 0,
    totalUnknown: 0,
    readyCount: 0,
    fresh: 0, // stages 1-5 (1min to 1 day)
    learning: 0, // stages 6-8 (3 days to 14 days)
    done: 0, // stages 9-10 (30 days to 60 days)
    new: 0, // stage 0
  };

  indices.forEach((index) => {
    const phrase = WORDS[index];
    const prog = getProgress(index);
    const stageIdx = Math.max(0, Math.min(prog.stageIndex || 0, STAGES.length - 1));
    
    stats.byStage[stageIdx] += 1;
    stats.totalKnown += prog.knownCount || 0;
    stats.totalUnknown += prog.unknownCount || 0;
    
    if (isDue(prog)) {
      stats.readyCount += 1;
    }
    
    if (stageIdx === 0) {
      stats.new += 1;
    } else if (stageIdx >= 1 && stageIdx <= 5) {
      stats.fresh += 1;
    } else if (stageIdx >= 6 && stageIdx <= 8) {
      stats.learning += 1;
    } else if (stageIdx >= 9) {
      stats.done += 1;
    }
  });

  return stats;
}

/**
 * Render simplified progress summary for main page.
 */
function renderProgressSummary() {
  const summaryEl = document.getElementById("progress-summary");
  if (!summaryEl) return;

  const stats = calculateProgressStats(getFilteredIndices());
  
  summaryEl.innerHTML = `
    <span class="progress-summary-item fresh">
      <span class="progress-summary-label">fresh</span>
      <span class="progress-summary-value">(${stats.fresh})</span>
    </span>
    <span class="progress-summary-item learning">
      <span class="progress-summary-label">learning</span>
      <span class="progress-summary-value">(${stats.learning})</span>
    </span>
    <span class="progress-summary-item done">
      <span class="progress-summary-label">done</span>
      <span class="progress-summary-value">(${stats.done})</span>
    </span>
  `;
}

/**
 * Render progress overview in panel.
 */
function renderProgressOverview() {
  const panelContent = document.getElementById("progress-panel-content");
  if (!panelContent) return;

  panelContent.innerHTML = "";
  
  const stats = calculateProgressStats(getFilteredIndices());
  const progressPercent = stats.total > 0 
    ? Math.round((stats.fresh + stats.learning + stats.done) / stats.total * 100) 
    : 0;

  const container = document.createElement("div");
  container.className = "progress-overview";

  // Header
  const header = document.createElement("div");
  header.className = "progress-header";
  const title = document.createElement("h1");
  title.textContent = "📊 Learning Progress";
  header.appendChild(title);
  container.appendChild(header);

  // Overall stats
  const overallStats = document.createElement("div");
  overallStats.className = "progress-stats-grid";
  
  const statCard = (label, value, subtitle = "") => {
    const card = document.createElement("div");
    card.className = "progress-stat-card";
    const valueEl = document.createElement("div");
    valueEl.className = "progress-stat-value";
    valueEl.textContent = value;
    const labelEl = document.createElement("div");
    labelEl.className = "progress-stat-label";
    labelEl.textContent = label;
    card.appendChild(valueEl);
    card.appendChild(labelEl);
    if (subtitle) {
      const subEl = document.createElement("div");
      subEl.className = "progress-stat-subtitle";
      subEl.textContent = subtitle;
      card.appendChild(subEl);
    }
    return card;
  };

  overallStats.appendChild(statCard("Total Words", stats.total));
  overallStats.appendChild(statCard("Progress", `${progressPercent}%`, `${stats.fresh + stats.learning + stats.done} / ${stats.total}`));
  overallStats.appendChild(statCard("Ready Now", stats.readyCount));
  overallStats.appendChild(statCard("Done", stats.done, `Stage 9-10`));
  
  container.appendChild(overallStats);

  // Learning status breakdown
  const statusSection = document.createElement("div");
  statusSection.className = "progress-section";
  const statusTitle = document.createElement("h2");
  statusTitle.textContent = "Learning Status";
  statusSection.appendChild(statusTitle);

  const statusGrid = document.createElement("div");
  statusGrid.className = "progress-status-grid";
  
  const newCard = document.createElement("div");
  newCard.className = "progress-status-card new";
  newCard.innerHTML = `
    <div class="progress-status-value">${stats.new}</div>
    <div class="progress-status-label">New / Not Started</div>
  `;
  
  const freshCard = document.createElement("div");
  freshCard.className = "progress-status-card fresh";
  freshCard.innerHTML = `
    <div class="progress-status-value">${stats.fresh}</div>
    <div class="progress-status-label">Fresh</div>
  `;
  
  const learningCard = document.createElement("div");
  learningCard.className = "progress-status-card learning";
  learningCard.innerHTML = `
    <div class="progress-status-value">${stats.learning}</div>
    <div class="progress-status-label">Learning</div>
  `;
  
  const doneCard = document.createElement("div");
  doneCard.className = "progress-status-card done";
  doneCard.innerHTML = `
    <div class="progress-status-value">${stats.done}</div>
    <div class="progress-status-label">Done</div>
  `;
  
  statusGrid.appendChild(newCard);
  statusGrid.appendChild(freshCard);
  statusGrid.appendChild(learningCard);
  statusGrid.appendChild(doneCard);
  statusSection.appendChild(statusGrid);
  container.appendChild(statusSection);

  // Stage breakdown
  const stageSection = document.createElement("div");
  stageSection.className = "progress-section";
  const stageTitle = document.createElement("h2");
  stageTitle.textContent = "Words by Stage";
  stageSection.appendChild(stageTitle);

  const stageList = document.createElement("div");
  stageList.className = "progress-stage-list";
  
  STAGES.forEach((stage, index) => {
    const count = stats.byStage[index];
    if (count === 0 && index > 0) return; // Skip empty stages except stage 0
    
    const stageItem = document.createElement("div");
    stageItem.className = "progress-stage-item";
    if (index === 0) stageItem.classList.add("stage-new");
    if (index >= 7) stageItem.classList.add("stage-mastered");
    
    const stageName = document.createElement("div");
    stageName.className = "progress-stage-name";
    stageName.textContent = stage.name;
    
    const stageCount = document.createElement("div");
    stageCount.className = "progress-stage-count";
    stageCount.textContent = count;
    
    const stageBar = document.createElement("div");
    stageBar.className = "progress-stage-bar";
    const barFill = document.createElement("div");
    barFill.className = "progress-stage-bar-fill";
    const barPercent = stats.total > 0 ? (count / stats.total * 100) : 0;
    barFill.style.width = `${barPercent}%`;
    stageBar.appendChild(barFill);
    
    stageItem.appendChild(stageName);
    stageItem.appendChild(stageCount);
    stageItem.appendChild(stageBar);
    stageList.appendChild(stageItem);
  });
  
  stageSection.appendChild(stageList);
  container.appendChild(stageSection);

  // Answer statistics
  const answerSection = document.createElement("div");
  answerSection.className = "progress-section";
  const answerTitle = document.createElement("h2");
  answerTitle.textContent = "Answer Statistics";
  answerSection.appendChild(answerTitle);

  const answerStats = document.createElement("div");
  answerStats.className = "progress-answer-stats";
  
  const totalAnswers = stats.totalKnown + stats.totalUnknown;
  const accuracy = totalAnswers > 0 
    ? Math.round((stats.totalKnown / totalAnswers) * 100) 
    : 0;
  
  answerStats.innerHTML = `
    <div class="progress-answer-item">
      <div class="progress-answer-label">Correct</div>
      <div class="progress-answer-value correct">${stats.totalKnown}</div>
    </div>
    <div class="progress-answer-item">
      <div class="progress-answer-label">Incorrect</div>
      <div class="progress-answer-value incorrect">${stats.totalUnknown}</div>
    </div>
    <div class="progress-answer-item">
      <div class="progress-answer-label">Accuracy</div>
      <div class="progress-answer-value">${accuracy}%</div>
    </div>
  `;
  
  answerSection.appendChild(answerStats);
  container.appendChild(answerSection);

  panelContent.appendChild(container);
}

/**
 * Render category filter modal content.
 */
function renderCategoryPanel() {
  const panelContent = document.getElementById("category-panel-content");
  if (!panelContent) return;

  const categories = getAvailableCategories();
  panelContent.innerHTML = "";

  const header = document.createElement("div");
  header.className = "category-panel-header";

  const title = document.createElement("h2");
  title.textContent = "Filter by category";
  header.appendChild(title);

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "category-clear-btn";
  clearBtn.textContent = selectedCategories.size ? "Show all" : "All categories";
  clearBtn.addEventListener("click", () => {
    selectedCategories.clear();
    saveCategoryFilter(selectedCategories);
    updateCategoryButtonState();
    renderCategoryPanel();
    renderPhrases();
    renderProgressSummary();
    const progressPanel = document.getElementById("progress-panel");
    if (progressPanel && progressPanel.classList.contains("is-open")) {
      renderProgressOverview();
    }
  });
  header.appendChild(clearBtn);
  panelContent.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "category-grid";

  categories.forEach(({ name, count }) => {
    const label = document.createElement("label");
    label.className = "category-chip";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = name;
    input.checked = selectedCategories.has(name);
    if (input.checked) {
      label.classList.add("is-selected");
    }

    input.addEventListener("change", () => {
      if (input.checked) {
        selectedCategories.add(name);
      } else {
        selectedCategories.delete(name);
      }
      label.classList.toggle("is-selected", input.checked);
      saveCategoryFilter(selectedCategories);
      updateCategoryButtonState();
      renderCategoryPanel();
      renderPhrases();
      renderProgressSummary();
      const progressPanel = document.getElementById("progress-panel");
      if (progressPanel && progressPanel.classList.contains("is-open")) {
        renderProgressOverview();
      }
    });

    const span = document.createElement("span");
    span.className = "category-chip-label";
    span.textContent = name;

    const counter = document.createElement("span");
    counter.className = "category-chip-count";
    counter.textContent = count.toString();

    label.appendChild(input);
    label.appendChild(span);
    label.appendChild(counter);
    grid.appendChild(label);
  });

  if (!categories.length) {
    const empty = document.createElement("p");
    empty.className = "category-empty";
    empty.textContent = "No categories available.";
    panelContent.appendChild(empty);
  } else {
    panelContent.appendChild(grid);
  }
}

function updateCategoryButtonState() {
  const btn = document.getElementById("category-btn");
  if (!btn) return;
  const hasFilter = selectedCategories.size > 0;
  btn.classList.toggle("is-active", hasFilter);
  btn.setAttribute("data-count", hasFilter ? String(selectedCategories.size) : "");
}

/**
 * Render all phrase cards.
 */
function renderPhrases() {
  const root = document.getElementById("phrases");
  if (!root) return;

  // Show progress overview if progress tab is selected
  if (currentTab === "progress") {
    renderProgressOverview();
    return;
  }

  root.innerHTML = "";

  // Group phrases by stage
  const grouped = STAGES.map(() => []);
  let readyCount = 0;

  const filteredIndices = getFilteredIndices();

  filteredIndices.forEach((index) => {
    const phrase = WORDS[index];
    const prog = getProgress(index);
    const due = isDue(prog);
    if (due) readyCount += 1;
    if (currentTab === "ready" && !due) return;
    const sIdx = Math.max(0, Math.min(prog.stageIndex || 0, STAGES.length - 1));
    grouped[sIdx].push({ phrase, index });
  });

  STAGES.forEach((stage, stageIndex) => {
    const items = grouped[stageIndex];
    if (!items.length) return;

    const zone = document.createElement("section");
    zone.className = "category-zone";

    const title = document.createElement("h2");
    title.className = "category-zone-title";
    title.textContent = stage.name;
    zone.appendChild(title);

    items.forEach(({ phrase, index }) => {
      const card = document.createElement("article");
      card.className = "phrase-card";
      card.dataset.index = String(index);

      if (lastMovedIndex !== null && index === lastMovedIndex) {
        card.classList.add("card-moved");
      }

      if (phrase.section) {
        const secLabel = document.createElement("div");
        secLabel.className = "section-label";
        secLabel.textContent = phrase.section;
        card.appendChild(secLabel);
      }

      const langWrap = document.createElement("div");
      langWrap.className = "phrase-languages";

      const rowCz = createLangRow("CZ", phrase.cz, "cz", phrase.czPron);
      const rowEn = createLangRow("EN", phrase.en, "en", undefined);
      const rowVi = createLangRow("VI", phrase.vi, "vi", phrase.viPron);

      langWrap.appendChild(rowCz);
      langWrap.appendChild(rowEn);
      langWrap.appendChild(rowVi);

      // Memory hook element
      const memoryHookContainer = document.createElement("div");
      memoryHookContainer.className = "memory-hook-container";
      
      const memoryHookDisplay = document.createElement("div");
      memoryHookDisplay.className = "memory-hook-display cover-target";
      memoryHookDisplay.dataset.lang = "memory-hook";
      
      const memoryHookText = document.createElement("span");
      memoryHookText.className = "memory-hook-text";
      const hookValue = getMemoryHook(index);
      const suggestedHook = !hookValue ? getSuggestedMemoryHook(index) : "";
      if (hookValue) {
        memoryHookText.textContent = hookValue;
      } else if (suggestedHook) {
        memoryHookText.textContent = `💡 ${suggestedHook}`;
      } else {
        memoryHookText.textContent = "💭 Add memory hook...";
      }
      memoryHookText.dataset.index = String(index);
      if (!hookValue) {
        memoryHookText.classList.add("placeholder");
      }
      
      memoryHookDisplay.appendChild(memoryHookText);
      memoryHookContainer.appendChild(memoryHookDisplay);
      
      const memoryHookInput = document.createElement("input");
      memoryHookInput.type = "text";
      memoryHookInput.className = "memory-hook-input";
      memoryHookInput.placeholder = "Enter memory hook...";
      memoryHookInput.value = hookValue;
      memoryHookInput.style.display = "none";
      memoryHookInput.dataset.index = String(index);
      memoryHookContainer.appendChild(memoryHookInput);

      const actions = document.createElement("div");
      actions.className = "progress-actions";

      const unknownBtn = document.createElement("button");
      unknownBtn.type = "button";
      unknownBtn.className = "progress-btn unknown";
      unknownBtn.innerHTML = "✖ <span class=\"count\"></span>";

      const knownBtn = document.createElement("button");
      knownBtn.type = "button";
      knownBtn.className = "progress-btn known";
      knownBtn.innerHTML = "✔ <span class=\"count\"></span>";

      actions.appendChild(unknownBtn);
      actions.appendChild(knownBtn);

      // Audio button: play Czech for Vietnamese learner, Vietnamese for Czech learner
      let audioSrcForRole = null;
      if (currentRole === "vi" && phrase.czAudio) {
        audioSrcForRole = Array.isArray(phrase.czAudio)
          ? phrase.czAudio[0]
          : phrase.czAudio;
      } else if (currentRole === "cz" && phrase.viAudio) {
        audioSrcForRole = Array.isArray(phrase.viAudio)
          ? phrase.viAudio[0]
          : phrase.viAudio;
      }

      if (audioSrcForRole) {
        const audioBtn = document.createElement("button");
        audioBtn.type = "button";
        audioBtn.className = "audio-btn";
        audioBtn.title =
          currentRole === "vi" ? "Play Czech audio" : "Play Vietnamese audio";
        audioBtn.textContent = "🔊";

        let touchStartTime = 0;
        let touchStartPos = null;

        // Handle touch events for mobile
        audioBtn.addEventListener("touchstart", (event) => {
          event.stopPropagation();
          touchStartTime = Date.now();
          if (event.touches.length > 0) {
            touchStartPos = {
              x: event.touches[0].clientX,
              y: event.touches[0].clientY
            };
          }
          audioBtn.classList.add("audio-btn-pressed");
        }, { passive: true });

        audioBtn.addEventListener("touchend", (event) => {
          event.stopPropagation();
          event.preventDefault();
          
          const touchEnd = event.changedTouches[0];
          const touchDuration = Date.now() - touchStartTime;
          let moved = false;
          
          if (touchStartPos && touchEnd) {
            const deltaX = Math.abs(touchEnd.clientX - touchStartPos.x);
            const deltaY = Math.abs(touchEnd.clientY - touchStartPos.y);
            moved = deltaX > 10 || deltaY > 10;
          }
          
          audioBtn.classList.remove("audio-btn-pressed");
          
          // Only play if it was a quick tap without movement
          if (!moved && touchDuration < 500) {
            audioBtn.classList.add("audio-btn-playing");
            playAudio(audioSrcForRole);
            
            // Remove playing state after a short delay
            setTimeout(() => {
              audioBtn.classList.remove("audio-btn-playing");
            }, 300);
          }
          
          touchStartTime = 0;
          touchStartPos = null;
        }, { passive: false });

        // Handle mouse/desktop events
        audioBtn.addEventListener("mousedown", (event) => {
          event.stopPropagation();
          audioBtn.classList.add("audio-btn-pressed");
        });

        audioBtn.addEventListener("mouseup", (event) => {
          event.stopPropagation();
          audioBtn.classList.remove("audio-btn-pressed");
        });

        audioBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          event.preventDefault();
          audioBtn.classList.add("audio-btn-playing");
          playAudio(audioSrcForRole);
          
          // Remove playing state after a short delay
          setTimeout(() => {
            audioBtn.classList.remove("audio-btn-playing");
          }, 300);
        });

        // Also handle mouseleave to remove pressed state if user drags away
        audioBtn.addEventListener("mouseleave", () => {
          audioBtn.classList.remove("audio-btn-pressed");
        });

        actions.appendChild(audioBtn);
      }

      card.appendChild(langWrap);
      card.appendChild(memoryHookContainer);
      // countdown for waiting items (only in "all" tab)
      const prog = getProgress(index);
      const due = isDue(prog);
      if (currentTab === "all" && prog.stageIndex > 0 && prog.nextDueAt && !due) {
        const countdown = document.createElement("div");
        countdown.className = "countdown";
        countdown.dataset.nextDueAt = String(prog.nextDueAt);
        const dot = document.createElement("span");
        dot.className = "countdown-dot";
        const label = document.createElement("span");
        label.className = "countdown-label";
        label.textContent = formatRemaining(prog.nextDueAt - Date.now());
        countdown.appendChild(dot);
        countdown.appendChild(label);
        card.appendChild(countdown);
      }
      card.appendChild(actions);

      zone.appendChild(card);

      knownBtn.addEventListener("click", () => {
        handleMark(index, "known", card);
      });
      unknownBtn.addEventListener("click", () => {
        handleMark(index, "unknown", card);
      });

      // Memory hook event handlers
      // Track touch state for mobile tap detection
      let memoryHookTouchStart = null;
      let memoryHookEditTimeout = null;
      
      // Use double-click to edit on desktop
      memoryHookDisplay.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!memoryHookContainer.classList.contains("editing")) {
          startEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
        }
      });
      
      // For mobile: detect tap vs press
      // Store touch start info before press handlers run
      memoryHookDisplay.addEventListener("touchstart", (e) => {
        if (e.touches.length > 0) {
          memoryHookTouchStart = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            time: Date.now()
          };
          
          // Set a timeout to trigger edit if it's a quick tap
          // This will be cancelled if user moves (scrolls) or presses long (reveals)
          memoryHookEditTimeout = setTimeout(() => {
            // Only edit if it was a very quick tap and element is not covered
            if (memoryHookTouchStart && !memoryHookDisplay.classList.contains("is-covered")) {
              if (!memoryHookContainer.classList.contains("editing")) {
                startEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
              }
            }
            memoryHookTouchStart = null;
          }, 250); // 250ms threshold for quick tap
        }
      }, { passive: true, capture: true });
      
      // Track movement - if moved, cancel edit timeout (user is scrolling)
      memoryHookDisplay.addEventListener("touchmove", (e) => {
        if (memoryHookTouchStart && e.touches.length > 0) {
          const deltaX = Math.abs(e.touches[0].clientX - memoryHookTouchStart.x);
          const deltaY = Math.abs(e.touches[0].clientY - memoryHookTouchStart.y);
          // If moved significantly, cancel edit timeout (user is scrolling)
          if (deltaX > 10 || deltaY > 10) {
            if (memoryHookEditTimeout) {
              clearTimeout(memoryHookEditTimeout);
              memoryHookEditTimeout = null;
            }
            memoryHookTouchStart = null;
          }
        }
      }, { passive: true });
      
      memoryHookDisplay.addEventListener("touchend", (e) => {
        if (memoryHookEditTimeout) {
          clearTimeout(memoryHookEditTimeout);
          memoryHookEditTimeout = null;
        }
        
        if (memoryHookTouchStart) {
          const touch = e.changedTouches[0];
          const deltaX = Math.abs(touch.clientX - memoryHookTouchStart.x);
          const deltaY = Math.abs(touch.clientY - memoryHookTouchStart.y);
          const deltaTime = Date.now() - memoryHookTouchStart.time;
          const isCovered = memoryHookDisplay.classList.contains("is-covered");
          const wasPressed = memoryHookDisplay.classList.contains("is-pressed");
          
          // If it's a quick tap without movement:
          // - If covered: let press handlers reveal (don't edit)
          // - If not covered: edit
          if (deltaX < 10 && deltaY < 10 && deltaTime < 300) {
            if (!isCovered && !wasPressed) {
              e.preventDefault();
              e.stopPropagation();
              if (!memoryHookContainer.classList.contains("editing")) {
                startEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
              }
            }
          }
          memoryHookTouchStart = null;
        }
      }, { passive: false });
      
      // Also allow click on empty placeholder to edit (desktop fallback)
      if (!hookValue) {
        memoryHookDisplay.addEventListener("click", (e) => {
          // Only trigger if not currently pressed (revealed) and not covered
          if (!memoryHookDisplay.classList.contains("is-pressed") && 
              !memoryHookDisplay.classList.contains("is-covered")) {
            e.stopPropagation();
            if (!memoryHookContainer.classList.contains("editing")) {
              startEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
            }
          }
        });
      }

      memoryHookInput.addEventListener("blur", () => {
        finishEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
      });

      memoryHookInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finishEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
        }
      });

      updateCardProgress(index, card);
    });

    root.appendChild(zone);
  });


  // Attach press behavior to all cover targets (including memory hooks for reveal functionality)
  const coverTargets = root.querySelectorAll(".cover-target");
  coverTargets.forEach((el) => attachPressHandlers(/** @type {HTMLElement} */ (el)));

  applyVisibilityMode();

  // update ready-count badge
  const readyBtn = document.querySelector('.bottom-nav-btn[data-tab="ready"]');
  if (readyBtn) {
    readyBtn.setAttribute("data-count", readyCount ? String(readyCount) : "");
  }
}

function formatRemaining(ms) {
  if (ms <= 0) return "ready now";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Start editing a memory hook.
 */
function startEditingMemoryHook(index, container, display, input, text) {
  container.classList.add("editing");
  display.style.display = "none";
  input.style.display = "block";
  input.focus();
  input.select();
}

/**
 * Finish editing a memory hook and save it.
 */
function finishEditingMemoryHook(index, container, display, input, text) {
  const value = input.value.trim();
  setMemoryHook(index, value);
  
  container.classList.remove("editing");
  display.style.display = "block";
  input.style.display = "none";
  
  if (value) {
    text.textContent = value;
    text.classList.remove("placeholder");
  } else {
    const suggestedHook = getSuggestedMemoryHook(index);
    text.textContent = suggestedHook ? `💡 ${suggestedHook}` : "💭 Add memory hook...";
    text.classList.add("placeholder");
  }
  
  // Re-apply visibility mode after editing
  applyVisibilityMode();
}

/**
 * Cancel editing a memory hook without saving.
 */
function cancelEditingMemoryHook(index, container, display, input, text) {
  const hookValue = getMemoryHook(index);
  input.value = hookValue;
  
  container.classList.remove("editing");
  display.style.display = "block";
  input.style.display = "none";
}

/**
 * Apply current mode to all elements.
 */
function applyVisibilityMode() {
  const root = document.getElementById("phrases");
  if (!root) return;

  const targets = root.querySelectorAll(".cover-target");
  // If "show everything" is enabled, nothing is covered
  if (showAll) {
    targets.forEach((el) => {
      el.classList.remove("is-covered", "is-pressed");
    });
    return;
  }

  targets.forEach((el) => {
    const lang = el.dataset.lang;
    if (!lang) return;
    
    // Skip if editing (memory hooks stay visible when editing)
    if (el.closest(".memory-hook-container")?.classList.contains("editing")) {
      return;
    }

    el.classList.remove("is-covered", "is-pressed");

    // When in hidden mode (showAll === false), always hide memory hooks
    if (lang === "memory-hook") {
      el.classList.add("is-covered");
      return;
    }

    // modeIndex: 0 or 1 – meaning depends on learner role
    if (currentRole === "cz") {
      if (modeIndex === 0) {
        // hide Vietnamese only
        if (lang === "vi" || lang === "memory-hook") el.classList.add("is-covered");
      } else {
        // hide Czech + English
        if (lang === "cz" || lang === "en") el.classList.add("is-covered");
      }
    } else {
      if (modeIndex === 0) {
        // hide Czech only
        if (lang === "cz") el.classList.add("is-covered");
      } else {
        // hide Vietnamese + English
        if (lang === "vi" || lang === "en" || lang === "memory-hook") el.classList.add("is-covered");
      }
    }
  });
}

/**
 * Update DOM for a single card with progress info.
 * @param {number} index
 * @param {HTMLElement} card
 */
function updateCardProgress(index, card) {
  const data = getProgress(index);

  const knownCountEl = card.querySelector(".progress-btn.known .count");
  const unknownCountEl = card.querySelector(".progress-btn.unknown .count");

  if (knownCountEl) {
    knownCountEl.textContent = data.knownCount ? `(${data.knownCount})` : "";
  }
  if (unknownCountEl) {
    unknownCountEl.textContent = data.unknownCount ? `(${data.unknownCount})` : "";
  }
}

/**
 * Handle marking a card as known / unknown and update its category.
 * @param {number} index
 * @param {"known" | "unknown"} kind
 * @param {HTMLElement} card
 */
function handleMark(index, kind, card) {
  const key = String(index);
  const now = Date.now();
  const existing = getProgress(index);

  if (kind === "known") {
    existing.knownCount += 1;
    existing.lastKnownAt = now;
    // Move to a "later" stage (longer interval) but never beyond the last
    const nextStage = Math.min((existing.stageIndex || 0) + 1, STAGES.length - 1);
    existing.stageIndex = nextStage;
    const interval = STAGES[nextStage].intervalMs;
    existing.nextDueAt = interval ? now + interval : null;
  } else {
    existing.unknownCount += 1;
    existing.lastUnknownAt = now;
    // Move back towards more frequent review
    const prevStage = Math.max((existing.stageIndex || 0) - 1, 0);
    existing.stageIndex = prevStage;
    const interval = STAGES[prevStage].intervalMs;
    existing.nextDueAt = interval ? now + interval : null;
  }

  progressMap[key] = existing;
  saveProgress(progressMap);
  
  // Remember which card moved and re-render so the word moves to its new category zone
  lastMovedIndex = index;
  renderPhrases();
  // Update progress summary in real-time
  renderProgressSummary();
}

/**
 * Initialize mode switch buttons.
 */
function updateSwitchButtonLabel() {
  const btn = document.getElementById("switch-btn");
  if (!btn) return;

  // Use a reload-style icon for the mode switch button
  btn.textContent = "🔄";
}

function updateShowAllButtonLabel() {
  const btn = document.getElementById("show-all-btn");
  if (!btn) return;

  // Use monkey emojis for the "show everything" toggle
  btn.textContent = showAll ? "🙉" : "🙈";
}

function setupTopControls() {
  const settingsBtn = document.getElementById("settings-btn");
  const progressBtn = document.getElementById("progress-btn");
  const memoryHooksBtn = document.getElementById("memory-hooks-btn");
  const categoryBtn = document.getElementById("category-btn");
  const switchBtn = document.getElementById("switch-btn");
  const settingsPanel = document.getElementById("settings-panel");
  const progressPanel = document.getElementById("progress-panel");
  const memoryHooksPanel = document.getElementById("memory-hooks-panel");
  const categoryPanel = document.getElementById("category-panel");
  const showAllBtn = document.getElementById("show-all-btn");
  const bottomButtons = document.querySelectorAll(".bottom-nav-btn");

  // Function to close all panels
  function closeAllPanels() {
    if (settingsPanel) settingsPanel.classList.remove("is-open");
    if (progressPanel) progressPanel.classList.remove("is-open");
    if (memoryHooksPanel) memoryHooksPanel.classList.remove("is-open");
    if (categoryPanel) categoryPanel.classList.remove("is-open");
  }

  // Handle clicks outside panels to close them
  document.addEventListener("click", (event) => {
    // Check if any panel is currently open
    const settingsOpen = settingsPanel && settingsPanel.classList.contains("is-open");
    const progressOpen = progressPanel && progressPanel.classList.contains("is-open");
    const memoryHooksOpen = memoryHooksPanel && memoryHooksPanel.classList.contains("is-open");
    const categoryOpen = categoryPanel && categoryPanel.classList.contains("is-open");
    
    if (!settingsOpen && !progressOpen && !memoryHooksOpen && !categoryOpen) {
      return; // No panels open, nothing to close
    }

    // Check if click is outside any panel and its button
    const clickedInsideSettings = settingsPanel && (
      settingsPanel.contains(event.target) || 
      settingsBtn && settingsBtn.contains(event.target)
    );
    const clickedInsideProgress = progressPanel && (
      progressPanel.contains(event.target) || 
      progressBtn && progressBtn.contains(event.target)
    );
    const clickedInsideMemoryHooks = memoryHooksPanel && (
      memoryHooksPanel.contains(event.target) || 
      memoryHooksBtn && memoryHooksBtn.contains(event.target)
    );
    const clickedInsideCategory = categoryPanel && (
      categoryPanel.contains(event.target) ||
      categoryBtn && categoryBtn.contains(event.target)
    );

    // If click is outside all panels and their buttons, close all panels
    if (!clickedInsideSettings && !clickedInsideProgress && !clickedInsideMemoryHooks && !clickedInsideCategory) {
      closeAllPanels();
    }
  });

  // Prevent clicks inside panels from closing them
  if (settingsPanel) {
    settingsPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (progressPanel) {
    progressPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (memoryHooksPanel) {
    memoryHooksPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (categoryPanel) {
    categoryPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = settingsPanel.classList.contains("is-open");
      closeAllPanels();
      // Toggle settings panel
      if (!wasOpen) {
        settingsPanel.classList.add("is-open");
      }
    });

    const radios = settingsPanel.querySelectorAll('input[name="learner-role"]');
    radios.forEach((radio) => {
      if (radio.value === currentRole) {
        radio.checked = true;
      }
      radio.addEventListener("change", () => {
        const value = radio.value;
        if (value !== "cz" && value !== "vi") return;
        currentRole = value;
        saveRole(currentRole);
        // Reset mode index for new role
        modeIndex = 0;
        updateSwitchButtonLabel();
        // keep showAll state as-is when switching role
        renderPhrases();
      });
    });
  }

  if (progressBtn && progressPanel) {
    progressBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = progressPanel.classList.contains("is-open");
      closeAllPanels();
      // Toggle progress panel
      if (!wasOpen) {
        progressPanel.classList.add("is-open");
        // Render progress overview when opening
        renderProgressOverview();
      }
    });
  }

  if (memoryHooksBtn && memoryHooksPanel) {
    memoryHooksBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = memoryHooksPanel.classList.contains("is-open");
      closeAllPanels();
      // Toggle memory hooks panel
      if (!wasOpen) {
        memoryHooksPanel.classList.add("is-open");
      }
    });
  }

  if (categoryBtn && categoryPanel) {
    categoryBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = categoryPanel.classList.contains("is-open");
      closeAllPanels();
      if (!wasOpen) {
        categoryPanel.classList.add("is-open");
        renderCategoryPanel();
      }
    });
  }

  if (switchBtn) {
    switchBtn.addEventListener("click", () => {
      modeIndex = modeIndex === 0 ? 1 : 0;
      updateSwitchButtonLabel();
      applyVisibilityMode();
    });
  }

  if (showAllBtn) {
    showAllBtn.addEventListener("click", () => {
      showAll = !showAll;
      updateShowAllButtonLabel();
      applyVisibilityMode();
    });
  }

  updateSwitchButtonLabel();
  updateShowAllButtonLabel();
  updateCategoryButtonState();

  // bottom nav tabs
  bottomButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      if (!tab || tab === currentTab) return;
      currentTab = tab;
      bottomButtons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      renderPhrases();
    });
  });
  
  // Initial render of progress summary
  renderProgressSummary();
}

/**
 * Update countdown labels for countdowns less than 1 minute.
 */
function updateShortCountdowns() {
  if (document.hidden) return;
  if (isEditingMemoryHook()) return;
  const countdowns = document.querySelectorAll(".countdown[data-next-due-at]");
  countdowns.forEach((countdown) => {
    const nextDueAt = Number(countdown.dataset.nextDueAt);
    if (!nextDueAt) return;
    const remaining = nextDueAt - Date.now();
    const minutes = Math.floor(remaining / 60000);
    
    // Only update if less than 1 minute
    if (minutes < 1 && remaining > 0) {
      const label = countdown.querySelector(".countdown-label");
      if (label) {
        label.textContent = formatRemaining(remaining);
      }
    } else if (remaining <= 0) {
      // If countdown expired, trigger a full refresh (unless user is editing a hook)
      if (!isEditingMemoryHook()) {
        renderPhrases();
      }
    }
  });
}

/**
 * Whether any memory hook input is currently being edited.
 */
function isEditingMemoryHook() {
  return !!document.querySelector(".memory-hook-container.editing");
}

document.addEventListener("DOMContentLoaded", () => {
  setupTopControls();
  renderPhrases();
  
  // Update countdowns less than 1 minute every second
  setInterval(() => {
    updateShortCountdowns();
  }, 1000);
  
  // refresh countdowns roughly every 30 seconds (for longer countdowns and full refresh)
  setInterval(() => {
    if (document.hidden) return;
    if (isEditingMemoryHook()) return;
    renderPhrases();
  }, 30000);
});


