import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import express from "express";
import yauzl from "yauzl";
import sharp from "sharp";
import { pdf } from "pdf-to-img";
import multer from "multer";
import archiver from "archiver";
import { createExtractorFromData } from "node-unrar-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIBRARY = path.join(__dirname, "library");          // converted comics (CBZ)
const FILES = path.join(__dirname, "files");              // source library root
const THUMB_DIR = path.join(__dirname, ".cache", "thumbs");
const META_DIR = path.join(__dirname, ".cache", "meta");
const PDFPAGE_DIR = path.join(__dirname, ".cache", "pdfpages");
const UPLOAD_TMP = path.join(__dirname, ".cache", "uploads");
const PROGRESS_FILE = path.join(__dirname, ".cache", "progress.json");
const STATS_FILE = path.join(__dirname, ".cache", "stats.json");
const PDF_SCALE = 2.2; // render resolution for PDF pages
const ICON_DIR = path.join(__dirname, "public", "icons");
const PORT = process.env.PORT || 4288;
const THUMB_WIDTH = 360;

// Document categories read in place (not converted). Folder -> display name.
const DOC_CATEGORIES = [
  { dir: "books", name: "Books" },
  { dir: "learning", name: "Learning" },
];
const DOC_TYPE = { ".pdf": "pdf", ".epub": "epub" };

const IMG_RE = /\.(jpe?g|png|gif|webp|bmp)$/i;
const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// Open the default browser at `url` (set NO_OPEN=1 to disable).
function openBrowser(url) {
  if (process.env.NO_OPEN === "1") return;
  const cmd =
    process.platform === "win32" ? `start "" "${url}"` :
    process.platform === "darwin" ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, () => {});
}

// Cache of book id -> { file, entries: [sorted image entry names] }.
const books = new Map();

