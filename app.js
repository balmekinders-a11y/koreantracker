/** Local Korean study tracker — vocabulary & grammar in localStorage; PrePly lessons + files in IndexedDB */

const STORAGE_WORDS = "kr-tracker-words-v1";
const STORAGE_GRAMMAR = "kr-tracker-grammar-v1";
const DB_NAME = "kr-tracker-db";
const DB_VERSION = 1;
const STORE_LESSONS = "lessons";
/** Points needed across flash modes before the word is marked practiced */
const FLASH_LEARNED_AT = 10;
const WORD_OF_DAY_POOL = [
  {
    korean: "구름",
    meaning: "cloud",
    illustration:
      '<svg viewBox="0 0 140 72" class="wotd-illustration-svg" aria-hidden="true"><defs><linearGradient id="sky-grad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#dbeafe"/><stop offset="100%" stop-color="#f0f9ff"/></linearGradient></defs><rect x="1" y="1" width="138" height="70" rx="14" fill="url(#sky-grad)" stroke="#bfdbfe"/><circle cx="58" cy="40" r="14" fill="#ffffff"/><circle cx="72" cy="34" r="17" fill="#ffffff"/><circle cx="89" cy="41" r="13" fill="#ffffff"/><rect x="53" y="40" width="48" height="14" rx="7" fill="#ffffff"/></svg>',
  },
  {
    korean: "나무",
    meaning: "tree",
    illustration:
      '<svg viewBox="0 0 140 72" class="wotd-illustration-svg" aria-hidden="true"><rect x="1" y="1" width="138" height="70" rx="14" fill="#ecfdf5" stroke="#bbf7d0"/><rect x="66" y="34" width="9" height="23" rx="3" fill="#92400e"/><circle cx="70" cy="30" r="18" fill="#22c55e"/><circle cx="57" cy="33" r="10" fill="#34d399"/><circle cx="83" cy="33" r="10" fill="#34d399"/></svg>',
  },
  {
    korean: "별",
    meaning: "star",
    illustration:
      '<svg viewBox="0 0 140 72" class="wotd-illustration-svg" aria-hidden="true"><rect x="1" y="1" width="138" height="70" rx="14" fill="#1e293b" stroke="#334155"/><polygon points="70,18 76,32 92,32 79,41 84,56 70,47 56,56 61,41 48,32 64,32" fill="#facc15"/><circle cx="34" cy="25" r="2.4" fill="#e2e8f0"/><circle cx="104" cy="22" r="2" fill="#e2e8f0"/><circle cx="112" cy="47" r="2.2" fill="#e2e8f0"/><circle cx="28" cy="46" r="1.8" fill="#e2e8f0"/></svg>',
  },
];

/** Vocabulary list row in inline edit mode (word `id` or `null`) */
let vocabularyEditingId = null;
/** Vocabulary sort mode ("added" | "korean-alpha") */
let vocabularySortMode = "added";

/** @type {Set<string>} */
const blobUrls = new Set();

function revokeTrackedUrls() {
  blobUrls.forEach((url) => URL.revokeObjectURL(url));
  blobUrls.clear();
}

function trackBlobUrl(blob) {
  const url = URL.createObjectURL(blob);
  blobUrls.add(url);
  return url;
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_LESSONS)) {
        db.createObjectStore(STORE_LESSONS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<any[]>} */
async function getAllLessons() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LESSONS, "readonly");
    const store = tx.objectStore(STORE_LESSONS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/** @param {any} lesson */
async function putLesson(lesson) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LESSONS, "readwrite");
    tx.objectStore(STORE_LESSONS).put(lesson);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** @param {string} id */
async function deleteLesson(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LESSONS, "readwrite");
    tx.objectStore(STORE_LESSONS).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function replaceAllLessons(lessons) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LESSONS, "readwrite");
    const store = tx.objectStore(STORE_LESSONS);
    const clearReq = store.clear();
    clearReq.onerror = () => reject(clearReq.error);
    clearReq.onsuccess = () => {
      for (const lesson of lessons) {
        store.put(lesson);
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

function wireNavigation() {
  const navBtns = document.querySelectorAll(".nav-btn");
  const panels = document.querySelectorAll(".panel");

  function showSection(id) {
    navBtns.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.section === id);
    });
    panels.forEach((panel) => {
      const match = panel.id === `panel-${id}`;
      panel.hidden = !match;
      panel.classList.toggle("is-visible", match);
    });
    if (id === "dashboard") refreshStats();
    if (id === "preply") renderLessons();
    if (id === "vocabulary") updateFlashPanel();
  }

  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });

  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-goto");
      if (id) showSection(id);
      document.querySelector(`[data-section="${id}"]`)?.focus?.();
    });
  });

  return showSection;
}

/**
 * @typedef {{
 *   id: string,
 *   korean: string,
 *   meaning: string,
 *   notes: string,
 *   practiced: boolean,
 *   flashCorrectCount: number,
 *   practiceWeight: number,
 * }} Word
 */
/** @typedef {{ id: string, topic: string, notes: string, done: boolean }} GrammarTopic */

function getWords() {
  return /** @type {Word[]} */ (loadJson(STORAGE_WORDS, []));
}

function saveWords(words) {
  saveJson(STORAGE_WORDS, words);
}

/** @param {Partial<Word> & Record<string, unknown>} w */
function normalizeWordEntry(w) {
  return {
    ...w,
    flashCorrectCount:
      typeof w.flashCorrectCount === "number" && !Number.isNaN(w.flashCorrectCount)
        ? Math.max(0, Math.floor(w.flashCorrectCount))
        : 0,
    practiceWeight:
      typeof w.practiceWeight === "number" && !Number.isNaN(w.practiceWeight)
        ? Math.max(0, Math.floor(w.practiceWeight))
        : 0,
  };
}

