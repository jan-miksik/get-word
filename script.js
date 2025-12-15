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

const MODES = {
  HIDE_CZ: "hide-cz",
  HIDE_ENVI: "hide-envi",
  HIDE_VI: "hide-vi",
  SHOW_ALL: "show-all",
};

const STORAGE_KEY = "wordlink_progress_v1";

// Spaced-repetition style categories
const CATEGORIES = [
  {
    id: "A",
    name: "Fresh / Forgot",
    description: "Review very often",
    intervalMs: 0, // every session
  },
  {
    id: "B",
    name: "1 day",
    description: "Seen a few times",
    intervalMs: 24 * 60 * 60 * 1000,
  },
  {
    id: "C",
    name: "3 days",
    description: "Getting stable",
    intervalMs: 3 * 24 * 60 * 60 * 1000,
  },
  {
    id: "D",
    name: "1 week",
    description: "Longer memory",
    intervalMs: 7 * 24 * 60 * 60 * 1000,
  },
  {
    id: "E",
    name: "2 weeks+",
    description: "Well known",
    intervalMs: 14 * 24 * 60 * 60 * 1000,
  },
];

/** @type {{ cz: string; en: string; vi: string; section?: string; czPron?: string; viPron?: string }[]} */
const PHRASES = [
  {
    section: "ZÁKLADNÍ POZDRAVY",
    cz: "Dobrý den / Dobrý večer",
    en: "Good day / Good evening",
    vi: "Xin chào",
    czPron: "DO-bri den / DO-bri VE-čer",
    viPron: "sin čao",
  },
  {
    cz: "Děkuji / Prosím 🙏",
    en: "Thank you / Please",
    vi: "Cảm ơn / Làm ơn",
    czPron: "DĚ-ku-ji / PRO-sím",
    viPron: "kam ən / lam ən",
  },
  {
    cz: "Jak se máte? 🙂",
    en: "How are you?",
    vi: "Bạn khỏe không?",
    czPron: "JAK se MÁ-te?",
    viPron: "ban kchue khong",
  },
  {
    cz: "Posaďte se, prosím. 💺",
    en: "Please sit down.",
    vi: "Mời bạn ngồi.",
    czPron: "PO-sať-te se PRO-sím",
    viPron: "moi ban ngoi",
  },
  {
    cz: "Bolí to? 😬",
    en: "Does it hurt?",
    vi: "Có đau không?",
    czPron: "BO-lí to?",
    viPron: "ko dau khong",
  },
  {
    cz: "Tady? 👉",
    en: "Here?",
    vi: "Ở đây hả?",
    czPron: "TA-di?",
    viPron: "a daj ha",
  },
  {
    cz: "Nashle / Na shledanou 👋",
    en: "Goodbye",
    vi: "Tạm biệt",
    czPron: "NA-shle / NA skhle-da-no",
    viPron: "tam biet",
  },
  {
    cz: "Máte představu? 💡",
    en: "Do you have an idea?",
    vi: "Bạn có ý tưởng gì không?",
    czPron: "MÁ-te PŘED-sta-vu?",
    viPron: "ban ko i tuong zi khong",
  },
  {
    cz: "Jakou barvu? 🎨",
    en: "What colour?",
    vi: "Màu nào?",
    czPron: "JA-kou BAR-vu?",
    viPron: "mau nao",
  },

  {
    section: "NEHTY A TVARY",
    cz: "Tvar (nehtu)",
    en: "(Nail) shape",
    vi: "Hình dạng (móng)",
    czPron: "TVAR (NE-tu)",
    viPron: "hin jang mong",
  },
  { cz: "Kulatý ⭕", en: "Round", vi: "Tròn", czPron: "KU-la-tý", viPron: "tron" },
  { cz: "Hranatý ⬛", en: "Square", vi: "Vuông", czPron: "HRA-na-tý", viPron: "vuong" },
  { cz: "Lak", en: "Nail polish", vi: "Sơn móng", czPron: "LAK", viPron: "son mong" },
  { cz: "Manikúra 💅", en: "Manicure", vi: "Làm móng tay", czPron: "MA-ni-kú-ra", viPron: "lam mong taj" },
  { cz: "Pedikúra 🦶", en: "Pedicure", vi: "Chăm sóc chân", czPron: "PE-di-kú-ra", viPron: "čam sok čan" },
  { cz: "Gelové nehty ✨", en: "Gel nails", vi: "Móng gel", czPron: "GE-lo-vé NE-ty", viPron: "mong gel" },
  { cz: "Hotovo ✅", en: "Finished / Done", vi: "Xong rồi", czPron: "HO-to-vo", viPron: "xong zoj" },
  { cz: "Ruka / Ruce", en: "Hand / Hands", vi: "Tay / Hai tay", czPron: "RU-ka / RU-ce", viPron: "taj / haj taj" },
  { cz: "Noha / Nohy", en: "Foot / Feet", vi: "Chân / Hai chân", czPron: "NO-ha / NO-hy", viPron: "čan / haj čan" },
  { cz: "Nehet / Nehty", en: "Nail / Nails", vi: "Móng tay / Móng", czPron: "NE-het / NE-ty", viPron: "mong taj / mong" },
  { cz: "Pilník", en: "Nail file", vi: "Cây dũa móng", czPron: "PIL-ník", viPron: "kaj zua mong" },
  { cz: "Nůžky ✂️", en: "Scissors", vi: "Cái kéo", czPron: "NŮŠ-ky", viPron: "kaj keo" },
  { cz: "Suché", en: "Dry", vi: "Khô", czPron: "SU-ché", viPron: "kho" },
  { cz: "Mokré", en: "Wet", vi: "Ướt", czPron: "MO-kré", viPron: "uot" },
  { cz: "Voda 💧", en: "Water", vi: "Nước", czPron: "VO-da", viPron: "nuok" },

  {
    section: "🎨 BARVY A ČAS",
    cz: "Barva",
    en: "Color",
    vi: "Màu sắc",
    czPron: "BAR-va",
    viPron: "mau sak",
  },
  { cz: "Červená 🔴", en: "Red", vi: "Đỏ", czPron: "ČER-ve-ná", viPron: "do" },
  { cz: "Růžová 🌸", en: "Pink", vi: "Hồng", czPron: "RŮ-žo-vá", viPron: "hong" },
  { cz: "Černá ⚫", en: "Black", vi: "Đen", czPron: "ČER-ná", viPron: "den" },
  { cz: "Bílá ⚪", en: "White", vi: "Trắng", czPron: "BÍ-lá", viPron: "čang" },
  { cz: "Dnes 📅", en: "Today", vi: "Hôm nay", czPron: "DNES", viPron: "hom naj" },
  { cz: "Zítra ⏭️", en: "Tomorrow", vi: "Ngày mai", czPron: "ZÍ-tra", viPron: "ngaj maj" },

  {
    section: "PENÍZE A PLATBA",
    cz: "Cena / Kolik to stojí? 💵",
    en: "Price / How much does it cost?",
    vi: "Giá bao nhiêu?",
    czPron: "CE-na / KO-lik to STO-jí?",
    viPron: "za bao nju",
  },
  {
    cz: "Můžete platit.",
    en: "You can pay.",
    vi: "Bạn có thể thanh toán.",
    czPron: "MŮ-že-te PLA-tit",
    viPron: "ban ko tche tan toan",
  },
  { cz: "Hotově 💶", en: "Cash", vi: "Tiền mặt", czPron: "HO-to-vě", viPron: "tjen mat" },
  { cz: "Kartou 💳", en: "By card", vi: "Bằng thẻ", czPron: "KAR-tou", viPron: "bang te" },
  { cz: "Perfektní ✨", en: "Perfect", vi: "Hoàn hảo", czPron: "PER-fek-tní", viPron: "hoan hao" },
  { cz: "Moment ⏱️", en: "Moment", vi: "Khoảnh khắc", czPron: "MO-ment", viPron: "khoanh khak" },
  { cz: "Kafe ☕", en: "Coffee", vi: "Cà phê", czPron: "KA-fe", viPron: "ka fe" },
  { cz: "Klient (muž) / Klientka (žena)", en: "Client", vi: "Khách hàng", czPron: "KLI-ent / KLI-ent-ka", viPron: "khak hang" },
  { cz: "Salon", en: "Salon", vi: "Tiệm / Thẩm mỹ viện", czPron: "SA-lon", viPron: "tiem" },
  { cz: "Design 🎨", en: "Design", vi: "Thiết kế", czPron: "DE-zajn", viPron: "thjet ke" },
  { cz: "Problém ⚠️", en: "Problem", vi: "Vấn đề", czPron: "PRO-blém", viPron: "van de" },
  { cz: "Detail 🔍", en: "Detail", vi: "Chi tiết", czPron: "DE-tajl", viPron: "či tiet" },
  { cz: "Materiál", en: "Material", vi: "Vật liệu", czPron: "MA-te-ri-ál", viPron: "vat lijeu" },
  { cz: "Informace ℹ️", en: "Information", vi: "Thông tin", czPron: "IN-for-ma-ce", viPron: "thong tin" },
  { cz: "Super 😄", en: "Super", vi: "Tuyệt vời", czPron: "SU-per", viPron: "tujet voj" },
  { cz: "Akryl", en: "Acrylic", vi: "Acrylic", czPron: "A-kryl", viPron: "ak-ril" },
  { cz: "Gel", en: "Gel", vi: "Gel", czPron: "GEL", viPron: "zel" },
];