// List sorted image entry names inside a cbz (cached).
function listEntries(book) {
  if (book.entries) return Promise.resolve(book.entries);
  return new Promise((resolve, reject) => {
    yauzl.open(book.file, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const names = [];
      zip.on("entry", (entry) => {
        if (!/\/$/.test(entry.fileName) && IMG_RE.test(entry.fileName)) names.push(entry.fileName);
        zip.readEntry();
      });
      zip.on("end", () => {
        names.sort(naturalCompare);
        book.entries = names;
        resolve(names);
      });
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

// Stream a single image entry from a cbz to the response.
function streamEntry(book, entryName, res) {
  yauzl.open(book.file, { lazyEntries: true }, (err, zip) => {
    if (err) return res.status(500).end();
    let found = false;
    zip.on("entry", (entry) => {
      if (entry.fileName === entryName) {
        found = true;
        zip.openReadStream(entry, (e2, stream) => {
          if (e2) return res.status(500).end();
          res.setHeader("Content-Type", MIME[path.extname(entryName).toLowerCase()] || "application/octet-stream");
          res.setHeader("Cache-Control", "public, max-age=86400");
          stream.pipe(res);
        });
      } else {
        zip.readEntry();
      }
    });
    zip.on("end", () => {
      if (!found) res.status(404).end();
    });
    zip.on("error", () => res.status(500).end());
    zip.readEntry();
  });
}

// Read a single image entry from a cbz fully into a Buffer.
function readEntryBuffer(book, entryName) {
  return new Promise((resolve, reject) => {
    yauzl.open(book.file, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      let found = false;
      zip.on("entry", (entry) => {
        if (entry.fileName === entryName) {
          found = true;
          zip.openReadStream(entry, (e2, stream) => {
            if (e2) return reject(e2);
            const chunks = [];
            stream.on("data", (c) => chunks.push(c));
            stream.on("end", () => resolve(Buffer.concat(chunks)));
            stream.on("error", reject);
          });
        } else {
          zip.readEntry();
        }
      });
      zip.on("end", () => { if (!found) reject(new Error("entry not found")); });
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

// Generate (and cache to disk) a downscaled JPEG cover for a book.
async function getCover(id, book) {
  const thumb = path.join(THUMB_DIR, `${id}.jpg`);
  if (fs.existsSync(thumb)) return thumb;
  const entries = await listEntries(book);
  if (entries.length === 0) throw new Error("empty book");
  const raw = await readEntryBuffer(book, entries[0]);
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  await sharp(raw).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).jpeg({ quality: 72 }).toFile(thumb);
  return thumb;
}

// Read one named entry from any zip file into a Buffer (null if missing).
function readZipEntry(file, name) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      let found = false;
      zip.on("entry", (entry) => {
        if (entry.fileName === name) {
          found = true;
          zip.openReadStream(entry, (e2, stream) => {
            if (e2) return reject(e2);
            const chunks = [];
            stream.on("data", (c) => chunks.push(c));
            stream.on("end", () => resolve(Buffer.concat(chunks)));
            stream.on("error", reject);
          });
        } else zip.readEntry();
      });
      zip.on("end", () => { if (!found) resolve(null); });
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

// Find the cover image path inside an EPUB by reading its OPF manifest.
async function epubCoverPath(file) {
  const container = (await readZipEntry(file, "META-INF/container.xml"))?.toString("utf8");
  if (!container) return null;
  const opfPath = container.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) return null;
  const opf = (await readZipEntry(file, opfPath))?.toString("utf8");
  if (!opf) return null;
  const opfDir = path.posix.dirname(opfPath);
  const resolve = (href) => {
    const p = decodeURIComponent(href);
    return opfDir === "." ? p : path.posix.join(opfDir, p);
  };
  const itemHref = (id) =>
    opf.match(new RegExp(`<item[^>]*\\bid="${id}"[^>]*\\bhref="([^"]+)"`))?.[1] ||
    opf.match(new RegExp(`<item[^>]*\\bhref="([^"]+)"[^>]*\\bid="${id}"`))?.[1];

  // 1) EPUB3 manifest item flagged as the cover image.
  let href = opf.match(/<item[^>]*\bproperties="[^"]*cover-image[^"]*"[^>]*\bhref="([^"]+)"/)?.[1] ||
             opf.match(/<item[^>]*\bhref="([^"]+)"[^>]*\bproperties="[^"]*cover-image[^"]*"/)?.[1];
  // 2) EPUB2 <meta name="cover" content="ID">.
  if (!href) {
    const coverId = opf.match(/<meta[^>]*\bname="cover"[^>]*\bcontent="([^"]+)"/)?.[1] ||
                    opf.match(/<meta[^>]*\bcontent="([^"]+)"[^>]*\bname="cover"/)?.[1];
    if (coverId) href = itemHref(coverId);
  }
  // 3) Any image whose href looks like a cover.
  if (!href) href = opf.match(/<item[^>]*\bhref="([^"]*cover[^"]*\.(?:jpe?g|png))"/i)?.[1];
  return href ? resolve(href) : null;
}

// Opened PDF documents (pdf.js), cached in memory so we don't re-parse per page.
const pdfDocs = new Map();
function getPdfDoc(id, file) {
  if (!pdfDocs.has(id)) pdfDocs.set(id, pdf(file, { scale: PDF_SCALE }));
  return pdfDocs.get(id);
}

// Cap the rendered-PDF page cache on disk; prune oldest when over the limit.
const PDF_CACHE_CAP = 500 * 1024 * 1024; // 500 MB
async function cleanupPdfCache() {
  if (!fs.existsSync(PDFPAGE_DIR)) return;
  const files = [];
  async function walk(dir) {
    let entries; try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else { try { const st = await fsp.stat(p); files.push({ p, size: st.size, t: st.mtimeMs }); } catch {} }
    }
  }
  await walk(PDFPAGE_DIR);
  let total = files.reduce((s, f) => s + f.size, 0);
  if (total <= PDF_CACHE_CAP) return;
  files.sort((a, b) => a.t - b.t); // oldest first
  const target = PDF_CACHE_CAP * 0.9; // leave headroom so we don't run every minute
  for (const f of files) {
    if (total <= target) break;
    try { await fsp.unlink(f.p); total -= f.size; } catch {}
  }
}
cleanupPdfCache().catch(() => {});
setInterval(() => cleanupPdfCache().catch(() => {}), 6 * 60 * 60 * 1000);

// Render (and cache to disk) one PDF page as a JPEG. n is 0-based.
async function getPdfPage(id, file, n) {
  const out = path.join(PDFPAGE_DIR, id, `${n}.jpg`);
  if (fs.existsSync(out)) return out;
  const document = await getPdfDoc(id, file);
  if (n < 0 || n >= document.length) throw new Error("page out of range");
  const png = await document.getPage(n + 1); // pdf-to-img is 1-based
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(png).jpeg({ quality: 80 }).toFile(out);
  return out;
}

// Generate (and cache) a cover thumbnail for a PDF (page 1) or EPUB (embedded).
async function getDocCover(id, doc) {
  const thumb = path.join(THUMB_DIR, `${id}.jpg`);
  if (fs.existsSync(thumb)) return thumb;
  let raw;
  if (doc.type === "pdf") {
    const document = await pdf(doc.file, { scale: 1.4 });
    raw = await document.getPage(1);
  } else {
    const coverPath = await epubCoverPath(doc.file);
    if (!coverPath) throw new Error("no epub cover");
    raw = await readZipEntry(doc.file, coverPath);
    if (!raw) throw new Error("epub cover entry missing");
  }
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  await sharp(raw).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).jpeg({ quality: 74 }).toFile(thumb);
  return thumb;
}

