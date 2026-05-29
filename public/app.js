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
};

const state = {
  book: null,        // { id, title, series }
  pageCount: 0,
  index: 0,
  rtl: false,        // right-to-left (manga) reading direction
  // Default: fit-width on portrait/phone screens, fit-height on wide desktop.
  fit: localStorage.getItem("fit") || (window.innerHeight > window.innerWidth ? "width" : "height"),
};
let catalog = [];    // full library, kept for Continue Reading + next-volume

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

// ---------- Library ----------
async function loadLibrary() {
  const res = await fetch("/api/library");
  catalog = await res.json();
  renderLibrary();
}

// In-progress volumes (not finished), most recently read first.
function continueReading() {
  const items = [];
  for (const shelf of catalog) {
    for (const vol of shelf.volumes) {
      const p = readProgress(vol.id);
      if (!p || !p.t || p.index <= 0) continue;
      if (p.pageCount && p.index >= p.pageCount - 1) continue; // finished
      items.push({ vol, t: p.t });
    }
  }
  items.sort((a, b) => b.t - a.t);
  return items.slice(0, 12).map((i) => i.vol);
}

function shelfSection(title, volumes) {
  const section = document.createElement("section");
  section.className = "shelf";
  const h2 = document.createElement("h2");
  h2.textContent = title;
  section.appendChild(h2);
  const row = document.createElement("div");
  row.className = "row";
  for (const vol of volumes) row.appendChild(makeCard(vol));
  section.appendChild(row);
  return section;
}

function renderLibrary() {
  els.shelves.innerHTML = "";
  if (!catalog.length) {
    els.shelves.innerHTML =
      '<div class="empty">No comics found.<br>Run <b>npm run convert</b> to build your library, then tap Rescan.</div>';
    return;
  }
  const cont = continueReading();
  if (cont.length) els.shelves.appendChild(shelfSection("Continue Reading", cont));
  for (const shelf of catalog) {
    els.shelves.appendChild(shelfSection(shelf.series, shelf.volumes));
  }
}

function makeCard(vol) {
  const card = document.createElement("div");
  card.className = "card";

  const cover = document.createElement("img");
  cover.className = "cover";
  cover.loading = "lazy";
  cover.src = `/api/book/${vol.id}/cover`;
  card.appendChild(cover);

  const prog = readProgress(vol.id);
  if (prog && prog.pageCount > 1) {
    const bar = document.createElement("div");
    bar.className = "progress-bar";
    bar.style.width = `${Math.round((prog.index / (prog.pageCount - 1)) * 100)}%`;
    cover.parentElement.appendChild(bar);
  }

  const label = document.createElement("div");
  label.className = "card-label";
  label.textContent = vol.title;
  card.appendChild(label);

  card.addEventListener("click", () => openBook(vol));
  return card;
}

// ---------- Reader ----------
// startAt: "first" | "last" | null (null = resume saved progress).
async function openBook(vol, startAt = null) {
  state.book = vol;
  state.rtl = localStorage.getItem(`rtl:${vol.series}`) === "1";
  els.readerTitle.textContent = vol.title;
  els.library.classList.add("hidden");
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

function closeBook() {
  state.book = null;
  els.reader.classList.add("hidden");
  els.library.classList.remove("hidden");
  els.page.removeAttribute("src");
  hideUi();
  location.hash = "";
  loadLibrary(); // refresh progress bars
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
  const shelf = catalog.find((s) => s.series === state.book.series);
  if (!shelf) return null;
  const i = shelf.volumes.findIndex((v) => v.id === state.book.id);
  const j = i + dir;
  return i >= 0 && j >= 0 && j < shelf.volumes.length ? shelf.volumes[j] : null;
}
function openAdjacentVolume(dir) {
  const nv = neighborVolume(dir);
  if (!nv) { showToast(dir > 0 ? "Last volume in series" : "First volume in series"); return; }
  showToast(`${dir > 0 ? "Next" : "Previous"}: ${nv.title}`);
  openBook(nv, dir > 0 ? "first" : "last");
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

els.back.addEventListener("click", closeBook);
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

document.addEventListener("keydown", (e) => {
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
  if (!location.hash.startsWith("#read/") && state.book) closeBook();
});

// Register the service worker (only activates in a secure context: https/localhost).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

loadLibrary();