let currentMode = MODES.HIDE_CZ;
let lastMovedIndex = null;

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

/**
 * Create a language row (Czech / English / Vietnamese).
 * @param {string} label
 * @param {string} value
 * @param {"cz" | "en" | "vi"} langKey
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

  if (pron && (langKey === "cz" || langKey === "vi")) {
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

  const setPressed = (value) => {
    pressed = value;
    if (pressed) {
      el.classList.add("is-pressed");
    } else {
      el.classList.remove("is-pressed");
    }
  };

  const onDown = (event) => {
    // Prevent text selection / long-press menu on mobile
    event.preventDefault();
    setPressed(true);
  };

  const onUp = () => setPressed(false);

  el.addEventListener("mousedown", onDown);
  el.addEventListener("touchstart", onDown, { passive: false });

  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchend", onUp);
  window.addEventListener("touchcancel", onUp);
}

/**
 * Render all phrase cards.
 */
function renderPhrases() {
  const root = document.getElementById("phrases");
  if (!root) return;

  root.innerHTML = "";

  // Group phrases by category
  const grouped = CATEGORIES.map(() => []);

  PHRASES.forEach((phrase, index) => {
    const key = String(index);
    const data = progressMap[key];
    const catIndex = data && typeof data.categoryIndex === "number" ? data.categoryIndex : 0;
    grouped[Math.min(Math.max(catIndex, 0), CATEGORIES.length - 1)].push({
      phrase,
      index,
    });
  });

  CATEGORIES.forEach((cat, catIndex) => {
    const items = grouped[catIndex];
    if (!items.length) return;

    const zone = document.createElement("section");
    zone.className = "category-zone";

    const title = document.createElement("h2");
    title.className = "category-zone-title";
    title.textContent = cat.name;
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

      card.appendChild(langWrap);
      card.appendChild(actions);

      zone.appendChild(card);

      knownBtn.addEventListener("click", () => {
        handleMark(index, "known", card);
      });
      unknownBtn.addEventListener("click", () => {
        handleMark(index, "unknown", card);
      });

      updateCardProgress(index, card);
    });

    root.appendChild(zone);
  });

  // Attach press behavior to all cover targets
  const coverTargets = root.querySelectorAll(".cover-target");
  coverTargets.forEach((el) => attachPressHandlers(/** @type {HTMLElement} */ (el)));

  applyModeToView();
}