// id -> { file, type }  for documents (pdf/epub) read in place.
const docs = new Map();

// Comics: each series folder of CBZ files becomes a shelf of volume items.
function scanComics() {
  const shelves = [];
  if (!fs.existsSync(LIBRARY)) return shelves;
  const seriesDirs = fs
    .readdirSync(LIBRARY, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(naturalCompare);

  for (const series of seriesDirs) {
    const dir = path.join(LIBRARY, series);
    const files = fs.readdirSync(dir).filter((f) => /\.cbz$/i.test(f)).sort(naturalCompare);
    if (files.length === 0) continue;
    const items = files.map((file) => {
      const id = Buffer.from(path.join(series, file)).toString("base64url");
      books.set(id, { file: path.join(dir, file), entries: null });
      return { id, type: "comic", title: file.replace(/\.cbz$/i, ""), series };
    });
    shelves.push({ title: series, items });
  }
  return shelves;
}

// Documents: top-level PDF/EPUB files in a category folder become items.
function scanDocs(sub) {
  const dir = path.join(FILES, sub);
  if (!fs.existsSync(dir)) return [];
  const items = [];
  for (const name of fs.readdirSync(dir).sort(naturalCompare)) {
    const type = DOC_TYPE[path.extname(name).toLowerCase()];
    if (!type) continue;
    const rel = path.join(sub, name);
    const id = Buffer.from(rel).toString("base64url");
    docs.set(id, { file: path.join(dir, name), type });
    items.push({ id, type, title: name.replace(/\.[^.]+$/, "") });
  }
  return items;
}

// ---- Reading progress (synced across devices via the server) ----
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); }
  catch { return {}; }
}
function writeProgress(store) {
  fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  const tmp = PROGRESS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store));
  fs.renameSync(tmp, PROGRESS_FILE); // atomic replace
}

