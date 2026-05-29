import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import express from "express";
import yauzl from "yauzl";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIBRARY = path.join(__dirname, "library");          // converted comics (CBZ)
const FILES = path.join(__dirname, "files");              // source library root
const THUMB_DIR = path.join(__dirname, ".cache", "thumbs");
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

const app = express();
app.use(express.static(path.join(__dirname, "public")));
// Vendored reader libraries (EPUB rendering).
app.use("/vendor/epubjs", express.static(path.join(__dirname, "node_modules", "epubjs", "dist")));
app.use("/vendor/jszip", express.static(path.join(__dirname, "node_modules", "jszip", "dist")));

app.get("/api/library", (req, res) => res.json(catalog));

app.get("/api/rescan", (req, res) => {
  catalog = scanAll();
  res.json(catalog);
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
