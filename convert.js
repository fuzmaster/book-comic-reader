import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";
import { createExtractorFromData } from "node-unrar-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(__dirname, "raw files");
const OUT = path.join(__dirname, "library");

const IMG_RE = /\.(jpe?g|png|gif|webp|bmp)$/i;

// Natural sort: "chapter 2" before "chapter 10", "01_002" before "01_010".
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function pad(n, width = 4) {
  return String(n).padStart(width, "0");
}

// Write an array of { name, data:Buffer } as a CBZ (zip, stored — images are
// already compressed). Returns a promise that resolves when fully flushed.
function writeCbz(outFile, pages) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const output = fs.createWriteStream(outFile);
    const archive = archiver("zip", { store: true });
    output.on("close", () => resolve(archive.pointer()));
    archive.on("error", reject);
    archive.pipe(output);
    for (const page of pages) archive.append(page.data, { name: page.name });
    archive.finalize();
  });
}

// Recursively list image files under dir, returned in natural (page) order.
async function listImagesSorted(dir) {
  const out = [];
  async function walk(d, rel) {
    const entries = await fsp.readdir(d, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort(naturalCompare);
    const files = entries
      .filter((e) => e.isFile() && IMG_RE.test(e.name))
      .map((e) => e.name)
      .sort(naturalCompare);
    for (const f of files) out.push(path.join(d, f));
    for (const sub of dirs) await walk(path.join(d, sub), path.join(rel, sub));
  }
  await walk(dir, "");
  return out;
}

// Build a CBZ from a directory tree of images (e.g. a volume of chapters).
async function cbzFromFolder(srcDir, outFile, label) {
  if (fs.existsSync(outFile)) {
    console.log(`  skip (exists): ${path.basename(outFile)}`);
    return;
  }
  const images = await listImagesSorted(srcDir);
  if (images.length === 0) {
    console.log(`  no images in ${label}, skipping`);
    return;
  }
  const pages = [];
  for (let i = 0; i < images.length; i++) {
    const ext = path.extname(images[i]).toLowerCase();
    pages.push({ name: `${pad(i + 1)}${ext}`, data: await fsp.readFile(images[i]) });
  }
  await writeCbz(outFile, pages);
  console.log(`  wrote ${path.basename(outFile)} (${pages.length} pages)`);
}

// Build a CBZ from a .cbr (RAR) archive.
async function cbzFromCbr(cbrFile, outFile, label) {
  if (fs.existsSync(outFile)) {
    console.log(`  skip (exists): ${path.basename(outFile)}`);
    return;
  }
  const buf = await fsp.readFile(cbrFile);
  const extractor = await createExtractorFromData({
    data: Uint8Array.from(buf).buffer,
  });
  const extracted = extractor.extract();
  const files = [...extracted.files]
    .filter((f) => !f.fileHeader.flags.directory && IMG_RE.test(f.fileHeader.name))
    .sort((a, b) => naturalCompare(a.fileHeader.name, b.fileHeader.name));
  if (files.length === 0) {
    console.log(`  no images in ${label}, skipping`);
    return;
  }
  const pages = files.map((f, i) => ({
    name: `${pad(i + 1)}${path.extname(f.fileHeader.name).toLowerCase()}`,
    data: Buffer.from(f.extraction),
  }));
  await writeCbz(outFile, pages);
  console.log(`  wrote ${path.basename(outFile)} (${pages.length} pages)`);
}

// "Maus 1 - Art Spiegelman.cbr" -> { series: "Maus", volume: 1 }
function parseCbrName(filename) {
  const base = filename.replace(/\.cbr$/i, "").trim();
  const m = base.match(/^(.*?)[\s_-]+(\d+)\b/);
  if (m) return { series: m[1].trim(), volume: parseInt(m[2], 10) };
  return { series: base, volume: 1 };
}

// Collapse a split-series folder name into a canonical series name.
// "Yu-Gi-Oh! Duelist 8-18" / "...19-31" -> "Yu-Gi-Oh! Duelist"
function canonicalSeries(folderName) {
  return folderName.replace(/\s+\d+\s*-\s*\d+\s*$/, "").trim();
}

function volumeNumber(volFolderName) {
  const m = volFolderName.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const topEntries = await fsp.readdir(RAW, { withFileTypes: true });

  for (const entry of topEntries) {
    const topPath = path.join(RAW, entry.name);
    if (!entry.isDirectory()) continue;

    const children = await fsp.readdir(topPath, { withFileTypes: true });
    const cbrs = children.filter((c) => c.isFile() && /\.cbr$/i.test(c.name));
    const volumeDirs = children.filter((c) => c.isDirectory() && /volume/i.test(c.name));
    // Series-of-series: subfolders that themselves contain VOLUME folders.
    const seriesDirs = [];
    for (const c of children.filter((x) => x.isDirectory())) {
      const sub = await fsp.readdir(path.join(topPath, c.name), { withFileTypes: true });
      if (sub.some((s) => s.isDirectory() && /volume/i.test(s.name))) seriesDirs.push(c.name);
    }

    // Case A: folder of .cbr volumes (e.g. Maus).
    for (const cbr of cbrs) {
      const { series, volume } = parseCbrName(cbr.name);
      console.log(`[${series}] Volume ${volume} (from ${cbr.name})`);
      const outFile = path.join(OUT, series, `${series} - Vol ${pad(volume, 2)}.cbz`);
      await cbzFromCbr(path.join(topPath, cbr.name), outFile, cbr.name);
    }

    // Case B: this folder directly holds VOLUME subfolders.
    if (volumeDirs.length > 0) {
      const series = canonicalSeries(entry.name);
      for (const v of volumeDirs.sort((a, b) => naturalCompare(a.name, b.name))) {
        const vol = volumeNumber(v.name);
        console.log(`[${series}] ${v.name}`);
        const outFile = path.join(OUT, series, `${series} - Vol ${pad(vol, 2)}.cbz`);
        await cbzFromFolder(path.join(topPath, v.name), outFile, `${entry.name}/${v.name}`);
      }
    }

    // Case C: subfolders that each contain VOLUME folders (e.g. Yugioh Manga).
    for (const sd of seriesDirs) {
      const series = canonicalSeries(sd);
      const seriesPath = path.join(topPath, sd);
      const vols = (await fsp.readdir(seriesPath, { withFileTypes: true }))
        .filter((c) => c.isDirectory() && /volume/i.test(c.name))
        .sort((a, b) => naturalCompare(a.name, b.name));
      for (const v of vols) {
        const vol = volumeNumber(v.name);
        console.log(`[${series}] ${v.name} (from ${sd})`);
        const outFile = path.join(OUT, series, `${series} - Vol ${pad(vol, 2)}.cbz`);
        await cbzFromFolder(path.join(seriesPath, v.name), outFile, `${sd}/${v.name}`);
      }
    }
  }

  console.log("\nDone. CBZ library is in:", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