// ---- Reading stats (pages turned + time spent, by day) ----
function loadStats() {
  try { return JSON.parse(fs.readFileSync(STATS_FILE, "utf8")); }
  catch { return { byDay: {}, totalPages: 0, totalMs: 0 }; }
}
function writeStats(s) {
  fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
  const tmp = STATS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, STATS_FILE);
}
function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Look up metadata for a title via the free Open Library API.
async function fetchOpenLibrary(q) {
  const sig = AbortSignal.timeout(8000); // never hang the request forever
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}` +
    `&limit=1&fields=title,author_name,first_publish_year,cover_i,ratings_average,key`;
  const r = await fetch(url, { signal: sig, headers: { "User-Agent": "book-comic-reader" } });
  const j = await r.json();
  const d = j.docs && j.docs[0];
  if (!d) return { found: false };
  let description = "";
  if (d.key) {
    try {
      const w = await fetch(`https://openlibrary.org${d.key}.json`, { signal: AbortSignal.timeout(8000) }).then((x) => x.json());
      description = typeof w.description === "string" ? w.description : w.description?.value || "";
    } catch {}
  }
  return {
    found: true,
    title: d.title || "",
    author: (d.author_name && d.author_name[0]) || "",
    year: d.first_publish_year || null,
    rating: typeof d.ratings_average === "number" ? Math.round(d.ratings_average * 10) / 10 : null,
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    description: (description || "").replace(/\s+/g, " ").trim().slice(0, 700),
  };
}

// Cached metadata lookup (keyed by item id; q is the search title).
async function getMeta(id, q, refresh) {
  const cacheFile = path.join(META_DIR, `${id}.json`);
  if (!refresh && fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  const meta = await fetchOpenLibrary(q);
  fs.mkdirSync(META_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(meta));
  return meta;
}

// Convert an uploaded .cbr (RAR) file into a .cbz at outFile.
async function cbrFileToCbz(cbrPath, outFile) {
  const buf = await fsp.readFile(cbrPath);
  const extractor = await createExtractorFromData({ data: Uint8Array.from(buf).buffer });
  const extracted = extractor.extract();
  const files = [...extracted.files]
    .filter((f) => !f.fileHeader.flags.directory && IMG_RE.test(f.fileHeader.name))
    .sort((a, b) => naturalCompare(a.fileHeader.name, b.fileHeader.name));
  if (files.length === 0) throw new Error("no images in archive");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outFile);
    const archive = archiver("zip", { store: true });
    out.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(out);
    files.forEach((f, i) => {
      const ext = path.extname(f.fileHeader.name).toLowerCase();
      archive.append(Buffer.from(f.extraction), { name: `${String(i + 1).padStart(4, "0")}${ext}` });
    });
    archive.finalize();
  });
}