function migrateStorageWords() {
  const raw = loadJson(STORAGE_WORDS, []);
  if (!Array.isArray(raw) || raw.length === 0) return;
  const next = raw.map((w) => normalizeWordEntry(/** @type {Word} */ (w)));
  saveJson(STORAGE_WORDS, next);
}

/** Unicode-aware Levenshtein on code points */
function levenshtein(a, b) {
  const s = Array.from(a);
  const t = Array.from(b);
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  /** @type {number[][]} */
  const d = [];
  for (let i = 0; i <= m; i++) {
    d[i] = [];
    d[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    d[0][j] = j;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

/** @param {string} str @param {"en" | "ko"} mode */
function normalizeForCompare(str, mode) {
  let x = String(str).normalize("NFC").trim().replace(/\s+/g, " ");
  if (mode === "en") x = x.toLowerCase();
  return x;
}

function meaningAlternatives(meaning) {
  return String(meaning)
    .split(/\s*[\/|;]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} userRaw
 * @param {string[]} expectedOptions raw strings to compare (already expanded alternatives)
 * @param {"en" | "ko"} mode
 */
function scoreTypedAnswer(userRaw, expectedOptions, mode) {
  const u = normalizeForCompare(userRaw, mode);
  if (!u) {
    return { kind: "wrong", dist: Infinity, bestExpected: expectedOptions[0] || "" };
  }
  let bestDist = Infinity;
  let bestExpected = expectedOptions[0] || "";
  for (const opt of expectedOptions) {
    const e = normalizeForCompare(opt, mode);
    const d = levenshtein(u, e);
    if (d < bestDist) {
      bestDist = d;
      bestExpected = opt;
    }
  }
  if (bestDist === 0) return { kind: "correct", dist: 0, bestExpected };
  if (bestDist === 1) return { kind: "typo", dist: 1, bestExpected };
  return { kind: "wrong", dist: bestDist, bestExpected };
}

/**
 * @param {Word[]} words
 * @param {string | null} excludeId skip until another word exists (avoid same card twice)
 */
function pickWeightedWord(words, excludeId) {
  if (!words.length) return null;
  let pool = words;
  if (excludeId && words.length > 1) {
    const others = words.filter((w) => w.id !== excludeId);
    if (others.length) pool = others;
  }
  let total = 0;
  const weights = pool.map((w) => {
    const wt = 1 + (w.practiceWeight || 0);
    total += wt;
    return wt;
  });
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function refreshStats() {
  const words = getWords();
  const grammar = /** @type {GrammarTopic[]} */ (loadJson(STORAGE_GRAMMAR, []));
  document.getElementById("stat-words").textContent = String(words.length);
  document.getElementById("stat-grammar").textContent = String(grammar.length);
  renderWordOfDay(words);
  getAllLessons().then((lessons) => {
    document.getElementById("stat-preply").textContent = String(lessons.length);
  });
}

/**
 * @param {Word[]} words
 */
function renderWordOfDay(words) {
  const content = document.getElementById("word-of-day-content");
  if (!content) return;
  const existing = new Set(words.map((w) => normalizeForCompare(w.korean, "ko")));
  const available = WORD_OF_DAY_POOL.filter(
    (item) => !existing.has(normalizeForCompare(item.korean, "ko"))
  );
  if (!available.length) {
    content.innerHTML = `<p class="wotd-word">Great job!</p><p class="wotd-meaning">All suggested words are already in your list.</p>`;
    return;
  }
  const daySeed = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < daySeed.length; i++) {
    hash = (hash * 31 + daySeed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % available.length;
  const picked = available[idx];
  content.innerHTML = `
    <p class="wotd-word" lang="ko">${escapeHtml(picked.korean)}</p>
    <p class="wotd-meaning">${escapeHtml(picked.meaning)}</p>
    <div class="wotd-illustration">${picked.illustration}</div>
  `;
}

/**
 * @param {Word} w
 */
function renderWordRowHtml(w) {
  const prio =
    w.practiceWeight > 0
      ? ` · review priority ×${w.practiceWeight} (flashcards favor this word)`
      : "";
  const flashLine = `<p class="word-stats">Flash points: ${w.flashCorrectCount} / ${FLASH_LEARNED_AT} toward practiced${prio}</p>`;
  if (w.id === vocabularyEditingId) {
    return `
        <div class="list-row list-row--editing" data-word-id="${escapeAttr(w.id)}">
          <form class="word-edit-form" data-edit-form="${escapeAttr(w.id)}">
            <div class="list-row-main">
              <p class="edit-form-title">Edit entry</p>
              <div class="edit-word-grid">
                <label class="edit-field">
                  <span class="edit-field-label-line"
                    >Korean
                    <button
                      type="button"
                      class="word-translate-link word-translate-link--inline"
                      data-translate-korean-field="${escapeAttr(w.id)}"
                      title="Opens Google Translate — use the speaker icon for Korean audio"
                    >
                      Pronounce
                    </button></span
                  >
                  <input type="text" class="edit-input" data-edit-field="korean" value="${escapeAttr(w.korean)}" autocomplete="off" lang="ko-KR" inputmode="text" />
                </label>
                <label class="edit-field">
                  <span>Meaning / reading</span>
                  <input type="text" class="edit-input" data-edit-field="meaning" value="${escapeAttr(w.meaning)}" autocomplete="off" lang="en" inputmode="text" />
                </label>
                <label class="edit-field span-2">
                  <span>Notes</span>
                  <input type="text" class="edit-input" data-edit-field="notes" value="${escapeAttr(w.notes || "")}" autocomplete="off" />
                </label>
              </div>
              ${flashLine}
              <label class="checkbox-label edit-learned-row">
                <input type="checkbox" data-edit-field="practiced" ${w.practiced ? "checked" : ""} />
                Learned (manual)
              </label>
            </div>
            <div class="row-actions row-actions--stack">
              <button type="submit" class="btn primary">Save</button>
              <button type="button" class="btn secondary" data-cancel-edit-word="${escapeAttr(w.id)}">Cancel</button>
              <button type="button" class="btn ghost danger" data-remove-word="${escapeAttr(w.id)}">Remove</button>
            </div>
          </form>
        </div>`;
  }

  const badge = w.practiced
    ? `<span class="badge">Learned</span>`
    : `<span class="badge inactive">Learning</span>`;
  return `
        <div class="word-row-wrap" data-word-wrap-id="${escapeAttr(w.id)}">
          <button
            type="button"
            class="word-sound-btn"
            data-speak-korean="${escapeAttr(w.korean)}"
            title="Play pronunciation"
            aria-label="Pronounce ${escapeAttr(w.korean)}"
            >&#128266;</button
          >
          <div class="list-row" data-word-id="${escapeAttr(w.id)}">
            <div class="list-row-main">
              <div class="word-inline-row">
                <p class="word-korean">${escapeHtml(w.korean)}</p>
                <p class="word-meaning">${escapeHtml(w.meaning)}</p>
              </div>
            </div>
            <div class="row-actions row-actions--stack">
              ${badge}
              <label class="checkbox-label">
                <input type="checkbox" ${w.practiced ? "checked" : ""} data-toggle-word="${escapeAttr(w.id)}" />
                Learned (manual)
              </label>
              <button type="button" class="btn secondary" data-edit-word="${escapeAttr(w.id)}">Edit</button>
            </div>
          </div>
        </div>`;
}

function renderWords(filter = "") {
  const list = document.getElementById("word-list");
  let words = getWords().map((w) => normalizeWordEntry(w));
  const q = filter.trim().toLowerCase();
  if (q) {
    words = words.filter(
      (w) =>
        w.korean.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q) ||
        (w.notes && w.notes.toLowerCase().includes(q))
    );
  }
  if (vocabularySortMode === "korean-alpha") {
    words.sort((a, b) => a.korean.localeCompare(b.korean, "ko"));
  }
  if (vocabularyEditingId && !words.some((w) => w.id === vocabularyEditingId)) {
    vocabularyEditingId = null;
  }
  if (words.length === 0) {
    list.innerHTML = `<div class="empty">No vocabulary yet. Add a word above.</div>`;
    return;
  }

  list.innerHTML = words.map((w) => renderWordRowHtml(w)).join("");

  list.querySelectorAll("[data-translate-korean-field]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const formId = btn.getAttribute("data-translate-korean-field");
      if (!formId) return;
      const form = list.querySelector(`[data-edit-form="${formId}"]`);
      const korean =
        form?.querySelector('[data-edit-field="korean"]')?.value?.trim() ?? "";
      if (!korean) return;
      window.open(googleTranslateKoreanUrl(korean), "_blank", "noopener,noreferrer");
    });
  });

  list.querySelectorAll("[data-speak-korean]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const korean = btn.getAttribute("data-speak-korean") || "";
      speakKoreanText(korean);
    });
  });

  list.querySelectorAll("[data-edit-word]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit-word");
      if (id) vocabularyEditingId = id;
      renderWords(document.getElementById("filter-words").value);
      const row = list.querySelector(`[data-word-id="${id}"]`);
      const first = row?.querySelector('[data-edit-field="korean"]');
      if (first instanceof HTMLElement) first.focus();
    });
  });

  list.querySelectorAll("[data-cancel-edit-word]").forEach((btn) => {
    btn.addEventListener("click", () => {
      vocabularyEditingId = null;
      renderWords(document.getElementById("filter-words").value);
    });
  });

  list.querySelectorAll("[data-edit-form]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = form.getAttribute("data-edit-form");
      if (!id) return;
      const korean = form.querySelector('[data-edit-field="korean"]')?.value?.trim() ?? "";
      const meaning = form.querySelector('[data-edit-field="meaning"]')?.value?.trim() ?? "";
      const notes = form.querySelector('[data-edit-field="notes"]')?.value?.trim() ?? "";
      const practicedEl = form.querySelector('[data-edit-field="practiced"]');
      const practiced =
        practicedEl instanceof HTMLInputElement ? practicedEl.checked : false;
      if (!korean || !meaning) return;

      let all = getWords();
      const idx = all.findIndex((x) => x.id === id);
      if (idx < 0) return;
      all[idx] = normalizeWordEntry({
        ...all[idx],
        korean,
        meaning,
        notes,
        practiced,
      });
      saveWords(all);
      vocabularyEditingId = null;
      renderWords(document.getElementById("filter-words").value);
      updateFlashPanel();
      refreshStats();
    });
  });

  list.querySelectorAll("[data-toggle-word]").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.getAttribute("data-toggle-word");
      let all = getWords();
      const idx = all.findIndex((x) => x.id === id);
      if (idx >= 0) {
        all[idx].practiced = input.checked;
        saveWords(all);
        renderWords(document.getElementById("filter-words").value);
        refreshStats();
      }
    });
  });

  list.querySelectorAll("[data-remove-word]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-word");
      if (!id || !confirm("Remove this word from your list?")) return;
      let all = getWords();
      all = all.filter((x) => x.id !== id);
      saveWords(all);
      if (vocabularyEditingId === id) vocabularyEditingId = null;
      renderWords(document.getElementById("filter-words").value);
      updateFlashPanel();
      refreshStats();
    });
  });
}

