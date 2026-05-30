const els = {
  library: document.getElementById("library"),
  shelves: document.getElementById("shelves"),
  rescan: document.getElementById("rescan"),
  search: document.getElementById("search"),
  filterChips: document.getElementById("filter-chips"),
  sortSelect: document.getElementById("sort-select"),
  addBtn: document.getElementById("add-btn"),
  selectBtn: document.getElementById("select-btn"),
  bulkBar: document.getElementById("bulk-bar"),
  bulkCount: document.getElementById("bulk-count"),
  bulkFinished: document.getElementById("bulk-finished"),
  bulkUnfinished: document.getElementById("bulk-unfinished"),
  bulkDelete: document.getElementById("bulk-delete"),
  bulkCancel: document.getElementById("bulk-cancel"),
  statsBtn: document.getElementById("stats-btn"),
  stats: document.getElementById("stats"),
  statsClose: document.getElementById("stats-close"),
  statsBody: document.getElementById("stats-body"),
  exportStatsCsv: document.getElementById("export-stats-csv"),
  exportStatsJson: document.getElementById("export-stats-json"),
  exportFinished: document.getElementById("export-finished"),
  // Settings
  settingsBtn: document.getElementById("settings-btn"),
  settings: document.getElementById("settings"),
  settingsClose: document.getElementById("settings-close"),
  catsList: document.getElementById("cats-list"),
  catsAdd: document.getElementById("cats-add"),
  catsSave: document.getElementById("cats-save"),
  catsMsg: document.getElementById("cats-msg"),
  seriesView: document.getElementById("series-view"),
  seriesBack: document.getElementById("series-back"),
  seriesName: document.getElementById("series-name"),
  seriesGrid: document.getElementById("series-grid"),
  // Wizard
  wizard: document.getElementById("wizard"),
  wizardClose: document.getElementById("wizard-close"),
  wizardCats: document.getElementById("wizard-cats"),
  wizardSeriesWrap: document.getElementById("wizard-series-wrap"),
  wizardSeries: document.getElementById("wizard-series"),
  seriesList: document.getElementById("series-list"),
  wizardDrop: document.getElementById("wizard-drop"),
  wizardDropText: document.getElementById("wizard-drop-text"),
  wizardFiles: document.getElementById("wizard-files"),
  wizardFolder: document.getElementById("wizard-folder"),
  wizardFolderBtn: document.getElementById("wizard-folder-btn"),
  wizardList: document.getElementById("wizard-list"),
  wizardUpload: document.getElementById("wizard-upload"),
  wizardMsg: document.getElementById("wizard-msg"),
  wizardProgress: document.getElementById("wizard-progress"),
  wizardBar: document.getElementById("wizard-bar"),
  reader: document.getElementById("reader"),
  stage: document.getElementById("stage"),
  page: document.getElementById("page"),
  readerUi: document.getElementById("reader-ui"),
  readerTitle: document.getElementById("reader-title"),
  back: document.getElementById("back"),
  fitToggle: document.getElementById("fit-toggle"),
  dirToggle: document.getElementById("dir-toggle"),
  themeToggle: document.getElementById("theme-toggle"),
  spreadToggle: document.getElementById("spread-toggle"),
  pageLeft: document.getElementById("page-left"),
  pageRight: document.getElementById("page-right"),
  readerOpen: document.getElementById("reader-open"),
  slider: document.getElementById("slider"),
  counter: document.getElementById("counter"),
  spinner: document.getElementById("spinner"),
  toast: document.getElementById("toast"),
  // Page-turn flip
  flip: document.getElementById("flip"),
  flipUnder: document.getElementById("flip-under"),
  flipLeaf: document.getElementById("flip-leaf"),
  flipFront: document.getElementById("flip-front"),
  flipShade: document.querySelector("#flip .flip-shade"),
  // Document readers
  epubView: document.getElementById("epub-view"),
  epubArea: document.getElementById("epub-area"),
  epubTitle: document.getElementById("epub-title"),
  epubBack: document.getElementById("epub-back"),
  epubPrev: document.getElementById("epub-prev"),
  epubNext: document.getElementById("epub-next"),
  epubSlider: document.getElementById("epub-slider"),
  epubPct: document.getElementById("epub-pct"),
  epubFontUp: document.getElementById("epub-font-up"),
  epubFontDn: document.getElementById("epub-font-dn"),
  // Details / metadata modal
  details: document.getElementById("details"),
  detailsClose: document.getElementById("details-close"),
  detailsCover: document.getElementById("details-cover"),
  detailsTitle: document.getElementById("details-title"),
  detailsSub: document.getElementById("details-sub"),
  detailsRating: document.getElementById("details-rating"),
  detailsDesc: document.getElementById("details-desc"),
  detailsRead: document.getElementById("details-read"),
  detailsFinish: document.getElementById("details-finish"),
  // Bookmarks
  bmToggle: document.getElementById("bm-toggle"),
  bmToggleEpub: document.getElementById("bm-toggle-epub"),
  bookmarks: document.getElementById("bookmarks"),
  bookmarksClose: document.getElementById("bookmarks-close"),
  bookmarksAdd: document.getElementById("bookmarks-add"),
  bookmarksList: document.getElementById("bookmarks-list"),
};

const state = {
  view: "library",   // library | comic | pdf | epub
  book: null,        // current comic { id, title, series }
  doc: null,         // current document { id, title, type }
  src: null,         // active paged source: { kind: "comic"|"pdf", id }
  pageCount: 0,
  index: 0,
  rtl: false,        // right-to-left (manga) reading direction
  spread: localStorage.getItem("spread") === "1",
  // Default: fit-width on portrait/phone screens, fit-height on wide desktop.
  fit: localStorage.getItem("fit") || (window.innerHeight > window.innerWidth ? "width" : "height"),
};
let catalog = { categories: [] };  // full library, kept for Continue Reading + next-volume