// Strip path separators, Windows-illegal chars, AND .. segments / leading dots
// so series/category strings can never escape the library root.
const safeName = (s) =>
  s.replace(/[\\/:*?"<>|]/g, "_")
   .replace(/\.{2,}/g, "_")     // collapse "..", "..."
   .replace(/^\.+/, "")          // no leading dots
   .trim();

// Build the full catalog: Comics + document categories.
function scanAll() {
  books.clear();
  docs.clear();
  const categories = [];

  const comics = scanComics();
  if (comics.length) categories.push({ name: "Comics", shelves: comics });

  for (const cat of DOC_CATEGORIES) {
    const items = scanDocs(cat.dir);
    if (items.length) categories.push({ name: cat.name, shelves: [{ title: null, items }] });
  }
  return { categories };
}

// ---- PWA icons (generated once from an SVG book glyph) ----
function iconSVG(maskable) {
  const bg = maskable
    ? `<rect width="512" height="512" fill="#111418"/>`
    : `<rect width="512" height="512" rx="112" fill="#111418"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${bg}
  <g transform="translate(256 262)">
    <path d="M-12 -120 C -70 -150 -150 -150 -188 -120 L -188 112 C -150 82 -70 82 -12 112 Z" fill="#e8eaed"/>
    <path d="M12 -120 C 70 -150 150 -150 188 -120 L 188 112 C 150 82 70 82 12 112 Z" fill="#cfd6e0"/>
    <rect x="-13" y="-120" width="26" height="232" rx="6" fill="#5b9dff"/>
    <g stroke="#9aa4b2" stroke-width="11" stroke-linecap="round">
      <line x1="-158" y1="-66" x2="-44" y2="-54"/>
      <line x1="-158" y1="-26" x2="-44" y2="-14"/>
      <line x1="-158" y1="14" x2="-44" y2="26"/>
      <line x1="44" y1="-54" x2="158" y2="-66"/>
      <line x1="44" y1="-14" x2="158" y2="-26"/>
      <line x1="44" y1="26" x2="158" y2="14"/>
    </g>
  </g>
</svg>`;
}

async function ensureIcons() {
  fs.mkdirSync(ICON_DIR, { recursive: true });
  const targets = [
    { file: "icon-192.png", size: 192, maskable: false },
    { file: "icon-512.png", size: 512, maskable: false },
    { file: "icon-maskable-512.png", size: 512, maskable: true },
    { file: "apple-touch-icon.png", size: 180, maskable: false },
  ];
  for (const t of targets) {
    const out = path.join(ICON_DIR, t.file);
    if (fs.existsSync(out)) continue;
    await sharp(Buffer.from(iconSVG(t.maskable))).resize(t.size, t.size).png().toFile(out);
  }
}
ensureIcons().catch((e) => console.error("icon generation failed:", e.message));

let catalog = scanAll();

// Watch the library/source folders and rescan automatically (debounced).
let rescanTimer = null;
for (const dir of [FILES, LIBRARY]) {
  if (!fs.existsSync(dir)) continue;
  try {
    fs.watch(dir, { recursive: true }, () => {
      clearTimeout(rescanTimer);
      rescanTimer = setTimeout(() => { catalog = scanAll(); }, 1500);
    });
  } catch {}
}

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));
// Vendored reader libraries (EPUB rendering).
app.use("/vendor/epubjs", express.static(path.join(__dirname, "node_modules", "epubjs", "dist")));
app.use("/vendor/jszip", express.static(path.join(__dirname, "node_modules", "jszip", "dist")));

app.get("/api/library", (req, res) => res.json(catalog));

app.get("/api/rescan", (req, res) => {
  catalog = scanAll();
  res.json(catalog);
});