/**
 * Apply current mode to all elements.
 */
function applyModeToView() {
  const root = document.getElementById("phrases");
  if (!root) return;

  const targets = root.querySelectorAll(".cover-target");
  targets.forEach((el) => {
    const lang = el.dataset.lang;
    if (!lang) return;

    el.classList.remove("is-covered", "is-pressed");

    if (currentMode === MODES.SHOW_ALL) {
      // always visible
      return;
    }

    if (currentMode === MODES.HIDE_CZ && lang === "cz") {
      el.classList.add("is-covered");
    } else if (currentMode === MODES.HIDE_ENVI && (lang === "en" || lang === "vi")) {
      el.classList.add("is-covered");
    } else if (currentMode === MODES.HIDE_VI && lang === "vi") {
      el.classList.add("is-covered");
    }
  });
}

/**
 * Update DOM for a single card with progress info.
 * @param {number} index
 * @param {HTMLElement} card
 */
function updateCardProgress(index, card) {
  const data = progressMap[index] || {
    categoryIndex: 0,
    knownCount: 0,
    unknownCount: 0,
  };

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
  const existing =
    progressMap[key] || {
      categoryIndex: 0,
      knownCount: 0,
      unknownCount: 0,
    };

  if (kind === "known") {
    existing.knownCount += 1;
    existing.lastKnownAt = now;
    // Move to a "later" category (longer interval) but never beyond the last
    existing.categoryIndex = Math.min(
      (existing.categoryIndex || 0) + 1,
      CATEGORIES.length - 1
    );
  } else {
    existing.unknownCount += 1;
    existing.lastUnknownAt = now;
    // Move back towards more frequent review
    existing.categoryIndex = Math.max((existing.categoryIndex || 0) - 1, 0);
  }

  progressMap[key] = existing;
  saveProgress(progressMap);
  // Remember which card moved and re-render so the word moves to its new category zone
  lastMovedIndex = index;
  renderPhrases();
}

/**
 * Initialize mode switch buttons.
 */
function setupModeSwitcher() {
  const buttons = document.querySelectorAll(".mode-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-mode");
      if (!mode || mode === currentMode) return;

      currentMode = mode;

      buttons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      applyModeToView();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupModeSwitcher();
  renderPhrases();
});