function renderGrammar() {
  const list = document.getElementById("grammar-list");
  const topics = /** @type {GrammarTopic[]} */ (loadJson(STORAGE_GRAMMAR, []));
  if (topics.length === 0) {
    list.innerHTML = `<div class="empty">No grammar topics yet. Add one above.</div>`;
    return;
  }
  list.innerHTML = topics
    .map(
      (g) => `
      <div class="list-row" data-grammar-id="${escapeAttr(g.id)}">
        <div class="list-row-main">
          <p class="grammar-topic">${escapeHtml(g.topic)}</p>
          ${
            g.notes
              ? `<p class="grammar-meta">${escapeHtml(g.notes)}</p>`
              : ""
          }
        </div>
        <div class="row-actions">
          <label class="checkbox-label">
            <input type="checkbox" ${g.done ? "checked" : ""} data-toggle-grammar="${escapeAttr(g.id)}" />
            Comfortable
          </label>
          <button type="button" class="btn ghost" data-remove-grammar="${escapeAttr(g.id)}">Remove</button>
        </div>
      </div>`
    )
    .join("");

  list.querySelectorAll("[data-toggle-grammar]").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.getAttribute("data-toggle-grammar");
      let all = /** @type {GrammarTopic[]} */ (loadJson(STORAGE_GRAMMAR, []));
      const idx = all.findIndex((x) => x.id === id);
      if (idx >= 0) {
        all[idx].done = input.checked;
        saveJson(STORAGE_GRAMMAR, all);
        renderGrammar();
      }
    });
  });

  list.querySelectorAll("[data-remove-grammar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-grammar");
      let all = /** @type {GrammarTopic[]} */ (loadJson(STORAGE_GRAMMAR, []));
      all = all.filter((x) => x.id !== id);
      saveJson(STORAGE_GRAMMAR, all);
      renderGrammar();
      refreshStats();
    });
  });
}