// Upload new content. category: comics | books | learning. series: comics only.
fs.mkdirSync(UPLOAD_TMP, { recursive: true });
const upload = multer({ dest: UPLOAD_TMP, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });
app.post("/api/upload", upload.array("files", 50), async (req, res) => {
  const category = (req.body.category || "").toLowerCase();
  const series = (req.body.series || "").trim();
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "no files" });
  const added = [], skipped = [];
  // Optional client-supplied relative paths (for folder uploads / drag-drop of dirs)
  let paths = [];
  try { paths = JSON.parse(req.body.paths || "[]"); } catch {}
  const relpathOf = (f, i) => (typeof paths[i] === "string" && paths[i]) || f.originalname;

  try {
    // Special path: Comics upload where every file is an image -> bundle into CBZs by top folder.
    if (category === "comics" && files.length && files.every((f) => IMG_RE.test(f.originalname))) {
      const groups = new Map();
      for (let i = 0; i < files.length; i++) {
        const rel = relpathOf(files[i], i).replace(/^[\\/]+/, "");
        const segs = rel.split(/[\\/]+/);
        const volName = segs.length > 1 ? segs[0] : (req.body.volume || safeName(series) || "Volume 1");
        if (!groups.has(volName)) groups.set(volName, []);
        groups.get(volName).push({ f: files[i], rel });
      }
      const seriesDir = path.join(LIBRARY, safeName(series) || "Comics");
      fs.mkdirSync(seriesDir, { recursive: true });
      for (const [volName, items] of groups) {
        items.sort((a, b) => naturalCompare(a.rel, b.rel));
        const safeVol = safeName(volName) || "Volume";
        const outFile = path.join(seriesDir, `${safeVol}.cbz`);
        await new Promise((resolve, reject) => {
          const out = fs.createWriteStream(outFile);
          const arch = archiver("zip", { store: true });
          out.on("close", resolve);
          arch.on("error", reject);
          arch.pipe(out);
          items.forEach(({ f }, j) => {
            const ext = path.extname(f.originalname).toLowerCase();
            arch.append(fs.createReadStream(f.path), { name: `${String(j + 1).padStart(4, "0")}${ext}` });
          });
          arch.finalize();
        });
        for (const { f } of items) await fsp.unlink(f.path).catch(() => {});
        added.push(`${safeVol}.cbz`);
      }
      catalog = scanAll();
      return res.json({ ok: true, added, skipped });
    }

    // Default path: per-file move/convert.
    for (const f of files) {
      const name = path.basename(f.originalname);
      const ext = path.extname(name).toLowerCase();
      if (category === "comics") {
        const s = safeName(series || name.replace(/\.(cbz|cbr)$/i, "")) || "Comics";
        const dir = path.join(LIBRARY, s);
        if (ext === ".cbz") {
          fs.mkdirSync(dir, { recursive: true });
          await fsp.rename(f.path, path.join(dir, name));
          added.push(name);
        } else if (ext === ".cbr") {
          await cbrFileToCbz(f.path, path.join(dir, name.replace(/\.cbr$/i, ".cbz")));
          await fsp.unlink(f.path).catch(() => {});
          added.push(name);
        } else { await fsp.unlink(f.path).catch(() => {}); skipped.push(name); }
      } else if (category === "books" || category === "learning") {
        if (ext === ".pdf" || ext === ".epub") {
          const dir = path.join(FILES, category);
          fs.mkdirSync(dir, { recursive: true });
          await fsp.rename(f.path, path.join(dir, name));
          added.push(name);
        } else { await fsp.unlink(f.path).catch(() => {}); skipped.push(name); }
      } else { await fsp.unlink(f.path).catch(() => {}); skipped.push(name); }
    }
    catalog = scanAll();
    res.json({ ok: true, added, skipped });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
});

// Reading stats: GET full snapshot, POST to add to today's totals.
app.get("/api/stats", (req, res) => res.json(loadStats()));
app.post("/api/stats", (req, res) => {
  const pages = Math.max(0, Number(req.body.pages) || 0);
  const ms = Math.max(0, Math.min(120000, Number(req.body.ms) || 0)); // cap any single event at 2 min
  if (!pages && !ms) return res.json({ ok: true });
  const s = loadStats();
  if (!s.byDay) s.byDay = {};
  const k = dayKey();
  if (!s.byDay[k]) s.byDay[k] = { pages: 0, ms: 0 };
  s.byDay[k].pages += pages;
  s.byDay[k].ms += ms;
  s.totalPages = (s.totalPages || 0) + pages;
  s.totalMs = (s.totalMs || 0) + ms;
  writeStats(s);
  res.json({ ok: true });
});

// Reading progress, shared across all your devices.
app.get("/api/progress", (req, res) => res.json(loadProgress()));

app.post("/api/progress", (req, res) => {
  const { id, data } = req.body || {};
  if (!id || typeof data !== "object") return res.status(400).json({ error: "bad request" });
  const store = loadProgress();
  // Keep whichever record is newer (last-write-wins by timestamp).
  if (!store[id] || (data.t || 0) >= (store[id].t || 0)) store[id] = data;
  writeProgress(store);
  res.json({ ok: true });
});

// Metadata lookup for an item (q = search title, supplied by the client).
app.get("/api/meta/:id", async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ found: false, error: "missing q" });
  try {
    res.json(await getMeta(req.params.id, q, req.query.refresh === "1"));
  } catch {
    res.status(502).json({ found: false, error: "lookup failed" });
  }
});

