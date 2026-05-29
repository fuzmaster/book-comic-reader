const els = {
  library: document.getElementById("library"),
  shelves: document.getElementById("shelves"),
  rescan: document.getElementById("rescan"),
  reader: document.getElementById("reader"),
  stage: document.getElementById("stage"),
  page: document.getElementById("page"),
  readerUi: document.getElementById("reader-ui"),
  readerTitle: document.getElementById("reader-title"),
  back: document.getElementById("back"),
  fitToggle: document.getElementById("fit-toggle"),
  dirToggle: document.getElementById("dir-toggle"),
  slider: document.getElementById("slider"),
  counter: document.getElementById("counter"),
  spinner: document.getElementById("spinner"),
  toast: document.getElementById("toast"),
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
};

const state = {
  view: "library",   // library | comic | pdf | epub
  book: null,        // current comic { id, title, series }
  doc: null,         // current document { id, title, type }
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

// ---------- Progress persistence ----------
function progressKey(id) { return `progress:${id}`; }
function saveProgress() {
  if (!state.book) return;
  localStorage.setItem(progressKey(state.book.id), JSON.stringify({
    index: state.index, pageCount: state.pageCount, t: Date.now(),
  }));
}
function readProgress(id) {
  try { return JSON.parse(localStorage.getItem(progressKey(id))); }
  catch { return null; }
}
// Save document progress, merging with any existing fields.
function saveDocProgress(id, extra) {
  const prev = readProgress(id) || {};
  localStorage.setItem(progressKey(id), JSON.stringify({ ...prev, ...extra, t: Date.now() }));
}

// ---------- Library ----------
async function loadLibrary() {
  const res = await fetch("/api/library");
  catalog = await res.json();
  renderLibrary();
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
  if (item.type === "comic") {
    if (!p.pageCount || p.pageCount < 2) return null;
    return p.index / (p.pageCount - 1);
  }
  if (item.type === "epub") return typeof p.percent === "number" ? p.percent : null;
  return null; // pdf: no reliable page progress
}

// Recently-opened / in-progress items, most recent first.
function continueReading() {
  const rows = [];
  for (const it of allItems()) {
    const p = readProgress(it.id);
    if (!p || !p.t) continue;
    if (it.type === "comic") {
      if (p.index <= 0) continue;                       // not really started
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
      '<div class="empty">Nothing here yet.<br>Add files to the <b>files/</b> folder' +
      ' (and run <b>npm run convert</b> for comics), then tap Rescan.</div>';
    return;
  }

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

  for (const cat of catalog.categories) {
    const sec = document.createElement("section");
    sec.className = "category";
    const h = document.createElement("h2");
    h.className = "category-title";
    h.textContent = cat.name;
    sec.appendChild(h);
    for (const shelf of cat.shelves) {
      if (shelf.title) {
        const sub = document.createElement("h3");
        sub.style.cssText = "font-size:15px;margin:14px 4px 10px;color:var(--muted);";
        sub.textContent = shelf.title;
        sec.appendChild(sub);
      }
      sec.appendChild(shelfRow(shelf.items));
    }
    els.shelves.appendChild(sec);
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
    coverEl.className = `cover doc ${item.type}`;
    const name = document.createElement("div");
    name.className = "doc-name";
    name.textContent = item.title;
    const badge = document.createElement("div");
    badge.className = "doc-badge";
    badge.textContent = item.type.toUpperCase();
    coverEl.appendChild(badge);
    coverEl.appendChild(name);
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

  card.addEventListener("click", () => openItem(item));
  return card;
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
  state.view = "comic";
  state.rtl = localStorage.getItem(`rtl:${vol.series}`) === "1";
  els.readerTitle.textContent = vol.title;
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
  state.view = "library";
  els.library.classList.remove("hidden");
  hideUi();
  location.hash = "";
  loadLibrary(); // refresh progress bars
}
const closeBook = leaveViewer; // back-compat alias

function showPage(i) {
  if (i < 0 || i >= state.pageCount) return;
  state.index = i;
  els.spinner.classList.remove("hidden");
  els.page.onload = () => {
    els.spinner.classList.add("hidden");
    resetView();
  };
  els.page.onerror = () => els.spinner.classList.add("hidden");
  els.page.src = `/api/book/${state.book.id}/page/${i}`;

  els.slider.value = i;
  els.counter.textContent = `${i + 1} / ${state.pageCount}`;
  saveProgress();
  preload(i + 1);
  preload(i + 2);
}

function preload(i) {
  if (i >= 0 && i < state.pageCount) {
    new Image().src = `/api/book/${state.book.id}/page/${i}`;
  }
}

function next() {
  if (state.index < state.pageCount - 1) showPage(state.index + 1);
  else openAdjacentVolume(1);
}
function prev() {
  if (state.index > 0) showPage(state.index - 1);
  else openAdjacentVolume(-1);
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

// ---------- PDF reader (native browser rendering) ----------
function openPdf(item) {
  state.doc = item;
  state.book = null;
  state.view = "pdf";
  const url = `/api/doc/${item.id}/file`;
  els.pdfTitle.textContent = item.title;
  els.pdfOpen.href = url;
  els.pdfFrame.src = url;
  els.library.classList.add("hidden");
  els.reader.classList.add("hidden");
  els.epubView.classList.add("hidden");
  els.pdfView.classList.remove("hidden");
  saveDocProgress(item.id, {});           // record "recently opened"
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

// ---------- Events ----------
// Pointer / gesture handling: drag to pan, pinch to zoom, tap to navigate,
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
  } else if (pointers.size === 2) {
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

  if (tapInfo) {
    tapInfo.moved = Math.max(tapInfo.moved, Math.hypot(cur.x - tapInfo.x, cur.y - tapInfo.y));
  }
  if (canPan()) {
    view.tx += cur.x - prev.x;
    view.ty += cur.y - prev.y;
    clampView();
    applyTransform();
    if (tapInfo && tapInfo.moved > TAP_MOVE) els.stage.classList.add("panning");
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  els.stage.classList.remove("panning");
  if (pointers.size < 2) pinchLast = null;
  if (pointers.size === 0 && tapInfo) {
    if (tapInfo.moved <= TAP_MOVE && Date.now() - tapInfo.t < 400) {
      handleTap(tapInfo.x, tapInfo.y);
    }
    tapInfo = null;
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

document.addEventListener("keydown", (e) => {
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
  if (!state.book) return;
  if (e.key === " " || e.key === "ArrowDown") { next(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { prev(); e.preventDefault(); }
  else if (e.key === "ArrowRight") { state.rtl ? prev() : next(); e.preventDefault(); }
  else if (e.key === "ArrowLeft") { state.rtl ? next() : prev(); e.preventDefault(); }
  else if (e.key === "Escape") closeBook();
  else if (e.key === "f") toggleFit();
  else if (e.key === "d") toggleDir();
  else if (e.key === "+" || e.key === "=") zoomAt(1.25, els.stage.clientWidth / 2, els.stage.clientHeight / 2);
  else if (e.key === "-" || e.key === "_") zoomAt(1 / 1.25, els.stage.clientWidth / 2, els.stage.clientHeight / 2);
  else if (e.key === "0") resetView();
});

window.addEventListener("resize", () => { if (state.book) resetView(); });

window.addEventListener("hashchange", () => {
  const inViewer = /^#(read|pdf|epub)\//.test(location.hash);
  if (!inViewer && state.view !== "library") leaveViewer();
});

// Register the service worker (only activates in a secure context: https/localhost).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

loadLibrary();