function isImageMime(mime) {
  return typeof mime === "string" && mime.startsWith("image/");
}

function renderLessons() {
  revokeTrackedUrls();
  const container = document.getElementById("lesson-list");
  getAllLessons().then((lessons) => {
    lessons.sort((a, b) => new Date(b.lessonDate) - new Date(a.lessonDate));
    if (lessons.length === 0) {
      container.innerHTML = `<div class="empty">No PrePly lessons saved yet.</div>`;
      return;
    }
    container.innerHTML = lessons
      .map((lesson) => {
        const dateStr = formatDate(lesson.lessonDate);
        const summary = lesson.summary?.trim()
          ? `<div class="lesson-block"><h4>Coverage</h4><p>${escapeHtml(lesson.summary)}</p></div>`
          : "";
        const hw = lesson.homeworkNotes?.trim()
          ? `<div class="lesson-block"><h4>Homework</h4><p>${escapeHtml(lesson.homeworkNotes)}</p></div>`
          : "";
        const atts = Array.isArray(lesson.attachments) ? lesson.attachments : [];
        const thumbs = atts
          .map((a) => {
            if (a.blob && isImageMime(a.mimeType)) {
              const url = trackBlobUrl(a.blob);
              return `<a class="thumb" href="${url}" target="_blank" rel="noopener" title="${escapeAttr(a.fileName)}"><img src="${url}" alt="${escapeAttr(a.fileName)}" /></a>`;
            }
            if (a.blob) {
              const url = trackBlobUrl(a.blob);
              return `<a class="file-pill" href="${url}" download="${escapeAttr(a.fileName)}">${escapeHtml(a.fileName)}</a>`;
            }
            return "";
          })
          .join("");
        const attachmentsBlock =
          atts.length > 0
            ? `<div class="lesson-block"><h4>Files</h4><div class="attachments">${thumbs || '<span class="grammar-meta">(Could not load file data)</span>'}</div></div>`
            : "";

        return `
          <article class="list-row" data-lesson-id="${escapeAttr(lesson.id)}">
            <div class="lesson-header">
              <h3 class="lesson-title">${escapeHtml(lesson.title)}</h3>
              <span class="lesson-date">${escapeHtml(dateStr)}</span>
            </div>
            <div class="lesson-body">
              ${summary}
              ${hw}
              ${attachmentsBlock}
            </div>
            <div class="lesson-footer">
              <button type="button" class="btn ghost" data-delete-lesson="${escapeAttr(lesson.id)}">Delete lesson</button>
            </div>
          </article>`;
      })
      .join("");

    container.querySelectorAll("[data-delete-lesson]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete-lesson");
        if (!id || !confirm("Delete this lesson and all attached files from this browser?")) return;
        revokeTrackedUrls();
        await deleteLesson(id);
        refreshStats();
        renderLessons();
      });
    });
  });
}

/** @param {string} s */
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/** @param {string} s */
function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Speak Korean text using a preferred Google ko-KR voice when available.
 * @param {string} text
 */