// Cover thumbnail for a document (PDF page 1 / EPUB embedded cover).
app.get("/api/doc/:id/cover", async (req, res) => {
  const doc = docs.get(req.params.id);
  if (!doc) return res.status(404).end();
  try {
    const thumb = await getDocCover(req.params.id, doc);
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.sendFile(thumb);
  } catch {
    res.status(404).end(); // no cover available — client shows a placeholder
  }
});

// Page count (and type) for a document. PDFs are paged; EPUBs report type only.
app.get("/api/doc/:id/info", async (req, res) => {
  const doc = docs.get(req.params.id);
  if (!doc) return res.status(404).json({ error: "not found" });
  if (doc.type !== "pdf") return res.json({ type: doc.type });
  try {
    const d = await getPdfDoc(req.params.id, doc.file);
    res.json({ type: "pdf", pageCount: d.length });
  } catch {
    res.status(500).json({ error: "read failed" });
  }
});

// Render a single PDF page as an image (n is 0-based), cached on disk.
app.get("/api/doc/:id/page/:n", async (req, res) => {
  const doc = docs.get(req.params.id);
  if (!doc || doc.type !== "pdf") return res.status(404).end();
  try {
    const file = await getPdfPage(req.params.id, doc.file, parseInt(req.params.n, 10));
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
});

// Serve a document (PDF/EPUB) file in place, with Range support via sendFile.
app.get("/api/doc/:id/file", (req, res) => {
  const doc = docs.get(req.params.id);
  if (!doc) return res.status(404).end();
  res.setHeader("Content-Type", doc.type === "epub" ? "application/epub+zip" : "application/pdf");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(doc.file, (err) => { if (err && !res.headersSent) res.status(500).end(); });
});

app.get("/api/book/:id/info", async (req, res) => {
  const book = books.get(req.params.id);
  if (!book) return res.status(404).json({ error: "not found" });
  try {
    const entries = await listEntries(book);
    res.json({ id: req.params.id, pageCount: entries.length });
  } catch {
    res.status(500).json({ error: "read failed" });
  }
});

app.get("/api/book/:id/cover", async (req, res) => {
  const book = books.get(req.params.id);
  if (!book) return res.status(404).end();
  try {
    const thumb = await getCover(req.params.id, book);
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.sendFile(thumb);
  } catch {
    res.status(500).end();
  }
});

app.get("/api/book/:id/page/:n", async (req, res) => {
  const book = books.get(req.params.id);
  if (!book) return res.status(404).end();
  try {
    const entries = await listEntries(book);
    const n = parseInt(req.params.n, 10);
    if (!(n >= 0 && n < entries.length)) return res.status(404).end();
    streamEntry(book, entries[n], res);
  } catch {
    res.status(500).end();
  }
});

const httpServer = app.listen(PORT, "0.0.0.0", () => {
  const nets = os.networkInterfaces();
  const lan = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) lan.push(net.address);
    }
  }
  console.log(`\n  Library reader running.`);
  console.log(`  On this PC:   http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  On your phone: http://${ip}:${PORT}   (same WiFi)`);
  const counts = catalog.categories.map((c) => `${c.name}: ${c.shelves.reduce((n, s) => n + s.items.length, 0)}`);
  console.log(`\n  ${counts.join("  |  ") || "empty — add files to ./files and run \"npm run convert\" for comics"}`);
  console.log("");
  openBrowser(`http://localhost:${PORT}`);
});

httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    // Already running elsewhere — just open the browser to that instance.
    console.error(`\n  Port ${PORT} is already in use — the reader is probably already running.`);
    console.error(`  Opening the browser to the running instance...\n`);
    openBrowser(`http://localhost:${PORT}`);
    process.exit(0);
  }
  throw err;
});
