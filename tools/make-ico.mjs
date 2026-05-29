// Builds public/icons/app.ico from the generated 512px PNG icon.
// Used for the Windows desktop shortcut. Run: node tools/make-ico.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON_DIR = path.join(__dirname, "..", "public", "icons");
const src = path.join(ICON_DIR, "icon-512.png");
const out = path.join(ICON_DIR, "app.ico");

if (!fs.existsSync(src)) {
  console.error("icon-512.png not found — start the server once to generate icons first.");
  process.exit(1);
}

const png = await sharp(src).resize(256, 256).png().toBuffer();

// ICO container wrapping a single PNG image (256x256 stored as 0/0).
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // image count

const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);              // width 256 -> 0
entry.writeUInt8(0, 1);              // height 256 -> 0
entry.writeUInt8(0, 2);              // palette colors
entry.writeUInt8(0, 3);              // reserved
entry.writeUInt16LE(1, 4);           // color planes
entry.writeUInt16LE(32, 6);          // bits per pixel
entry.writeUInt32LE(png.length, 8);  // image size
entry.writeUInt32LE(22, 12);         // offset (6 + 16)

fs.writeFileSync(out, Buffer.concat([header, entry, png]));
console.log("Wrote", out);