function speakKoreanText(text) {
  const phrase = String(text || "").trim();
  if (!phrase || !("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  const koVoices = voices.filter((v) => /^ko(?:-|$)/i.test(v.lang));
  const preferredVoice =
    koVoices.find((v) => /google/i.test(v.name) && /^ko-kr$/i.test(v.lang)) ||
    koVoices.find((v) => /google/i.test(v.name)) ||
    koVoices.find((v) => /^ko-kr$/i.test(v.lang)) ||
    koVoices[0] ||
    null;
  const utt = new SpeechSynthesisUtterance(phrase);
  if (preferredVoice) utt.voice = preferredVoice;
  utt.lang = preferredVoice?.lang || "ko-KR";
  utt.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utt);
}

/**
 * Google Translate (Korean → English) with the term pre-filled. The user can use
 * the site’s built-in listen control for Korean audio.
 * @param {string} koreanText
 */
function googleTranslateKoreanUrl(koreanText) {
  const text = String(koreanText || "").trim();
  if (!text) return "https://translate.google.com/?sl=ko&tl=en";
  return `https://translate.google.com/?sl=ko&tl=en&text=${encodeURIComponent(text)}`;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function updateFlashPanel() {
  const words = getWords();
  const flashEmpty = document.getElementById("flash-empty");
  const flashSession = document.getElementById("flash-session");
  if (!flashEmpty || !flashSession) return;
  if (!words.length) {
    flashEmpty.hidden = false;
    flashSession.hidden = true;
  } else {
    flashEmpty.hidden = true;
    flashSession.hidden = false;
  }
}

function wireFlashcards() {
  let flashMode = /** @type {"ko-en" | "en-ko"} */ ("ko-en");
  /** @type {string | null} */
  let currentFlashWordId = null;
  let answered = false;

  const modeBtns = document.querySelectorAll(".flash-mode-btn");
  const drawBtn = document.getElementById("flash-draw");
  const cardBody = document.getElementById("flash-card-body");
  const labelEl = document.getElementById("flash-prompt-label");
  const termEl = document.getElementById("flash-term");
  const flashTranslateLink = document.getElementById("flash-translate-link");
  const form = document.getElementById("flash-answer-form");
  const input = document.getElementById("flash-input");
  const feedback = document.getElementById("flash-feedback");
  const afterRow = document.getElementById("flash-after");
  const nextBtn = document.getElementById("flash-next");

  if (
    !drawBtn ||
    !cardBody ||
    !labelEl ||
    !termEl ||
    !form ||
    !input ||
    !feedback ||
    !afterRow ||
    !nextBtn
  ) {
    return;
  }

  function clearFeedbackClasses() {
    feedback.classList.remove("is-correct", "is-typo", "is-wrong");
    feedback.innerHTML = "";
  }

  function setAnswerState(isAnswered) {
    answered = isAnswered;
    input.disabled = isAnswered;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = isAnswered;
    afterRow.hidden = !isAnswered;
  }

  function drawCard() {
    const words = getWords().map((w) => normalizeWordEntry(w));
    if (!words.length) return;
    clearFeedbackClasses();
    const picked = pickWeightedWord(words, currentFlashWordId);
    if (!picked) return;
    currentFlashWordId = picked.id;
    setAnswerState(false);
    cardBody.hidden = false;

    if (flashMode === "ko-en") {
      labelEl.textContent = "Translate to English";
      termEl.textContent = picked.korean;
      termEl.setAttribute("lang", "ko");
      termEl.classList.remove("is-meaning-prompt");
      input.placeholder = "Type the English meaning";
      input.setAttribute("lang", "en");
      if (flashTranslateLink instanceof HTMLAnchorElement) {
        flashTranslateLink.href = googleTranslateKoreanUrl(picked.korean);
        flashTranslateLink.hidden = false;
      }
    } else {
      labelEl.textContent = "Write in Korean";
      termEl.textContent = picked.meaning;
      termEl.setAttribute("lang", "en");
      termEl.classList.add("is-meaning-prompt");
      input.placeholder = "Type the Korean";
      input.setAttribute("lang", "ko-KR");
      if (flashTranslateLink) flashTranslateLink.hidden = true;
    }
    input.value = "";
    input.focus();
  }

  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeBtns.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const m = btn.getAttribute("data-flash-mode");
      if (m === "ko-en" || m === "en-ko") flashMode = m;
      currentFlashWordId = null;
      cardBody.hidden = true;
      if (flashTranslateLink) flashTranslateLink.hidden = true;
      clearFeedbackClasses();
      setAnswerState(false);
      input.value = "";
    });
  });

  drawBtn.addEventListener("click", () => drawCard());

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!currentFlashWordId || answered) return;

    let words = getWords().map((w) => normalizeWordEntry(w));
    const w = words.find((x) => x.id === currentFlashWordId);
    if (!w) {
      clearFeedbackClasses();
      feedback.classList.add("is-wrong");
      feedback.textContent = "This word is no longer in your list. Draw a new card.";
      setAnswerState(true);
      return;
    }

    const raw = input.value;
    /** @type {{ kind: "correct" | "typo" | "wrong"; bestExpected: string; dist: number }} */
    let score;
    if (flashMode === "ko-en") {
      const opts = meaningAlternatives(w.meaning);
      if (!opts.length) return;
      score = scoreTypedAnswer(raw, opts, "en");
    } else {
      score = scoreTypedAnswer(raw, [w.korean], "ko");
    }

    const idx = words.findIndex((x) => x.id === currentFlashWordId);
    if (idx < 0) return;

    if (score.kind === "correct") {
      words[idx].flashCorrectCount = words[idx].flashCorrectCount + 1;
      words[idx].practiceWeight = Math.max(0, words[idx].practiceWeight - 1);
      if (words[idx].flashCorrectCount >= FLASH_LEARNED_AT) {
        words[idx].practiced = true;
      }
      saveWords(words.map(normalizeWordEntry));
      const upd = getWords().find((x) => x.id === currentFlashWordId);
      const c = upd ? upd.flashCorrectCount : 0;
      const nowLearned = !!(upd && upd.practiced);
      const meta = `Running total: ${c} correct answers for this word (${FLASH_LEARNED_AT} to mark learned).${nowLearned ? " This word is now marked learned." : ""}`;
      feedback.classList.add("is-correct");
      feedback.innerHTML = `Correct — +1 point.<span class="flash-meta">${escapeHtml(meta)}</span>`;
    } else if (score.kind === "typo") {
      words[idx].practiceWeight = words[idx].practiceWeight + 3;
      saveWords(words.map(normalizeWordEntry));
      feedback.classList.add("is-typo");
      const meta = `Your answer is off by a single edit (one missing, extra, or mistyped character). No point; review priority increased. Expected: ${score.bestExpected}`;
      feedback.innerHTML = `Almost.<span class="flash-meta">${escapeHtml(meta)}</span>`;
    } else {
      words[idx].practiceWeight = words[idx].practiceWeight + 3;
      saveWords(words.map(normalizeWordEntry));
      feedback.classList.add("is-wrong");
      const meta = `No point; review priority increased. Expected: ${score.bestExpected}`;
      feedback.innerHTML = `Not quite.<span class="flash-meta">${escapeHtml(meta)}</span>`;
    }

    renderWords(document.getElementById("filter-words").value);
    refreshStats();
    setAnswerState(true);
  });

  nextBtn.addEventListener("click", () => drawCard());
}

/**
 * Apply best-effort IME/input hints per field focus.
 * Note: web apps cannot force OS keyboard layout on all platforms.
 */
