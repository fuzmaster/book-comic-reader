const els = {
  library: document.getElementById("library"),
  shelves: document.getElementById("shelves"),
  rescan: document.getElementById("rescan"),
  search: document.getElementById("search"),
  filterChips: document.getElementById("filter-chips"),
  addBtn: document.getElementById("add-btn"),
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
  pdfView: document.getElementById("pdf-view"),
  pdfFrame: document.getElementById("pdf-frame"),
  pdfTitle: document.getElementById("pdf-title"),
  pdfOpen: document.getElementById("pdf-open"),
  pdfBack: document.getElementById("pdf-back"),
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
};

const state = {
  view: "library",   // library | comic | pdf | epub
  book: null,        // current comic { id, title, series }
  doc: null,         // current document { id, title, type }
  src: null,         // active paged source: { kind: "comic"|"pdf", id }
  pageCount: 0,
  index: 0,
  rtl: false,        // right-to-left (manga) reading direction
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
  fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, data: rec }),
  }).catch(() => {});
}

function saveProgress() {
  if (!state.src) return;
  persistProgress(state.src.id, { index: state.index, pageCount: state.pageCount, t: Date.now() });
}
function saveDocProgress(id, extra) {
  const prev = readProgress(id) || {};
  persistProgress(id, { ...prev, ...extra, t: Date.now() });
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
      fetch("/api/progress", {
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
let lastSig = "";          // catalog signature for live-refresh

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
    if (it.type === "comic" || it.type === "pdf") {
      if (!(p.index > 0)) continue;                     // not really started
      if (p.pageCount && p.index >= p.pageCount - 1) continue; // finished
    }
    if (it.type === "epub" && p.percent >= 0.99) continue;     // finished
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
      .map((s) => ({ title: s.title, items: s.items.filter(matchesSearch) }))
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
        sub.textContent = shelf.title;
        sec.appendChild(sub);
      }
      sec.appendChild(shelfRow(shelf.items));
      shown += shelf.items.length;
    }
    els.shelves.appendChild(sec);
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

  card.addEventListener("click", () => openItem(item));
  return card;
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
  els.pdfView.classList.add("hidden");
  els.epubView.classList.add("hidden");
  els.reader.classList.remove("hidden");
  applyFit();
  applyDir();

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
  if (epubRendition) { try { epubBook.destroy(); } catch {} epubRendition = null; epubBook = null; }
  els.reader.classList.add("hidden");
  els.pdfView.classList.add("hidden");
  els.epubView.classList.add("hidden");
  els.page.removeAttribute("src");
  els.pdfFrame.src = "about:blank";
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
  state.index = i;
  els.spinner.classList.remove("hidden");
  els.page.onload = () => {
    els.spinner.classList.add("hidden");
    resetView();
  };
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
  if (state.index < state.pageCount - 1) {
    if (animatedTurn(true)) return;       // animate when possible
    showPage(state.index + 1);
  } else if (state.book) openAdjacentVolume(1); // auto-next only applies to comic series
}
function prev() {
  if (flipBusy) return;
  if (state.index > 0) {
    if (animatedTurn(false)) return;
    showPage(state.index - 1);
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
  els.pdfView.classList.add("hidden");
  els.epubView.classList.add("hidden");
  els.reader.classList.remove("hidden");
  applyFit();
  applyDir();

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
  els.pdfView.classList.add("hidden");
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
  void els.flipLeaf.offsetWidth; // commit the 0° starting state before animating
  requestAnimationFrame(() => { if (flipSession) { flipSession.p = 1; endFlip(); } });
  return true;
}

// Begin a flip in response to a horizontal drag. dirSign: -1 left, +1 right.
function startFlip(dirSign) {
  if (!state.src || view.scale > 1.01) return false;
  const forward = dirSign < 0 ? !state.rtl : state.rtl; // left-drag advances in LTR
  const target = state.index + (forward ? 1 : -1);
  if (target < 0 || target >= state.pageCount) return false; // no page to turn to
  const r = els.page.getBoundingClientRect();
  if (r.width < 2) return false;
  const leftPivot = dirSign < 0;
  for (const el of [els.flipUnder, els.flipLeaf]) {
    el.style.left = r.left + "px";
    el.style.top = r.top + "px";
    el.style.width = r.width + "px";
    el.style.height = r.height + "px";
  }
  els.flipUnder.src = pageUrl(target);
  els.flipFront.src = els.page.currentSrc || els.page.src;
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
els.rescan.addEventListener("click", async () => {
  await fetch("/api/rescan");
  loadLibrary();
});
els.slider.addEventListener("input", (e) => {
  showPage(parseInt(e.target.value, 10));
  showUi();
});

// Search + add
els.search.addEventListener("input", (e) => { searchText = e.target.value.trim().toLowerCase(); renderLibrary(); });
els.addBtn.addEventListener("click", openWizard);

// ---------- Add-content wizard ----------
const WIZ_CATS = [
  { label: "Comics", value: "comics", accept: ".cbz,.cbr" },
  { label: "Books", value: "books", accept: ".pdf,.epub" },
  { label: "Learning", value: "learning", accept: ".pdf,.epub" },
];
let wizCat = null;
let wizFiles = [];

function openWizard() {
  wizCat = null;
  wizFiles = [];
  els.wizardSeriesWrap.classList.add("hidden");
  els.wizardSeries.value = "";
  els.wizardList.innerHTML = "";
  els.wizardFiles.value = "";
  els.wizardFiles.removeAttribute("accept");
  els.wizardDropText.textContent = "Tap to choose files, or drop them here";
  els.wizardMsg.textContent = "";
  els.wizardProgress.classList.add("hidden");
  els.wizardBar.style.width = "0%";

  els.wizardCats.innerHTML = "";
  for (const c of WIZ_CATS) {
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
  updateWizardUpload();
}

function setWizFiles(list) {
  wizFiles = [...list];
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
  els.wizardDropText.textContent = wizFiles.length
    ? `${wizFiles.length} file(s) selected`
    : "Tap to choose files, or drop them here";
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
  for (const f of wizFiles) fd.append("files", f);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/upload");
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
    } else {
      let msg = "Upload failed";
      try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
      els.wizardMsg.textContent = msg;
      els.wizardUpload.disabled = false;
    }
  };
  xhr.onerror = () => { els.wizardMsg.textContent = "Upload failed (network)"; els.wizardUpload.disabled = false; };
  xhr.send(fd);
}

els.wizardClose.addEventListener("click", closeWizard);
els.wizard.addEventListener("click", (e) => { if (e.target === els.wizard) closeWizard(); });
els.wizardFiles.addEventListener("change", (e) => setWizFiles(e.target.files));
els.wizardDrop.addEventListener("dragover", (e) => { e.preventDefault(); els.wizardDrop.classList.add("dragover"); });
els.wizardDrop.addEventListener("dragleave", () => els.wizardDrop.classList.remove("dragover"));
els.wizardDrop.addEventListener("drop", (e) => {
  e.preventDefault();
  els.wizardDrop.classList.remove("dragover");
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
els.pdfBack.addEventListener("click", leaveViewer);
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

document.addEventListener("keydown", (e) => {
  if (!els.wizard.classList.contains("hidden")) {
    if (e.key === "Escape") closeWizard();
    return;
  }
  if (!els.details.classList.contains("hidden")) {
    if (e.key === "Escape") closeDetails();
    return;
  }
  if (state.view === "epub") {
    if (e.key === "ArrowLeft") epubRendition && epubRendition.prev();
    else if (e.key === "ArrowRight") epubRendition && epubRendition.next();
    else if (e.key === "Escape") leaveViewer();
    return;
  }
  if (state.view === "pdf") {
    if (e.key === "Escape") leaveViewer();
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

window.addEventListener("resize", () => { if (state.src) resetView(); });

window.addEventListener("hashchange", () => {
  const inViewer = /^#(read|pdf|epub)\//.test(location.hash);
  if (!inViewer && state.view !== "library") leaveViewer();
});

// Register the service worker (only activates in a secure context: https/localhost).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

// Pull synced progress first, then render the library with it.
syncProgress().finally(loadLibrary);