// ---------- Zoom & pan ----------
// The page image is positioned via a CSS transform: translate(tx,ty) scale(s),
// with transform-origin at 0,0. "Fit" sets the base (scale-1) size in CSS; we
// layer pan/zoom on top of that.
const view = { scale: 1, tx: 0, ty: 0, bw: 0, bh: 0 };
const MIN_SCALE = 1, MAX_SCALE = 6;
const clampNum = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function applyTransform() {
  els.page.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
}
function clampView() {
  const sw = els.stage.clientWidth, sh = els.stage.clientHeight;
  const w = view.bw * view.scale, h = view.bh * view.scale;
  view.tx = w <= sw ? (sw - w) / 2 : clampNum(view.tx, sw - w, 0);
  view.ty = h <= sh ? (sh - h) / 2 : clampNum(view.ty, sh - h, 0);
}
function canPan() {
  return view.bw * view.scale > els.stage.clientWidth + 1 ||
         view.bh * view.scale > els.stage.clientHeight + 1;
}
function updateCursor() {
  els.stage.classList.toggle("can-pan", canPan());
}
function resetView() {
  view.scale = 1;
  view.bw = els.page.offsetWidth;
  view.bh = els.page.offsetHeight;
  view.tx = 0;
  view.ty = 0;
  clampView();
  applyTransform();
  updateCursor();
}
// Zoom by `factor`, keeping the point (cx,cy) (relative to the stage) fixed.
function zoomAt(factor, cx, cy) {
  const ns = clampNum(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const f = ns / view.scale;
  view.tx = cx - (cx - view.tx) * f;
  view.ty = cy - (cy - view.ty) * f;
  view.scale = ns;
  clampView();
  applyTransform();
  updateCursor();
}
function toggleZoomAt(cx, cy) {
  if (view.scale > 1.01) resetView();
  else zoomAt(2.5, cx, cy);
}

// ---------- Auth (optional shared-secret token) ----------
function getReaderToken() { return localStorage.getItem("readerToken") || ""; }
function getAuthHeader() {
  const t = getReaderToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function authFetch(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...getAuthHeader() } });
  if (r.status !== 401) return r;
  const t = prompt("Reader access token:");
  if (!t) return r;
  localStorage.setItem("readerToken", t);
  return fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${t}` } });
}

// ---------- Progress persistence (synced across devices) ----------
// In-memory source of truth, hydrated from the server at startup and mirrored
// to localStorage for offline use.
const progressStore = {};
function progressKey(id) { return `progress:${id}`; }

function readProgress(id) {
  if (progressStore[id]) return progressStore[id];
  try { return JSON.parse(localStorage.getItem(progressKey(id))); } catch { return null; }
}

// Save a record locally and push it to the server (best-effort).
function persistProgress(id, rec) {
  progressStore[id] = rec;
  try { localStorage.setItem(progressKey(id), JSON.stringify(rec)); } catch {}
  authFetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, data: rec }),
  }).catch(() => {});
}

function saveProgress() {
  if (!state.src) return;
  const prev = readProgress(state.src.id) || {};
  // Merge so finished flag / bookmarks survive a regular page turn.
  persistProgress(state.src.id, { ...prev, index: state.index, pageCount: state.pageCount, t: Date.now() });
}
function saveDocProgress(id, extra) {
  const prev = readProgress(id) || {};
  persistProgress(id, { ...prev, ...extra, t: Date.now() });
}

// ---------- Reading stats tracking ----------
let pageStartTime = 0;
let currentReadId = null;   // id of the item that owns the current dwell time

function currentReadingId() {
  if (state.src) return state.src.id;
  if (state.view === "epub" && state.doc) return state.doc.id;
  return null;
}
function postStats(pages, ms, id) {
  if (!pages && !ms) return;
  authFetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pages, ms, id: id || undefined }),
  }).catch(() => {});
}
function recordPageTurn() {
  if (!pageStartTime) return; // first page of a session: no prior dwell to record
  const dt = Math.min(60000, Math.max(0, Date.now() - pageStartTime));
  postStats(1, dt, currentReadId);
}
function flushReadingSession() {
  if (!pageStartTime) return;
  const dt = Math.min(60000, Math.max(0, Date.now() - pageStartTime));
  postStats(0, dt, currentReadId);
  pageStartTime = 0;
  currentReadId = null;
}

function fmtTime(ms) {
  const m = Math.round((ms || 0) / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}
function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function openStats() {
  els.stats.classList.remove("hidden");
  els.statsBody.textContent = "Loading…";
  let s;
  try { s = await fetch("/api/stats").then((r) => r.json()); }
  catch { els.statsBody.textContent = "Couldn't load stats."; return; }
  const today = s.byDay && s.byDay[localDayKey()] || { pages: 0, ms: 0 };
  let weekP = 0, weekMs = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const r = s.byDay && s.byDay[localDayKey(d)];
    if (r) { weekP += r.pages || 0; weekMs += r.ms || 0; }
  }
  // Top reads — lookup titles from the catalog
  const titles = new Map();
  for (const it of allItems()) titles.set(it.id, it.title);
  const top = Object.entries(s.byItem || {})
    .map(([id, v]) => ({ id, title: titles.get(id), pages: v.pages, ms: v.ms }))
    .filter((x) => x.title) // skip orphaned ids
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5);
  const topHtml = top.length
    ? top.map((t) => `<div class="stats-row"><span class="ellipsis">${t.title}</span><strong>${fmtTime(t.ms)}</strong></div>`).join("")
    : '<div class="stats-row" style="color:var(--muted)"><span>Nothing tracked yet.</span></div>';

  els.statsBody.innerHTML = `
    <div class="stats-section">Today</div>
    <div class="stats-row"><span>Pages read</span><strong>${today.pages}</strong></div>
    <div class="stats-row"><span>Time spent</span><strong>${fmtTime(today.ms)}</strong></div>
    <div class="stats-section">Last 7 days</div>
    <div class="stats-row"><span>Pages read</span><strong>${weekP}</strong></div>
    <div class="stats-row"><span>Time spent</span><strong>${fmtTime(weekMs)}</strong></div>
    <div class="stats-section">All-time</div>
    <div class="stats-row"><span>Pages read</span><strong>${s.totalPages || 0}</strong></div>
    <div class="stats-row"><span>Time spent</span><strong>${fmtTime(s.totalMs)}</strong></div>
    <div class="stats-section">Top reads</div>
    ${topHtml}
  `;
}
function closeStats() { els.stats.classList.add("hidden"); }

// ---------- Exports ----------
function downloadBlob(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvEscape = (s) => /[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s);
async function exportStatsCsv() {
  const s = await fetch("/api/stats").then((r) => r.json());
  const lines = ["date,pages,minutes"];
  for (const d of Object.keys(s.byDay || {}).sort()) {
    const row = s.byDay[d] || {};
    lines.push(`${d},${row.pages || 0},${Math.round((row.ms || 0) / 60000)}`);
  }
  downloadBlob("reading-stats.csv", "text/csv", lines.join("\n"));
}
async function exportStatsJson() {
  const s = await fetch("/api/stats").then((r) => r.json());
  downloadBlob("reading-stats.json", "application/json", JSON.stringify(s, null, 2));
}
// ---------- Settings: categories ----------
function addCatRow(name = "", dir = "") {
  const li = document.createElement("li");
  li.className = "cat-row";
  const n = document.createElement("input"); n.placeholder = "Display name"; n.value = name; n.dataset.field = "name";
  const d = document.createElement("input"); d.placeholder = "folder"; d.value = dir; d.dataset.field = "dir";
  const rm = document.createElement("button"); rm.className = "rm"; rm.textContent = "×"; rm.title = "Remove";
  rm.addEventListener("click", () => li.remove());
  li.append(n, d, rm);
  els.catsList.appendChild(li);
}
async function openSettings() {
  els.catsMsg.textContent = "";
  els.catsList.innerHTML = "";
  let cats = [];
  try { cats = await fetch("/api/categories").then((r) => r.json()); } catch {}
  if (!cats.length) cats = [{ name: "Books", dir: "books" }, { name: "Learning", dir: "learning" }];
  for (const c of cats) addCatRow(c.name, c.dir);
  els.settings.classList.remove("hidden");
}
function closeSettings() { els.settings.classList.add("hidden"); }
async function saveCategories() {
  const rows = [...els.catsList.querySelectorAll(".cat-row")];
  const arr = rows.map((r) => {
    const ins = [...r.querySelectorAll("input")];
    return { name: ins[0].value.trim(), dir: ins[1].value.trim() };
  }).filter((c) => c.name && c.dir);
  els.catsMsg.textContent = "Saving…";
  try {
    const r = await authFetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: arr }),
    });
    if (!r.ok) throw new Error("save failed");
    els.catsMsg.textContent = "Saved.";
    setTimeout(() => { closeSettings(); loadLibrary(); }, 500);
  } catch {
    els.catsMsg.textContent = "Couldn't save.";
  }
}

function exportFinishedCsv() {
  const rows = [["title", "category", "finished_at"]];
  for (const cat of catalog.categories) {
    for (const shelf of cat.shelves) {
      for (const it of shelf.items) {
        const p = readProgress(it.id);
        if (p && p.finished) {
          rows.push([it.title, cat.name, new Date(p.t || 0).toISOString()]);
        }
      }
    }
  }
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  downloadBlob("finished.csv", "text/csv", csv);
}

// Merge server progress with local progress (newest timestamp wins) at startup.
async function syncProgress() {
  let server = {};
  try { server = await fetch("/api/progress").then((r) => r.json()); } catch {}
  Object.assign(progressStore, server);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith("progress:")) continue;
    const id = k.slice("progress:".length);
    let local; try { local = JSON.parse(localStorage.getItem(k)); } catch { continue; }
    if (!local) continue;
    const srv = progressStore[id];
    if (!srv || (local.t || 0) > (srv.t || 0)) {
      progressStore[id] = local;
      authFetch("/api/progress", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, data: local }),
      }).catch(() => {});
    }
  }
  for (const [id, rec] of Object.entries(progressStore)) {
    try { localStorage.setItem(progressKey(id), JSON.stringify(rec)); } catch {}
  }
}

// ---------- Library ----------
let searchText = "";       // lowercase title filter
let activeCategory = null; // null = all
let sortBy = localStorage.getItem("sortBy") || "default"; // default | recent | az
let lastSig = "";          // catalog signature for live-refresh

// Sort items inside a shelf per the current selection.
function sortItems(items) {
  if (sortBy === "az") {
    return items.slice().sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" })
    );
  }
  if (sortBy === "recent") {
    return items.slice().sort((a, b) => {
      const ta = (readProgress(a.id) || {}).t || 0;
      const tb = (readProgress(b.id) || {}).t || 0;
      return tb - ta; // most recent first
    });
  }
  return items; // default = server order
}

function catalogSig(c) {
  return JSON.stringify((c.categories || []).map((x) => [x.name, x.shelves.flatMap((s) => s.items.map((i) => i.id))]));
}

async function loadLibrary() {
  const res = await fetch("/api/library");
  catalog = await res.json();
  lastSig = catalogSig(catalog);
  renderFilterChips();
  renderLibrary();
}

function renderFilterChips() {
  els.filterChips.innerHTML = "";
  const names = ["All", ...catalog.categories.map((c) => c.name)];
  for (const name of names) {
    const chip = document.createElement("button");
    const isActive = name === "All" ? activeCategory === null : activeCategory === name;
    chip.className = "chip" + (isActive ? " active" : "");
    chip.textContent = name;
    chip.addEventListener("click", () => {
      activeCategory = name === "All" ? null : name;
      renderFilterChips();
      renderLibrary();
    });
    els.filterChips.appendChild(chip);
  }
}

function matchesSearch(item) {
  return !searchText || item.title.toLowerCase().includes(searchText);
}
function isFinished(item) {
  const p = readProgress(item.id);
  return !!(p && p.finished);
}
function unfinishedItems(items) { return items.filter((i) => !isFinished(i)); }
function finishedAcrossAll() {
  const out = [];
  for (const cat of catalog.categories) {
    if (activeCategory !== null && cat.name !== activeCategory) continue;
    for (const shelf of cat.shelves) {
      for (const it of shelf.items) {
        if (isFinished(it) && matchesSearch(it)) out.push({ item: it, t: (readProgress(it.id) || {}).t || 0 });
      }
    }
  }
  out.sort((a, b) => b.t - a.t);
  return out.map((r) => r.item);
}

// Every item across the whole catalog (flattened).
function allItems() {
  const out = [];
  for (const cat of catalog.categories)
    for (const shelf of cat.shelves)
      for (const it of shelf.items) out.push(it);
  return out;
}

// The fraction read (0..1) for an item, or null if unknown / not started.
function progressFraction(item, p) {
  if (!p) return null;
  if (item.type === "comic" || item.type === "pdf") {
    if (!p.pageCount || p.pageCount < 2) return null;
    return p.index / (p.pageCount - 1);
  }
  if (item.type === "epub") return typeof p.percent === "number" ? p.percent : null;
  return null;
}

// Recently-opened / in-progress items, most recent first.
function continueReading() {
  const rows = [];
  for (const it of allItems()) {
    const p = readProgress(it.id);
    if (!p || !p.t) continue;
    if (p.finished) continue;                                  // explicitly finished
    if (it.type === "comic" || it.type === "pdf") {
      if (!(p.index > 0)) continue;                            // not really started
      if (p.pageCount && p.index >= p.pageCount - 1) continue; // hit the last page
    }
    if (it.type === "epub" && p.percent >= 0.99) continue;     // hit the end
    rows.push({ item: it, t: p.t });
  }
  rows.sort((a, b) => b.t - a.t);
  return rows.slice(0, 12).map((r) => r.item);
}

function shelfRow(items) {
  const row = document.createElement("div");
  row.className = "row";
  for (const it of items) row.appendChild(makeCard(it));
  return row;
}

function renderLibrary() {
  els.shelves.innerHTML = "";
  if (!catalog.categories.length) {
    els.shelves.innerHTML =
      '<div class="empty">Nothing here yet.<br>Tap <b>+ Add</b> to upload a comic, book, or PDF' +
      ' — or drop files into the <b>files/</b> folder.</div>';
    return;
  }

  const filtering = !!searchText || activeCategory !== null;

  if (!filtering) {
    const cont = continueReading();
    if (cont.length) {
      const sec = document.createElement("section");
      sec.className = "category";
      const h = document.createElement("h2");
      h.className = "category-title";
      h.textContent = "Continue Reading";
      sec.appendChild(h);
      sec.appendChild(shelfRow(cont));
      els.shelves.appendChild(sec);
    }
  }

  let shown = 0;
  for (const cat of catalog.categories) {
    if (activeCategory !== null && cat.name !== activeCategory) continue;
    const shelves = cat.shelves
      .map((s) => ({ title: s.title, items: sortItems(unfinishedItems(s.items.filter(matchesSearch))) }))
      .filter((s) => s.items.length);
    if (!shelves.length) continue;

    const sec = document.createElement("section");
    sec.className = "category";
    const h = document.createElement("h2");
    h.className = "category-title";
    h.textContent = cat.name;
    sec.appendChild(h);
    for (const shelf of shelves) {
      if (shelf.title) {
        const sub = document.createElement("h3");
        sub.style.cssText = "font-size:15px;margin:14px 4px 10px;color:var(--muted);";
        sub.textContent = shelf.title + " →";
        sub.className = "shelf-link";
        const seriesName = shelf.title;
        sub.addEventListener("click", () => openSeries(seriesName));
        sec.appendChild(sub);
      }
      sec.appendChild(shelfRow(shelf.items));
      shown += shelf.items.length;
    }
    els.shelves.appendChild(sec);
  }

  // Finished items shelf at the bottom (always added if any).
  const fin = finishedAcrossAll();
  if (fin.length) {
    const sec = document.createElement("section");
    sec.className = "category";
    const h = document.createElement("h2");
    h.className = "category-title";
    h.textContent = "Finished";
    sec.appendChild(h);
    sec.appendChild(shelfRow(fin));
    els.shelves.appendChild(sec);
    shown += fin.length;
  }

  if (filtering && shown === 0) {
    els.shelves.innerHTML = '<div class="empty">No matches.</div>';
  }
}

function makeCard(item) {
  const card = document.createElement("div");
  card.className = "card";
  let coverEl;

  if (item.type === "comic") {
    coverEl = document.createElement("div");
    coverEl.className = "cover";
    const img = document.createElement("img");
    img.className = "cover-img";
    img.loading = "lazy";
    img.src = `/api/book/${item.id}/cover`;
    coverEl.appendChild(img);
  } else {
    coverEl = document.createElement("div");
    coverEl.className = `cover doc ${item.type} noimg`; // placeholder until cover loads
    const img = document.createElement("img");
    img.className = "cover-img";
    img.loading = "lazy";
    img.alt = "";
    img.addEventListener("load", () => coverEl.classList.remove("noimg"));
    img.addEventListener("error", () => img.remove()); // keep gradient placeholder
    img.src = `/api/doc/${item.id}/cover`;
    const name = document.createElement("div");
    name.className = "doc-name";
    name.textContent = item.title;
    const badge = document.createElement("div");
    badge.className = "doc-badge";
    badge.textContent = item.type.toUpperCase();
    coverEl.appendChild(img);
    coverEl.appendChild(name);
    coverEl.appendChild(badge);
  }
  card.appendChild(coverEl);

  const frac = progressFraction(item, readProgress(item.id));
  if (frac != null) {
    const bar = document.createElement("div");
    bar.className = "progress-bar";
    bar.style.width = `${Math.round(frac * 100)}%`;
    coverEl.appendChild(bar);
  }

  const label = document.createElement("div");
  label.className = "card-label";
  label.textContent = item.title;
  card.appendChild(label);

  const info = document.createElement("button");
  info.className = "card-info";
  info.textContent = "ⓘ";
  info.title = "Details";
  info.addEventListener("click", (e) => { e.stopPropagation(); openDetails(item); });
  card.appendChild(info);

  card.dataset.id = item.id;
  if (selectionMode && selectedIds.has(item.id)) card.classList.add("selected");
  card.addEventListener("click", (e) => {
    if (selectionMode) {
      e.preventDefault();
      e.stopPropagation();
      toggleSelect(item.id);
      card.classList.toggle("selected", selectedIds.has(item.id));
      return;
    }
    openItem(item);
  });
  return card;
}

// ---------- Bulk selection ----------
let selectionMode = false;
const selectedIds = new Set();
function refreshBulkBar() {
  els.bulkCount.textContent = `${selectedIds.size} selected`;
  els.bulkBar.classList.toggle("hidden", !selectionMode);
  els.library.classList.toggle("library-select-mode", selectionMode);
  els.selectBtn.classList.toggle("active", selectionMode);
}
function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  refreshBulkBar();
}
function enterSelectMode() { selectionMode = true; selectedIds.clear(); refreshBulkBar(); }
function exitSelectMode() { selectionMode = false; selectedIds.clear(); refreshBulkBar(); }

function bulkSetFinished(value) {
  for (const id of selectedIds) {
    const prev = readProgress(id) || {};
    persistProgress(id, { ...prev, finished: !!value, t: Date.now() });
  }
  showToast(`${selectedIds.size} item(s) ${value ? "marked finished" : "marked unfinished"}`);
  exitSelectMode();
  renderLibrary();
}
async function bulkDelete() {
  if (!selectedIds.size) return;
  if (!confirm(`Delete ${selectedIds.size} item(s) from disk? This cannot be undone.`)) return;
  const ids = [...selectedIds];
  try {
    const r = await authFetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const j = await r.json();
    showToast(`Deleted ${j.removed ? j.removed.length : 0} item(s)`);
  } catch {
    showToast("Delete failed");
  }
  exitSelectMode();
  await loadLibrary();
}

// ---------- Details / metadata ----------
// What to search the catalog API for: series for comics, cleaned title for docs.
function metaQuery(item) {
  if (item.type === "comic") return item.series;
  return item.title.replace(/^\([^)]*\)\s*/, "").trim(); // drop "(Book 1) " prefixes
}
function coverUrlFor(item) {
  return item.type === "comic" ? `/api/book/${item.id}/cover` : `/api/doc/${item.id}/cover`;
}

let detailsItem = null;
async function openDetails(item) {
  detailsItem = item;
  els.details.classList.remove("hidden");
  els.detailsTitle.textContent = item.title;
  els.detailsSub.textContent = "Looking up…";
  els.detailsRating.textContent = "";
  els.detailsDesc.textContent = "";
  refreshFinishButton();
  const local = coverUrlFor(item);
  els.detailsCover.onerror = () => { els.detailsCover.onerror = null; els.detailsCover.src = local; };
  els.detailsCover.src = local;

  try {
    const m = await fetch(`/api/meta/${item.id}?q=${encodeURIComponent(metaQuery(item))}`).then((r) => r.json());
    if (detailsItem !== item) return; // user opened a different item meanwhile
    if (m.found) {
      els.detailsSub.textContent = [m.author, m.year].filter(Boolean).join(" · ") || "—";
      els.detailsRating.textContent = m.rating ? `★ ${m.rating} / 5` : "";
      els.detailsDesc.textContent = m.description || "No description available.";
      if (m.coverUrl) els.detailsCover.src = m.coverUrl; // prefer the richer catalog cover
    } else {
      els.detailsSub.textContent = "No catalog match";
      els.detailsDesc.textContent = "";
    }
  } catch {
    if (detailsItem === item) els.detailsSub.textContent = "Lookup failed (offline?)";
  }
}
function closeDetails() { els.details.classList.add("hidden"); detailsItem = null; }

function refreshFinishButton() {
  if (!detailsItem) return;
  els.detailsFinish.textContent = isFinished(detailsItem) ? "Mark unfinished" : "Mark finished";
}
// ---------- Bookmarks ----------
function currentBookmarkId() {
  if (state.src) return state.src.id;
  if (state.view === "epub" && state.doc) return state.doc.id;
  return null;
}
function currentBookmarkValue() {
  if (state.view === "epub") {
    const loc = epubRendition && epubRendition.currentLocation();
    return loc && loc.start && loc.start.cfi;
  }
  return typeof state.index === "number" ? state.index : null;
}
function bookmarkLabel(b) {
  return typeof b.v === "number" ? `Page ${b.v + 1}` : "Bookmark";
}
function isCurrentBookmarked() {
  const id = currentBookmarkId();
  if (!id) return false;
  const list = (readProgress(id) || {}).bookmarks || [];
  return list.some((b) => b.v === currentBookmarkValue());
}
function addBookmarkCurrent() {
  const id = currentBookmarkId();
  const v = currentBookmarkValue();
  if (!id || v === null || v === undefined) return;
  const prev = readProgress(id) || {};
  const list = Array.isArray(prev.bookmarks) ? prev.bookmarks.slice() : [];
  if (list.some((b) => b.v === v)) return;
  list.push({ v, t: Date.now() });
  list.sort((a, b) => (typeof a.v === "number" && typeof b.v === "number") ? a.v - b.v : 0);
  persistProgress(id, { ...prev, bookmarks: list, t: Date.now() });
}
function removeBookmark(v) {
  const id = currentBookmarkId();
  if (!id) return;
  const prev = readProgress(id) || {};
  const list = (prev.bookmarks || []).filter((b) => b.v !== v);
  persistProgress(id, { ...prev, bookmarks: list, t: Date.now() });
}
function toggleBookmarkCurrent() {
  if (isCurrentBookmarked()) removeBookmark(currentBookmarkValue());
  else addBookmarkCurrent();
  renderBookmarks();
  refreshBmAddBtn();
}
function gotoBookmark(v) {
  closeBookmarks();
  if (state.view === "epub" && epubRendition) epubRendition.display(v);
  else if (typeof v === "number") showPage(v);
}
function refreshBmAddBtn() {
  els.bookmarksAdd.textContent = isCurrentBookmarked() ? "Remove this page" : "+ Add this page";
}
function renderBookmarks() {
  const id = currentBookmarkId();
  const list = id ? ((readProgress(id) || {}).bookmarks || []) : [];
  els.bookmarksList.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "bookmark-empty";
    li.textContent = "No bookmarks yet.";
    els.bookmarksList.appendChild(li);
    return;
  }
  for (const b of list) {
    const li = document.createElement("li");
    li.className = "bookmark-row";
    const label = document.createElement("span");
    label.textContent = bookmarkLabel(b);
    const right = document.createElement("div");
    right.className = "right";
    const go = document.createElement("button");
    go.className = "bookmark-go";
    go.textContent = "Go";
    go.addEventListener("click", () => gotoBookmark(b.v));
    const rm = document.createElement("button");
    rm.className = "bookmark-remove";
    rm.textContent = "×";
    rm.addEventListener("click", () => { removeBookmark(b.v); renderBookmarks(); refreshBmAddBtn(); });
    right.append(go, rm);
    li.append(label, right);
    els.bookmarksList.appendChild(li);
  }
}
function openBookmarks() {
  if (!currentBookmarkId()) return;
  renderBookmarks();
  refreshBmAddBtn();
  els.bookmarks.classList.remove("hidden");
}
function closeBookmarks() { els.bookmarks.classList.add("hidden"); }

function toggleFinished() {
  if (!detailsItem) return;
  const prev = readProgress(detailsItem.id) || {};
  persistProgress(detailsItem.id, { ...prev, finished: !prev.finished, t: Date.now() });
  refreshFinishButton();
  renderLibrary(); // moves the item between Continue Reading / categories / Finished
  showToast(prev.finished ? "Marked as unfinished" : "Marked as finished");
}

// ---------- Series detail page ----------
let currentSeries = null;
function openSeries(name) {
  if (currentSeries === name && !els.seriesView.classList.contains("hidden")) return;
  const comics = catalog.categories.find((c) => c.name === "Comics");
  const shelf = comics && comics.shelves.find((s) => s.title === name);
  if (!shelf) return;
  currentSeries = name;
  els.seriesName.textContent = name;
  els.seriesGrid.innerHTML = "";
  els.seriesGrid.appendChild(shelfRow(sortItems(shelf.items)));
  els.library.classList.add("hidden");
  els.seriesView.classList.remove("hidden");
  if (!location.hash.startsWith("#series/")) location.hash = `series/${encodeURIComponent(name)}`;
}
function closeSeries() {
  if (els.seriesView.classList.contains("hidden")) return;
  els.seriesView.classList.add("hidden");
  els.library.classList.remove("hidden");
  currentSeries = null;
  if (location.hash.startsWith("#series/")) location.hash = "";
  renderLibrary(); // refresh progress bars
}

// Route an item to the right reader.
function openItem(item) {
  if (item.type === "comic") openBook(item);
  else if (item.type === "pdf") openPdf(item);
  else if (item.type === "epub") openEpub(item);
}

// ---------- Reader ----------
// startAt: "first" | "last" | null (null = resume saved progress).
async function openBook(vol, startAt = null) {
  state.book = vol;
  state.doc = null;
  state.src = { kind: "comic", id: vol.id };
  state.view = "comic";
  state.rtl = localStorage.getItem(`rtl:${vol.series}`) === "1";
  els.readerTitle.textContent = vol.title;
  els.readerOpen.classList.add("hidden");
  els.dirToggle.classList.remove("hidden");
  els.library.classList.add("hidden");
  els.epubView.classList.add("hidden");
  els.reader.classList.remove("hidden");
  applyFit();
  applyDir();
  applySpread();

  const res = await fetch(`/api/book/${vol.id}/info`);
  const info = await res.json();
  state.pageCount = info.pageCount;
  els.slider.max = Math.max(0, info.pageCount - 1);

  let start;
  if (startAt === "first") start = 0;
  else if (startAt === "last") start = info.pageCount - 1;
  else {
    const prog = readProgress(vol.id);
    start = prog && prog.index < info.pageCount ? prog.index : 0;
  }
  showPage(start);
  location.hash = `read/${vol.id}`;
}

// Close whichever reader is open and return to the library.
function leaveViewer() {
  flushReadingSession();
  if (epubRendition) { try { epubBook.destroy(); } catch {} epubRendition = null; epubBook = null; }
  els.reader.classList.add("hidden");
  els.epubView.classList.add("hidden");
  els.page.removeAttribute("src");
  els.epubArea.innerHTML = "";
  state.book = null;
  state.doc = null;
  state.src = null;
  state.view = "library";
  els.library.classList.remove("hidden");
  hideUi();
  location.hash = "";
  loadLibrary(); // refresh progress bars
}
const closeBook = leaveViewer; // back-compat alias

// URL of page i for the active source (comic CBZ or rendered PDF).
function pageUrl(i) {
  return state.src.kind === "pdf"
    ? `/api/doc/${state.src.id}/page/${i}`
    : `/api/book/${state.src.id}/page/${i}`;
}

function showPage(i) {
  if (i < 0 || i >= state.pageCount) return;
  if (state.index !== i) recordPageTurn(); // count the time we spent on the previous page
  state.index = i;
  pageStartTime = Date.now();
  currentReadId = currentReadingId();
  if (state.spread) {
    els.pageLeft.src = pageUrl(i);
    const hasRight = i + 1 < state.pageCount;
    els.pageRight.src = hasRight ? pageUrl(i + 1) : "";
    els.pageRight.style.visibility = hasRight ? "visible" : "hidden";
    els.slider.value = i;
    els.counter.textContent = hasRight ? `${i + 1}-${i + 2} / ${state.pageCount}` : `${i + 1} / ${state.pageCount}`;
    saveProgress();
    preload(i + 2); preload(i + 3);
    return;
  }
  els.spinner.classList.remove("hidden");
  els.page.onload = () => { els.spinner.classList.add("hidden"); resetView(); };
  els.page.onerror = () => els.spinner.classList.add("hidden");
  els.page.src = pageUrl(i);
  els.slider.value = i;
  els.counter.textContent = `${i + 1} / ${state.pageCount}`;
  saveProgress();
  preload(i + 1);
  preload(i + 2);
}

function preload(i) {
  if (i >= 0 && i < state.pageCount) new Image().src = pageUrl(i);
}

function next() {
  if (flipBusy) return;
  const step = state.spread ? 2 : 1;
  const target = state.index + step;
  if (state.index < state.pageCount - 1) {
    if (animatedTurn(true)) return;
    showPage(Math.min(target, state.pageCount - 1));
  } else if (state.book) openAdjacentVolume(1);
}
function prev() {
  if (flipBusy) return;
  const step = state.spread ? 2 : 1;
  const target = state.index - step;
  if (state.index > 0) {
    if (animatedTurn(false)) return;
    showPage(Math.max(target, 0));
  } else if (state.book) openAdjacentVolume(-1);
}

// Find the volume before/after the current one within the same series.
function neighborVolume(dir) {
  const comics = catalog.categories.find((c) => c.name === "Comics");
  const shelf = comics && comics.shelves.find((s) => s.title === state.book.series);
  if (!shelf) return null;
  const i = shelf.items.findIndex((v) => v.id === state.book.id);
  const j = i + dir;
  return i >= 0 && j >= 0 && j < shelf.items.length ? shelf.items[j] : null;
}
function openAdjacentVolume(dir) {
  const nv = neighborVolume(dir);
  if (!nv) { showToast(dir > 0 ? "Last volume in series" : "First volume in series"); return; }
  showToast(`${dir > 0 ? "Next" : "Previous"}: ${nv.title}`);
  openBook(nv, dir > 0 ? "first" : "last");
}

// ---------- PDF reader (paged, rendered images — same reader as comics) ----------
async function openPdf(item) {
  state.doc = item;
  state.book = null;
  state.src = { kind: "pdf", id: item.id };
  state.view = "comic"; // reuse the image reader (flip, zoom, progress)
  state.rtl = false;
  els.readerTitle.textContent = item.title;
  els.readerOpen.href = `/api/doc/${item.id}/file`;
  els.readerOpen.classList.remove("hidden");   // crisp native view, on demand
  els.dirToggle.classList.add("hidden");        // direction is meaningless for PDFs
  els.library.classList.add("hidden");
  els.epubView.classList.add("hidden");
  els.reader.classList.remove("hidden");
  applyFit();
  applyDir();
  applySpread();

  const info = await fetch(`/api/doc/${item.id}/info`).then((r) => r.json()).catch(() => ({}));
  state.pageCount = info.pageCount || 1;
  els.slider.max = Math.max(0, state.pageCount - 1);
  const prog = readProgress(item.id);
  const start = prog && prog.index < state.pageCount ? prog.index : 0;
  showPage(start);
  location.hash = `pdf/${item.id}`;
}

// ---------- EPUB reader (epub.js) ----------
let epubBook = null, epubRendition = null;
let epubFont = parseInt(localStorage.getItem("epubFont") || "100", 10);

async function openEpub(item) {
  state.doc = item;
  state.book = null;
  state.view = "epub";
  els.epubTitle.textContent = item.title;
  els.library.classList.add("hidden");
  els.reader.classList.add("hidden");
  els.epubView.classList.remove("hidden");
  els.epubArea.innerHTML = "";
  els.epubPct.textContent = "…";

  const prog = readProgress(item.id);
  // Load the archive as binary so epub.js opens it as a zip (its URL heuristic
  // expects a ".epub" suffix or a directory, which our API route isn't).
  const buf = await fetch(`/api/doc/${item.id}/file`).then((r) => r.arrayBuffer());
  if (state.view !== "epub" || state.doc !== item) return; // user navigated away
  epubBook = ePub(buf);
  epubRendition = epubBook.renderTo("epub-area", {
    width: "100%", height: "100%", flow: "paginated", spread: "auto", manager: "default",
  });
  epubRendition.themes.register("night", {
    body: { background: "#111418", color: "#e8eaed" },
    a: { color: "#5b9dff" },
  });
  epubRendition.themes.select("night");
  epubRendition.themes.fontSize(epubFont + "%");
  epubRendition.display(prog && prog.cfi ? prog.cfi : undefined);

  // Build a location index so we can show / seek by percentage.
  epubBook.ready
    .then(() => epubBook.locations.generate(1600))
    .then(() => { if (state.view === "epub") updateEpubProgress(epubRendition.currentLocation()); })
    .catch(() => {});

  epubRendition.on("relocated", (loc) => {
    recordPageTurn();
    pageStartTime = Date.now();
    currentReadId = currentReadingId();
    saveDocProgress(item.id, {
      cfi: loc.start.cfi,
      percent: epubBook.locations.length() ? epubBook.locations.percentageFromCfi(loc.start.cfi) : 0,
    });
    updateEpubProgress(loc);
  });
  location.hash = `epub/${item.id}`;
}

function updateEpubProgress(loc) {
  let percent = 0;
  try {
    if (loc && epubBook.locations.length()) percent = epubBook.locations.percentageFromCfi(loc.start.cfi);
  } catch {}
  els.epubPct.textContent = `${Math.round(percent * 100)}%`;
  els.epubSlider.value = Math.round(percent * 1000);
}
function setEpubFont(delta) {
  epubFont = Math.min(220, Math.max(70, epubFont + delta));
  localStorage.setItem("epubFont", String(epubFont));
  if (epubRendition) epubRendition.themes.fontSize(epubFont + "%");
}

// ---------- Fit mode ----------
function applyFit() {
  els.stage.classList.toggle("fit-height", state.fit === "height");
  els.stage.classList.toggle("fit-width", state.fit === "width");
  els.fitToggle.textContent = `Fit: ${state.fit === "height" ? "Height" : "Width"}`;
}
function toggleFit() {
  state.fit = state.fit === "height" ? "width" : "height";
  localStorage.setItem("fit", state.fit);
  applyFit();
  resetView();
}

// ---------- Two-page spread (desktop) ----------
function applySpread() {
  const wide = window.innerWidth >= 900;
  els.spreadToggle.classList.toggle("hidden", !(wide && state.view === "comic"));
  els.stage.classList.toggle("spread", state.spread);
  els.stage.classList.toggle("rtl", state.rtl);
}
function toggleSpread() {
  state.spread = !state.spread;
  localStorage.setItem("spread", state.spread ? "1" : "0");
  applySpread();
  if (state.src) showPage(state.index);
}

// ---------- Page theme (Day / Dim / Sepia) ----------
const PAGE_THEMES = [
  { id: "day",   label: "🌞", dim: 1.0, sep: 0,   toast: "Day" },
  { id: "dim",   label: "🌙", dim: 0.55, sep: 0,  toast: "Dim" },
  { id: "sepia", label: "📜", dim: 0.85, sep: 0.55, toast: "Sepia" },
];
let pageTheme = PAGE_THEMES.find((t) => t.id === localStorage.getItem("pageTheme")) || PAGE_THEMES[0];
function applyTheme() {
  document.documentElement.style.setProperty("--dim", pageTheme.dim);
  document.documentElement.style.setProperty("--sep", pageTheme.sep);
  els.themeToggle.textContent = pageTheme.label;
  els.themeToggle.title = `Theme: ${pageTheme.toast}`;
}
function cycleTheme() {
  const i = PAGE_THEMES.indexOf(pageTheme);
  pageTheme = PAGE_THEMES[(i + 1) % PAGE_THEMES.length];
  localStorage.setItem("pageTheme", pageTheme.id);
  applyTheme();
  showToast(`Theme: ${pageTheme.toast}`);
}
applyTheme(); // run once on load

// ---------- Reading direction (LTR / RTL manga) ----------
function applyDir() {
  els.dirToggle.textContent = state.rtl ? "R→L" : "L→R";
  els.slider.style.direction = state.rtl ? "rtl" : "ltr";
}
function toggleDir() {
  state.rtl = !state.rtl;
  if (state.book) localStorage.setItem(`rtl:${state.book.series}`, state.rtl ? "1" : "0");
  applyDir();
  showToast(state.rtl ? "Right-to-left (manga)" : "Left-to-right");
}

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 1600);
}

// ---------- UI overlay ----------
let uiTimer = null;
function showUi() {
  els.readerUi.classList.remove("hidden");
  clearTimeout(uiTimer);
  uiTimer = setTimeout(hideUi, 3500);
}
function hideUi() { els.readerUi.classList.add("hidden"); clearTimeout(uiTimer); }
function toggleUi() {
  if (els.readerUi.classList.contains("hidden")) showUi();
  else hideUi();
}

// ---------- Page-turn flip (3D, follows the finger) ----------
let gesture = null;       // null | "pan" | "flip" — decided on first real move
let flipSession = null;   // { target, leftPivot, width, p }
let flipBusy = false;     // an animated (tap/key) turn is in progress

// Programmatic page turn (tap zones, arrow keys) using the same flip animation.
function animatedTurn(forward) {
  if (flipBusy || state.view !== "comic" || view.scale > 1.01) return false;
  const dirSign = forward ? (state.rtl ? 1 : -1) : (state.rtl ? -1 : 1);
  if (!startFlip(dirSign)) return false;
  flipBusy = true;
  void els.flipLeaf.offsetWidth; // force a reflow so the 0° starting state is committed
  flipSession.p = 1;
  endFlip(); // synchronously kick off the completion animation
  return true;
}

// Begin a flip in response to a horizontal drag. dirSign: -1 left, +1 right.
function startFlip(dirSign) {
  if (!state.src || view.scale > 1.01) return false;
  const forward = dirSign < 0 ? !state.rtl : state.rtl; // left-drag advances in LTR
  const step = state.spread ? 2 : 1;
  const target = state.index + (forward ? step : -step);
  if (target < 0 || target >= state.pageCount) return false;

  // In spread mode the overlay covers only the lifting slot; in single mode it
  // covers the whole page.
  let slotEl, leafSrc, underSrc, leftPivot;
  if (state.spread) {
    // The "outer" slot (away from the spine) lifts. In LTR that's the right
    // slot for next, the left slot for prev. RTL flips which slot is outer.
    const liftRight = forward !== state.rtl;
    if (liftRight) {
      slotEl = els.pageRight;
      leafSrc = pageUrl(state.index + 1);
      underSrc = pageUrl(target); // the new left page will live where the leaf is now
      leftPivot = true;            // pivot the right slot around the spine on its left
    } else {
      slotEl = els.pageLeft;
      leafSrc = pageUrl(state.index);
      underSrc = pageUrl(target + 1); // the page that ends up under as right of new spread
      leftPivot = false;
    }
  } else {
    slotEl = els.page;
    leafSrc = els.page.currentSrc || els.page.src;
    underSrc = pageUrl(target);
    leftPivot = dirSign < 0;
  }
  const r = slotEl.getBoundingClientRect();
  if (r.width < 2) return false;
  for (const el of [els.flipUnder, els.flipLeaf]) {
    el.style.left = r.left + "px";
    el.style.top = r.top + "px";
    el.style.width = r.width + "px";
    el.style.height = r.height + "px";
  }
  els.flipUnder.src = underSrc;
  els.flipFront.src = leafSrc;
  els.flipLeaf.style.transformOrigin = leftPivot ? "0% 50%" : "100% 50%";
  els.flipLeaf.style.transition = "none";
  els.flipLeaf.style.transform = "rotateY(0deg)";
  els.flipShade.style.transition = "none";
  els.flipShade.style.opacity = "0";
  els.flip.classList.remove("hidden");
  flipSession = { target, leftPivot, width: r.width, p: 0 };
  return true;
}

function updateFlip(dx) {
  if (!flipSession) return;
  const p = Math.min(Math.max(Math.abs(dx) / flipSession.width, 0), 1);
  flipSession.p = p;
  const angle = (flipSession.leftPivot ? -1 : 1) * p * 180;
  els.flipLeaf.style.transform = `rotateY(${angle}deg)`;
  els.flipShade.style.opacity = String(p * 0.35);
}

function endFlip() {
  if (!flipSession) return;
  const s = flipSession;
  flipSession = null;
  const complete = s.p > 0.3;
  els.flipLeaf.style.transition = "transform 0.32s ease-out";
  els.flipShade.style.transition = "opacity 0.32s ease-out";
  els.flipLeaf.style.transform = `rotateY(${complete ? (s.leftPivot ? -180 : 180) : 0}deg)`;
  els.flipShade.style.opacity = complete ? "0.35" : "0";
  if (complete) {
    // The "under" image is already showing the target page, so we hide the
    // flip overlay strictly on the animation timeline — independent of how
    // quickly the new #page image loads underneath.
    showPage(s.target);
    setTimeout(hideFlip, 340);
  } else {
    setTimeout(hideFlip, 340);
  }
}

function hideFlip() {
  els.flip.classList.add("hidden");
  els.flipLeaf.style.transition = "none";
  els.flipLeaf.style.transform = "rotateY(0deg)";
  els.flipShade.style.opacity = "0";
  flipBusy = false;
}

// ---------- Events ----------
// Pointer / gesture handling: drag to flip/pan, pinch to zoom, tap to navigate,
// double-tap to toggle zoom. Pointer Events unify mouse and touch.
const pointers = new Map();
let pinchLast = null;     // { dist, x, y } at last 2-finger sample
let tapInfo = null;       // { x, y, t, moved } for the active single pointer
let pendingTap = null;    // deferred single-tap (so a double-tap can cancel it)
let lastTapT = 0, lastTapX = 0, lastTapY = 0;
const TAP_MOVE = 10, DOUBLE_MS = 280;

const pdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pmid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

els.stage.addEventListener("pointerdown", (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // Capturing keeps a drag responsive past the element edge, but is optional —
  // never let a capture failure abort gesture handling.
  try { els.stage.setPointerCapture(e.pointerId); } catch {}
  if (pointers.size === 1) {
    tapInfo = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 };
    gesture = null;
  } else if (pointers.size === 2) {
    if (gesture === "flip") { hideFlip(); flipSession = null; } // pinch cancels a flip
    gesture = null;
    const [a, b] = [...pointers.values()];
    pinchLast = { dist: pdist(a, b), ...pmid(a, b) };
    tapInfo = null;
    els.stage.classList.remove("panning");
  }
});

els.stage.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const cur = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, cur);
  const rect = els.stage.getBoundingClientRect();

  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = pdist(a, b), m = pmid(a, b);
    if (pinchLast && pinchLast.dist > 0) {
      zoomAt(d / pinchLast.dist, m.x - rect.left, m.y - rect.top);
      view.tx += m.x - pinchLast.x;
      view.ty += m.y - pinchLast.y;
      clampView();
      applyTransform();
    }
    pinchLast = { dist: d, x: m.x, y: m.y };
    return;
  }

  if (!tapInfo) return;
  const dx = cur.x - tapInfo.x, dy = cur.y - tapInfo.y;
  tapInfo.moved = Math.max(tapInfo.moved, Math.hypot(dx, dy));

  // Decide the gesture once the drag is clearly intentional.
  if (gesture === null && tapInfo.moved > 12) {
    if (view.scale <= 1.01 && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) {
      gesture = startFlip(Math.sign(dx)) ? "flip" : "pan"; // horizontal → page turn
    } else {
      gesture = "pan"; // vertical, or zoomed
    }
  }

  if (gesture === "flip") { updateFlip(cur.x - tapInfo.x); return; }

  if (canPan()) {
    view.tx += cur.x - prev.x;
    view.ty += cur.y - prev.y;
    clampView();
    applyTransform();
    if (tapInfo.moved > TAP_MOVE) els.stage.classList.add("panning");
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  els.stage.classList.remove("panning");
  if (pointers.size < 2) pinchLast = null;
  if (pointers.size === 0) {
    if (gesture === "flip") {
      endFlip();
    } else if (tapInfo && tapInfo.moved <= TAP_MOVE && Date.now() - tapInfo.t < 400) {
      handleTap(tapInfo.x, tapInfo.y);
    }
    tapInfo = null;
    gesture = null;
  }
}
els.stage.addEventListener("pointerup", endPointer);
els.stage.addEventListener("pointercancel", endPointer);

function handleTap(clientX, clientY) {
  const rect = els.stage.getBoundingClientRect();
  const frac = (clientX - rect.left) / els.stage.clientWidth;

  // At base zoom, edge taps flip pages instantly (no double-tap wait).
  // In RTL (manga) mode the left/right zones are swapped.
  if (view.scale <= 1.01 && (frac < 0.3 || frac > 0.7)) {
    lastTapT = 0;
    clearTimeout(pendingTap);
    pendingTap = null;
    const leftZone = frac < 0.3;
    if (leftZone === state.rtl) next();
    else prev();
    return;
  }

  // Center taps (and any tap while zoomed) defer so a double-tap can zoom.
  const now = Date.now();
  if (now - lastTapT < DOUBLE_MS && Math.hypot(clientX - lastTapX, clientY - lastTapY) < 40) {
    clearTimeout(pendingTap);
    pendingTap = null;
    lastTapT = 0;
    toggleZoomAt(clientX - rect.left, clientY - rect.top);
    return;
  }
  lastTapT = now;
  lastTapX = clientX;
  lastTapY = clientY;
  clearTimeout(pendingTap);
  pendingTap = setTimeout(() => {
    pendingTap = null;
    toggleUi();
  }, DOUBLE_MS);
}

els.stage.addEventListener("wheel", (e) => {
  if (!state.book) return;
  e.preventDefault();
  const rect = els.stage.getBoundingClientRect();
  zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });

els.back.addEventListener("click", leaveViewer);
els.fitToggle.addEventListener("click", toggleFit);
els.dirToggle.addEventListener("click", toggleDir);
els.themeToggle.addEventListener("click", cycleTheme);
els.spreadToggle.addEventListener("click", toggleSpread);
els.rescan.addEventListener("click", async () => {
  await authFetch("/api/rescan");
  loadLibrary();
});
els.slider.addEventListener("input", (e) => {
  showPage(parseInt(e.target.value, 10));
  showUi();
});

// Search + add
els.search.addEventListener("input", (e) => { searchText = e.target.value.trim().toLowerCase(); renderLibrary(); });
els.sortSelect.value = sortBy;
els.sortSelect.addEventListener("change", (e) => {
  sortBy = e.target.value;
  localStorage.setItem("sortBy", sortBy);
  renderLibrary();
  // also re-render series detail if open
  if (!els.seriesView.classList.contains("hidden") && currentSeries) {
    const name = currentSeries; currentSeries = null; openSeries(name);
  }
});
els.seriesBack.addEventListener("click", closeSeries);
els.addBtn.addEventListener("click", openWizard);
els.selectBtn.addEventListener("click", () => (selectionMode ? exitSelectMode() : enterSelectMode()));
els.bulkFinished.addEventListener("click", () => bulkSetFinished(true));
els.bulkUnfinished.addEventListener("click", () => bulkSetFinished(false));
els.bulkDelete.addEventListener("click", bulkDelete);
els.bulkCancel.addEventListener("click", exitSelectMode);
els.statsBtn.addEventListener("click", openStats);
els.statsClose.addEventListener("click", closeStats);
els.stats.addEventListener("click", (e) => { if (e.target === els.stats) closeStats(); });
els.settingsBtn.addEventListener("click", openSettings);
els.settingsClose.addEventListener("click", closeSettings);
els.settings.addEventListener("click", (e) => { if (e.target === els.settings) closeSettings(); });
els.catsAdd.addEventListener("click", () => addCatRow());
els.catsSave.addEventListener("click", saveCategories);
els.exportStatsCsv.addEventListener("click", exportStatsCsv);
els.exportStatsJson.addEventListener("click", exportStatsJson);
els.exportFinished.addEventListener("click", exportFinishedCsv);

// ---------- Add-content wizard ----------
let wizCat = null;
let wizFiles = [];

async function openWizard() {
  wizCat = null;
  wizFiles = [];
  els.wizardSeriesWrap.classList.add("hidden");
  els.wizardSeries.value = "";
  els.wizardList.innerHTML = "";
  els.wizardFiles.value = "";
  els.wizardFolder.value = "";
  els.wizardFiles.removeAttribute("accept");
  els.wizardDropText.textContent = "Tap to choose files, or drop files/folders here";
  els.wizardMsg.textContent = "";
  els.wizardProgress.classList.add("hidden");
  els.wizardBar.style.width = "0%";

  els.wizardCats.innerHTML = "";
  let docCats = [];
  try { docCats = await fetch("/api/categories").then((r) => r.json()); } catch {}
  const wizCats = [
    { label: "Comics", value: "comics", accept: ".cbz,.cbr,.jpg,.jpeg,.png,.gif,.webp,.bmp" },
    ...docCats.map((c) => ({ label: c.name, value: c.dir, accept: ".pdf,.epub" })),
  ];
  for (const c of wizCats) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = c.label;
    chip.addEventListener("click", () => selectWizCat(c, chip));
    els.wizardCats.appendChild(chip);
  }
  // existing comic series as suggestions
  els.seriesList.innerHTML = "";
  const comics = catalog.categories.find((c) => c.name === "Comics");
  if (comics) for (const s of comics.shelves) {
    if (!s.title) continue;
    const opt = document.createElement("option");
    opt.value = s.title;
    els.seriesList.appendChild(opt);
  }
  updateWizardUpload();
  els.wizard.classList.remove("hidden");
}

function selectWizCat(c, chip) {
  wizCat = c;
  [...els.wizardCats.children].forEach((x) => x.classList.toggle("active", x === chip));
  els.wizardSeriesWrap.classList.toggle("hidden", c.value !== "comics");
  els.wizardFiles.setAttribute("accept", c.accept);
  // Forget any previously selected files — new accept filter may not match them.
  wizFiles = [];
  els.wizardList.innerHTML = "";
  els.wizardFiles.value = "";
  els.wizardFolder.value = "";
  els.wizardDropText.textContent = "Tap to choose files, or drop files/folders here";
  updateWizardUpload();
}

// Keep only files matching the chosen category's accept extensions.
function filterByAccept(files) {
  if (!wizCat) return [...files];
  const exts = wizCat.accept.split(",").map((s) => s.trim().toLowerCase());
  return [...files].filter((f) => exts.some((ext) => f.name.toLowerCase().endsWith(ext)));
}

// Recursively walk a drag-and-drop directory entry, collecting all files.
// Records each file's relative path in _relpath (parallel to webkitRelativePath
// from a folder picker) so the server can recover folder structure.
async function readDropEntry(entry, out, prefix) {
  const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    file._relpath = rel;
    out.push(file);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      for (const sub of batch) await readDropEntry(sub, out, rel);
    } while (batch.length);
  }
}

function setWizFiles(list) {
  wizFiles = filterByAccept(list);
  const total = list.length || 0;
  els.wizardList.innerHTML = "";
  for (const f of wizFiles) {
    const row = document.createElement("div");
    row.className = "wizard-file";
    const n = document.createElement("span");
    n.textContent = f.name;
    const sz = document.createElement("span");
    sz.className = "sz";
    sz.textContent = `${(f.size / 1048576).toFixed(1)} MB`;
    row.append(n, sz);
    els.wizardList.appendChild(row);
  }
  const skippedNote = (total && total > wizFiles.length) ? ` (${total - wizFiles.length} skipped)` : "";
  els.wizardDropText.textContent = wizFiles.length
    ? `${wizFiles.length} file(s) selected${skippedNote}`
    : (total ? `0 of ${total} files match this category` : "Tap to choose files, or drop files/folders here");
  updateWizardUpload();
}

function updateWizardUpload() {
  els.wizardUpload.disabled = !(wizCat && wizFiles.length);
}
function closeWizard() { els.wizard.classList.add("hidden"); }

function uploadWizard() {
  if (!wizCat || !wizFiles.length) return;
  const fd = new FormData();
  fd.append("category", wizCat.value);
  if (wizCat.value === "comics") fd.append("series", els.wizardSeries.value.trim());
  const paths = wizFiles.map((f) => f._relpath || f.webkitRelativePath || f.name);
  fd.append("paths", JSON.stringify(paths));
  for (const f of wizFiles) fd.append("files", f);

  const send = (token) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    els.wizardProgress.classList.remove("hidden");
    els.wizardUpload.disabled = true;
    els.wizardMsg.textContent = "Uploading…";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) els.wizardBar.style.width = Math.round((e.loaded / e.total) * 100) + "%";
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        els.wizardMsg.textContent = "Added! Refreshing…";
        setTimeout(() => { closeWizard(); loadLibrary(); }, 700);
      } else if (xhr.status === 401) {
        const t = prompt("Reader access token:");
        if (t) { localStorage.setItem("readerToken", t); send(t); }
        else { els.wizardMsg.textContent = "Access token required."; els.wizardUpload.disabled = false; }
      } else {
        let msg = "Upload failed";
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
        els.wizardMsg.textContent = msg;
        els.wizardUpload.disabled = false;
      }
    };
    xhr.onerror = () => { els.wizardMsg.textContent = "Upload failed (network)"; els.wizardUpload.disabled = false; };
    xhr.send(fd);
  };
  send(getReaderToken());
}

els.wizardClose.addEventListener("click", closeWizard);
els.wizard.addEventListener("click", (e) => { if (e.target === els.wizard) closeWizard(); });
els.wizardFiles.addEventListener("change", (e) => setWizFiles(e.target.files));
els.wizardFolder.addEventListener("change", (e) => setWizFiles(e.target.files));
els.wizardFolderBtn.addEventListener("click", () => els.wizardFolder.click());

els.wizardDrop.addEventListener("dragover", (e) => { e.preventDefault(); els.wizardDrop.classList.add("dragover"); });
els.wizardDrop.addEventListener("dragleave", () => els.wizardDrop.classList.remove("dragover"));
els.wizardDrop.addEventListener("drop", async (e) => {
  e.preventDefault();
  els.wizardDrop.classList.remove("dragover");
  const items = e.dataTransfer.items;
  if (items && items.length && items[0].webkitGetAsEntry) {
    const collected = [];
    const entries = [...items].map((it) => it.webkitGetAsEntry()).filter(Boolean);
    try {
      await Promise.all(entries.map((en) => readDropEntry(en, collected)));
    } catch {}
    if (collected.length) { setWizFiles(collected); return; }
  }
  if (e.dataTransfer.files.length) setWizFiles(e.dataTransfer.files);
});
els.wizardUpload.addEventListener("click", uploadWizard);

// ---------- Auto-detect new files (poll while viewing the library) ----------
setInterval(async () => {
  if (els.library.classList.contains("hidden")) return;
  if (!els.wizard.classList.contains("hidden")) return; // don't disrupt an active upload
  try {
    const c = await fetch("/api/library").then((r) => r.json());
    const sig = catalogSig(c);
    if (sig !== lastSig) { catalog = c; lastSig = sig; renderFilterChips(); renderLibrary(); }
  } catch {}
}, 15000);

// Document reader controls
els.epubBack.addEventListener("click", leaveViewer);
els.epubPrev.addEventListener("click", () => epubRendition && epubRendition.prev());
els.epubNext.addEventListener("click", () => epubRendition && epubRendition.next());
els.epubFontUp.addEventListener("click", () => setEpubFont(10));
els.epubFontDn.addEventListener("click", () => setEpubFont(-10));
els.epubSlider.addEventListener("change", (e) => {
  if (!epubRendition || !epubBook.locations.length()) return;
  epubRendition.display(epubBook.locations.cfiFromPercentage(parseInt(e.target.value, 10) / 1000));
});

// Details modal
els.detailsClose.addEventListener("click", closeDetails);
els.details.addEventListener("click", (e) => { if (e.target === els.details) closeDetails(); });
els.detailsRead.addEventListener("click", () => { const it = detailsItem; closeDetails(); if (it) openItem(it); });
els.detailsFinish.addEventListener("click", toggleFinished);

// Bookmarks
els.bmToggle.addEventListener("click", openBookmarks);
els.bmToggleEpub.addEventListener("click", openBookmarks);
els.bookmarksClose.addEventListener("click", closeBookmarks);
els.bookmarks.addEventListener("click", (e) => { if (e.target === els.bookmarks) closeBookmarks(); });
els.bookmarksAdd.addEventListener("click", toggleBookmarkCurrent);

document.addEventListener("keydown", (e) => {
  if (!els.wizard.classList.contains("hidden")) {
    if (e.key === "Escape") closeWizard();
    return;
  }
  if (!els.bookmarks.classList.contains("hidden")) {
    if (e.key === "Escape") closeBookmarks();
    return;
  }
  if (!els.stats.classList.contains("hidden")) {
    if (e.key === "Escape") closeStats();
    return;
  }
  if (!els.settings.classList.contains("hidden")) {
    if (e.key === "Escape") closeSettings();
    return;
  }
  if (!els.details.classList.contains("hidden")) {
    if (e.key === "Escape") closeDetails();
    return;
  }
  if (!els.seriesView.classList.contains("hidden")) {
    if (e.key === "Escape") closeSeries();
    return;
  }
  if (state.view === "epub") {
    if (e.key === "ArrowLeft") epubRendition && epubRendition.prev();
    else if (e.key === "ArrowRight") epubRendition && epubRendition.next();
    else if (e.key === "Escape") leaveViewer();
    return;
  }
  if (!state.src) return;
  if (e.key === " " || e.key === "ArrowDown") { next(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { prev(); e.preventDefault(); }
  else if (e.key === "ArrowRight") { state.rtl ? prev() : next(); e.preventDefault(); }
  else if (e.key === "ArrowLeft") { state.rtl ? next() : prev(); e.preventDefault(); }
  else if (e.key === "Escape") closeBook();
  else if (e.key === "f") toggleFit();
  else if (e.key === "d" && state.book) toggleDir();
  else if (e.key === "+" || e.key === "=") zoomAt(1.25, els.stage.clientWidth / 2, els.stage.clientHeight / 2);
  else if (e.key === "-" || e.key === "_") zoomAt(1 / 1.25, els.stage.clientWidth / 2, els.stage.clientHeight / 2);
  else if (e.key === "0") resetView();
});

window.addEventListener("resize", () => {
  applySpread();
  if (state.src && !state.spread) resetView();
});

window.addEventListener("hashchange", () => {
  if (location.hash.startsWith("#series/")) {
    openSeries(decodeURIComponent(location.hash.slice("#series/".length)));
    return;
  }
  if (!els.seriesView.classList.contains("hidden")) { closeSeries(); return; }
  const inViewer = /^#(read|pdf|epub)\//.test(location.hash);
  if (!inViewer && state.view !== "library") leaveViewer();
});

// Register the service worker (only activates in a secure context: https/localhost).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

// Pull synced progress first, then render the library with it.
syncProgress().finally(loadLibrary);