function wireInputLanguageHints() {
  /**
   * @param {HTMLInputElement | null} input
   * @param {"ko" | "en"} mode
   */
  function bind(input, mode) {
    if (!input) return;
    const lang = mode === "ko" ? "ko-KR" : "en";
    const imeMode = mode === "ko" ? "active" : "inactive";
    input.setAttribute("lang", lang);
    input.setAttribute("inputmode", "text");
    input.setAttribute("autocapitalize", "off");
    input.style.imeMode = imeMode;
    input.classList.toggle("ime-korean", mode === "ko");
    input.classList.toggle("ime-latin", mode === "en");
    input.addEventListener("focus", () => {
      input.setAttribute("lang", lang);
      input.style.imeMode = imeMode;
    });
  }

  const korean = document.getElementById("word-korean-input");
  const meaning = document.getElementById("word-meaning-input");
  bind(korean instanceof HTMLInputElement ? korean : null, "ko");
  bind(meaning instanceof HTMLInputElement ? meaning : null, "en");
}

function wireForms(showSection) {
  document.getElementById("form-word").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const fd = new FormData(form);
    const word = normalizeWordEntry({
      id: crypto.randomUUID(),
      korean: String(fd.get("korean") || "").trim(),
      meaning: String(fd.get("meaning") || "").trim(),
      notes: String(fd.get("notes") || "").trim(),
      practiced: false,
      flashCorrectCount: 0,
      practiceWeight: 0,
    });
    if (!word.korean || !word.meaning) return;
    const words = getWords();
    words.unshift(word);
    saveWords(words);
    form.reset();
    renderWords(document.getElementById("filter-words").value);
    updateFlashPanel();
    refreshStats();
  });

  document.getElementById("filter-words").addEventListener("input", (e) => {
    renderWords(/** @type {HTMLInputElement} */ (e.target).value);
  });

  const sortWords = document.getElementById("sort-words");
  if (sortWords instanceof HTMLSelectElement) {
    sortWords.addEventListener("change", () => {
      vocabularySortMode =
        sortWords.value === "korean-alpha" ? "korean-alpha" : "added";
      renderWords(document.getElementById("filter-words").value);
    });
  }

  document.getElementById("form-grammar").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const fd = new FormData(form);
    const topic = {
      id: crypto.randomUUID(),
      topic: String(fd.get("topic") || "").trim(),
      notes: String(fd.get("grammarNotes") || "").trim(),
      done: false,
    };
    if (!topic.topic) return;
    const topics = /** @type {GrammarTopic[]} */ (loadJson(STORAGE_GRAMMAR, []));
    topics.unshift(topic);
    saveJson(STORAGE_GRAMMAR, topics);
    form.reset();
    renderGrammar();
    refreshStats();
  });

  const lessonForm = document.getElementById("form-lesson");
  const lessonFilesLabel = document.getElementById("lesson-files-label");
  const lessonFilesInput = document.getElementById("lesson-files");
  if (lessonFilesInput instanceof HTMLInputElement && lessonFilesLabel) {
    lessonFilesInput.addEventListener("change", () => {
      const count = lessonFilesInput.files?.length || 0;
      if (count === 0) {
        lessonFilesLabel.textContent = "No files selected";
      } else if (count === 1) {
        lessonFilesLabel.textContent = lessonFilesInput.files[0].name;
      } else {
        lessonFilesLabel.textContent = `${count} files selected`;
      }
    });
  }

  lessonForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const fd = new FormData(form);
    const title = String(fd.get("title") || "").trim();
    const lessonDate = String(fd.get("lessonDate") || "").trim();
    if (!title || !lessonDate) return;

    const fileInput = form.querySelector('input[name="files"]');
    const files = fileInput?.files ? Array.from(fileInput.files) : [];

    /** @type {{ id: string, fileName: string, mimeType: string, blob: Blob }[]} */
    const attachments = [];
    for (const file of files) {
      attachments.push({
        id: crypto.randomUUID(),
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        blob: file,
      });
    }

    const lesson = {
      id: crypto.randomUUID(),
      title,
      lessonDate,
      summary: String(fd.get("summary") || "").trim(),
      homeworkNotes: String(fd.get("homeworkNotes") || "").trim(),
      attachments,
      createdAt: new Date().toISOString(),
    };

    await putLesson(lesson);
    form.reset();
    if (fileInput) fileInput.value = "";
    if (lessonFilesLabel) lessonFilesLabel.textContent = "No files selected";
    refreshStats();
    renderLessons();
    showSection("preply");
  });
}

function wirePronunciationPractice() {
  const textInput = document.getElementById("pronunciation-text");
  const micSelect = document.getElementById("pronunciation-mic");
  const listenBtn = document.getElementById("pronunciation-listen");
  const recordBtn = document.getElementById("pronunciation-record");
  const stopBtn = document.getElementById("pronunciation-stop");
  const clearBtn = document.getElementById("pronunciation-clear");
  const statusEl = document.getElementById("pronunciation-status");
  const resultEl = document.getElementById("pronunciation-result");
  const playback = document.getElementById("pronunciation-playback");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (
    !(textInput instanceof HTMLTextAreaElement) ||
    !(micSelect instanceof HTMLSelectElement) ||
    !(listenBtn instanceof HTMLButtonElement) ||
    !(recordBtn instanceof HTMLButtonElement) ||
    !(stopBtn instanceof HTMLButtonElement) ||
    !(clearBtn instanceof HTMLButtonElement) ||
    !(statusEl instanceof HTMLElement) ||
    !(resultEl instanceof HTMLElement) ||
    !(playback instanceof HTMLAudioElement)
  ) {
    return;
  }

  /** @type {MediaStream | null} */
  let activeStream = null;
  /** @type {MediaStream | null} */
  let permissionStream = null;
  let permissionStreamDeviceId = "";
  /** @type {MediaRecorder | null} */
  let recorder = null;
  /** @type {Blob[]} */
  let chunks = [];
  let listening = false;
  /** @type {SpeechRecognition | null} */
  let activeRecognition = null;
  let recognitionInitialized = false;
  let currentPhrase = "";
  let playbackUrl = "";

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function cleanSession() {
    activeStream = null;
    recorder = null;
    listening = false;
    stopBtn.disabled = true;
    recordBtn.disabled = false;
  }

  async function ensurePermissionStream() {
    const selectedDeviceId = micSelect.value;
    const shouldRefresh =
      !permissionStream ||
      !permissionStream.active ||
      permissionStreamDeviceId !== selectedDeviceId;
    if (!shouldRefresh) {
      return permissionStream;
    }
    if (permissionStream) {
      permissionStream.getTracks().forEach((track) => track.stop());
    }
    permissionStream = await navigator.mediaDevices.getUserMedia({
      audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
    });
    permissionStreamDeviceId = selectedDeviceId;
    return permissionStream;
  }

  function flashButton(btn) {
    btn.classList.remove("is-pressed");
    // Restart animation on repeated clicks.
    void btn.offsetWidth;
    btn.classList.add("is-pressed");
    window.setTimeout(() => btn.classList.remove("is-pressed"), 220);
  }

  function clearRecordingUi() {
    if (playbackUrl) {
      URL.revokeObjectURL(playbackUrl);
      playbackUrl = "";
    }
    playback.pause();
    playback.removeAttribute("src");
    playback.load();
    playback.hidden = true;
    resultEl.innerHTML = "";
  }

  function scoreRecognitionSimilarity(expectedRaw, heardRaw) {
    const expected = normalizeForCompare(expectedRaw, "ko");
    const heard = normalizeForCompare(heardRaw, "ko");
    if (!expected || !heard) return 0;
    const dist = levenshtein(expected, heard);
    const maxLen = Math.max(Array.from(expected).length, 1);
    return Math.max(0, Math.round((1 - dist / maxLen) * 100));
  }

  function renderCompareResult(expected, heard, score) {
    const toneClass =
      score >= 85 ? "is-correct" : score >= 60 ? "is-typo" : "is-wrong";
    resultEl.innerHTML = `
      <div class="flash-feedback ${toneClass}">
        Approximate pronunciation score: <strong>${score}%</strong>
      </div>
      <p class="grammar-meta"><strong>Target:</strong> ${escapeHtml(expected)}</p>
      <p class="grammar-meta"><strong>Heard:</strong> ${escapeHtml(heard || "(no transcript captured)")}</p>
    `;
  }

  function ensureRecognition() {
    if (!SpeechRecognition) return null;
    if (activeRecognition) return activeRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || "";
      const score = scoreRecognitionSimilarity(currentPhrase, transcript);
      renderCompareResult(currentPhrase, transcript, score);
    };
    recognition.onerror = () => {
      setStatus("Could not process speech recognition for this recording.");
    };
    recognition.onend = () => {
      listening = false;
    };
    activeRecognition = recognition;
    return recognition;
  }

  function getGoogleKoKrVoice() {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    return (
      voices.find((v) => /google/i.test(v.name) && /^ko-kr$/i.test(v.lang)) || null
    );
  }

  async function loadMicrophones() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");
      micSelect.innerHTML = "";
      if (!mics.length) {
        micSelect.innerHTML = `<option value="">No microphone found</option>`;
        return;
      }
      mics.forEach((mic, idx) => {
        const opt = document.createElement("option");
        opt.value = mic.deviceId;
        opt.textContent = mic.label || `Microphone ${idx + 1}`;
        micSelect.appendChild(opt);
      });
    } catch {
      micSelect.innerHTML = `<option value="">Microphone unavailable</option>`;
    }
  }

  listenBtn.addEventListener("click", () => {
    flashButton(listenBtn);
    const phrase = textInput.value.trim();
    if (!phrase) {
      setStatus("Enter a Korean phrase first.");
      return;
    }
    if (!("speechSynthesis" in window)) {
      setStatus("Text-to-speech is not available in this browser.");
      return;
    }
    const googleKoKrVoice = getGoogleKoKrVoice();
    if (!googleKoKrVoice) {
      setStatus("Google ko-KR voice is not available in this browser.");
      return;
    }
    const utt = new SpeechSynthesisUtterance(phrase);
    utt.voice = googleKoKrVoice;
    utt.lang = "ko-KR";
    utt.rate = 0.92;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
    setStatus("Playing model pronunciation...");
  });

  recordBtn.addEventListener("click", async () => {
    flashButton(recordBtn);
    const phrase = textInput.value.trim();
    if (!phrase) {
      setStatus("Enter a Korean phrase before recording.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Audio recording is not supported in this browser.");
      return;
    }
    if (!SpeechRecognition) {
      setStatus("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      resultEl.innerHTML = "";
      chunks = [];
      activeStream = await ensurePermissionStream();
      recorder = new MediaRecorder(activeStream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
        if (playbackUrl) URL.revokeObjectURL(playbackUrl);
        playbackUrl = URL.createObjectURL(blob);
        playback.src = playbackUrl;
        playback.hidden = false;
      };
      recorder.start();
      const recognition = ensureRecognition();
      listening = true;
      recordBtn.disabled = true;
      stopBtn.disabled = false;
      setStatus("Recording... Speak now, then press Stop.");
      currentPhrase = phrase;
      if (recognition) {
        recognition.start();
      }
      recognitionInitialized = true;
    } catch {
      cleanSession();
      setStatus("Microphone access failed. Check browser permission and device selection.");
    }
  });

  stopBtn.addEventListener("click", () => {
    flashButton(stopBtn);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (listening && activeRecognition) activeRecognition.stop();
    cleanSession();
    setStatus("Recording stopped. Review transcript and playback below.");
  });

  clearBtn.addEventListener("click", () => {
    flashButton(clearBtn);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    // Clearing should reset UI/state only; do not touch permission stream lifecycle.
    if (listening && activeRecognition) activeRecognition.stop();
    cleanSession();
    chunks = [];
    currentPhrase = "";
    clearRecordingUi();
    setStatus("Recording cleared. Enter a phrase, then listen and record.");
  });

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => {
      loadMicrophones();
    });
  }
  micSelect.addEventListener("change", () => {
    permissionStreamDeviceId = "";
  });

  // Warm voices list for browsers that load voices asynchronously.
  if (window.speechSynthesis?.getVoices) {
    window.speechSynthesis.getVoices();
  }
  loadMicrophones();
  // Warm up recognition object once so later records can reuse it.
  if (!recognitionInitialized) ensureRecognition();
}

function wireDataTransfer() {
  const exportBtn = document.getElementById("data-export-btn");
  const importBtn = document.getElementById("data-import-btn");
  const importInput = document.getElementById("data-import-input");
  const statusEl = document.getElementById("data-transfer-status");

  if (
    !(exportBtn instanceof HTMLButtonElement) ||
    !(importBtn instanceof HTMLButtonElement) ||
    !(importInput instanceof HTMLInputElement) ||
    !(statusEl instanceof HTMLElement)
  ) {
    return;
  }

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return res.blob();
  }

  exportBtn.addEventListener("click", async () => {
    setStatus("Preparing export...");
    const lessonsRaw = await getAllLessons();
    const lessons = await Promise.all(
      lessonsRaw.map(async (lesson) => {
        const attachments = Array.isArray(lesson.attachments) ? lesson.attachments : [];
        const packedAttachments = await Promise.all(
          attachments.map(async (a) => ({
            id: String(a.id || crypto.randomUUID()),
            fileName: String(a.fileName || "attachment"),
            mimeType: String(a.mimeType || "application/octet-stream"),
            dataUrl: a.blob instanceof Blob ? await blobToDataUrl(a.blob) : "",
          }))
        );
        return {
          ...lesson,
          attachments: packedAttachments,
        };
      })
    );

    const payload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      vocabulary: getWords().map((w) => normalizeWordEntry(w)),
      grammar: /** @type {GrammarTopic[]} */ (loadJson(STORAGE_GRAMMAR, [])),
      preplyLessons: lessons,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `korean-tracker-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(
      `Export complete. Saved ${payload.vocabulary.length} words, ${payload.grammar.length} grammar topics, and ${lessons.length} PrePly lessons.`
    );
  });

  importBtn.addEventListener("click", () => importInput.click());

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const vocab = Array.isArray(parsed?.vocabulary) ? parsed.vocabulary : null;
      const grammar = Array.isArray(parsed?.grammar) ? parsed.grammar : null;
      const preplyLessons = Array.isArray(parsed?.preplyLessons) ? parsed.preplyLessons : [];
      if (!vocab || !grammar) {
        setStatus("Import failed: file must contain vocabulary and grammar arrays.");
        return;
      }

      const normalizedWords = vocab
        .map((w) => normalizeWordEntry(w))
        .filter((w) => w && typeof w.korean === "string" && typeof w.meaning === "string")
        .map((w) => ({
          ...w,
          id: String(w.id || crypto.randomUUID()),
          korean: String(w.korean || "").trim(),
          meaning: String(w.meaning || "").trim(),
          notes: String(w.notes || "").trim(),
          practiced: !!w.practiced,
        }))
        .filter((w) => w.korean && w.meaning);

      const normalizedGrammar = grammar
        .filter((g) => g && typeof g.topic === "string")
        .map((g) => ({
          id: String(g.id || crypto.randomUUID()),
          topic: String(g.topic || "").trim(),
          notes: String(g.notes || "").trim(),
          done: !!g.done,
        }))
        .filter((g) => g.topic);

      const normalizedLessons = [];
      for (const lesson of preplyLessons) {
        if (!lesson || typeof lesson.title !== "string" || typeof lesson.lessonDate !== "string") {
          continue;
        }
        const attachments = Array.isArray(lesson.attachments) ? lesson.attachments : [];
        const restoredAttachments = [];
        for (const a of attachments) {
          if (!a || typeof a.fileName !== "string" || typeof a.dataUrl !== "string") continue;
          try {
            const blob = await dataUrlToBlob(a.dataUrl);
            restoredAttachments.push({
              id: String(a.id || crypto.randomUUID()),
              fileName: String(a.fileName || "attachment"),
              mimeType: String(a.mimeType || blob.type || "application/octet-stream"),
              blob,
            });
          } catch {
            // Skip broken attachment payloads but keep lesson import.
          }
        }
        normalizedLessons.push({
          id: String(lesson.id || crypto.randomUUID()),
          title: String(lesson.title || "").trim(),
          lessonDate: String(lesson.lessonDate || "").trim(),
          summary: String(lesson.summary || "").trim(),
          homeworkNotes: String(lesson.homeworkNotes || "").trim(),
          attachments: restoredAttachments,
          createdAt: String(lesson.createdAt || new Date().toISOString()),
        });
      }

      saveWords(normalizedWords);
      saveJson(STORAGE_GRAMMAR, normalizedGrammar);
      await replaceAllLessons(normalizedLessons);
      renderWords(document.getElementById("filter-words").value);
      renderGrammar();
      renderLessons();
      updateFlashPanel();
      refreshStats();
      setStatus(
        `Import complete. Loaded ${normalizedWords.length} vocabulary entries, ${normalizedGrammar.length} grammar topics, and ${normalizedLessons.length} PrePly lessons.`
      );
    } catch {
      setStatus("Import failed: invalid JSON file.");
    } finally {
      importInput.value = "";
    }
  });
}

function init() {
  migrateStorageWords();
  const showSection = wireNavigation();
  wireForms(showSection);
  wireFlashcards();
  wirePronunciationPractice();
  wireDataTransfer();
  wireInputLanguageHints();

  const today = new Date().toISOString().slice(0, 10);
  const dateInput = document.querySelector('#form-lesson input[name="lessonDate"]');
  if (dateInput && !dateInput.value) dateInput.value = today;

  updateFlashPanel();
  renderWords("");
  renderGrammar();
  refreshStats();
}

init();
