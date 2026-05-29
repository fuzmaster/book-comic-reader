# 📚 Comic Reader — self-hosted library for comics, manga, books & PDFs

A lightweight, **self-hosted reading library** for your **comics, manga, PDFs,
and EPUB books**. It converts `.cbr`/`.cbz`/image folders into a clean comic
library, and reads PDFs and EPUBs in place — all in any browser, on your
**desktop or your phone**, over your home network. No cloud, no accounts, no
subscriptions. Your files never leave your machine.

Built with Node.js. Organizes everything into categories (Comics, Books,
Learning…), with **pinch-to-zoom comics**, **right-to-left manga mode**, a
**built-in PDF viewer**, an **EPUB reader**, **resume-where-you-left-off**, and
**offline reading as an installable PWA**.

---

## ✨ Features

- **One library, many formats** — comics (CBR/CBZ/image folders), **PDFs**, and **EPUB** books, organized into categories.
- **Read anywhere** — responsive web reader that works on desktop, tablet, and phone. Open it on your computer, or on your phone over the same WiFi.
- **Comic converter included** — turns `.cbr` (RAR) archives and `Series/Volume/Chapter/*.jpg` image folders into standard **CBZ** files, grouped by volume.
- **Pinch & zoom comics** — pinch-to-zoom on touch, mouse-wheel zoom on desktop, drag-to-pan, double-tap to zoom.
- **Manga mode** — per-series **right-to-left** reading toggle (flips page-turn direction, tap zones, and the slider).
- **PDF viewer** — opens PDFs in the browser's built-in viewer, with an "open in new tab" fallback.
- **EPUB reader** — paginated reflowable reading (powered by epub.js) with adjustable font size, a progress slider, and saved position.
- **Continue Reading** — a shelf of in-progress items, and **auto-advance to the next comic volume** when you finish one.
- **Remembers your place** — reading progress saved per item, with progress bars on covers.
- **Fast covers** — auto-generated, cached comic cover thumbnails so the library loads instantly.
- **Installable (PWA)** — "Add to Home Screen" for an app-like, fullscreen experience, with offline caching of comic pages you've opened.

## 📦 Requirements

- [Node.js](https://nodejs.org/) 18 or newer (includes `npm`).

## 🚀 Quick start

```bash
# 1. Clone and install
git clone https://github.com/fuzmaster/book-comic-reader.git
cd book-comic-reader
npm install

# 2. Add your files to the "files" folder (see layout below)

# 3. Convert comics into the library (PDFs/EPUBs need no conversion)
npm run convert

# 4. Start the reader (opens your browser automatically)
npm start
```

The server prints a `localhost` link for this computer and a `http://192.168.x.x:4288`
link you can open on your **phone** (same WiFi).

## 📁 How to organize your library

Everything lives under the `files/` folder. The top-level subfolders become
**categories** in the app (e.g. `comics`, `books`, `learning` — name them
whatever you like; `books` and `learning` are treated as document categories).

```
files/
  comics/                         ← converted to CBZ and read with the comic viewer
    Maus/
      Maus 1 - Art Spiegelman.cbr      (archive: one volume per .cbr/.cbz)
    My Manga/
      VOLUME 1/
        chapter 1/  01_001.jpg, ...    (image folders: Series/Volume/Chapter/pages)
        chapter 2/  ...
  books/                          ← PDFs / EPUBs, read in place
    My Novel.pdf
  learning/                       ← PDFs / EPUBs, read in place
    Some Guide.epub
```

Document categories are configured in `server.js` (`DOC_CATEGORIES`). Comics
are converted with `npm run convert` — each volume becomes one `.cbz` in
`library/`; re-running is safe and skips already-converted volumes. PDFs and
EPUBs are read directly and need no conversion.

> **Supported:** Comics — CBR (RAR), CBZ (ZIP), and image folders (JPG/PNG/GIF/WebP/BMP).
> Documents — PDF and EPUB.

## 🖱️ One-click desktop shortcut (Windows)

A `Comic Reader.cmd` launcher is included. To get a desktop icon:

```powershell
# generate the .ico, then create a Desktop shortcut
node tools/make-ico.mjs
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$([Environment]::GetFolderPath('Desktop'))\Comic Reader.lnk")
$lnk.TargetPath = "$PWD\Comic Reader.cmd"
$lnk.WorkingDirectory = "$PWD"
$lnk.IconLocation = "$PWD\public\icons\app.ico"
$lnk.WindowStyle = 7
$lnk.Save()
```

Double-click the shortcut to launch the reader and open your browser. Closing
the console window stops the server.

## 📱 Reading on your phone

1. Make sure your phone and computer are on the **same WiFi**.
2. Run `npm start` and note the `http://192.168.x.x:4288` address it prints.
3. Open that address in your phone's browser.
4. (Optional) Use your browser's **Add to Home Screen** for a fullscreen app icon.

> **Offline / full install:** Service workers (offline caching and installable PWA)
> only run in a *secure context* — `https` or `localhost`. They work on the desktop
> out of the box. For full offline support on a phone over your LAN, serve the app
> over HTTPS (e.g. with a reverse proxy or a tunnel like Tailscale/Cloudflare Tunnel).

## ⌨️ Controls

| Action | Desktop | Touch |
|---|---|---|
| Next / previous page | `←` `→` (or `Space`) | tap right / left third |
| Toggle menu | click center | tap center |
| Zoom in / out | mouse wheel, `+` / `-` | pinch |
| Zoom to point / reset | double-click, `0` to reset | double-tap |
| Pan when zoomed | click & drag | drag |
| Fit width / height | `f` | toolbar button |
| Reading direction (LTR/RTL) | `d` | toolbar button |
| Back to library | `Esc` | ‹ Library |

## 🛠️ How it works

- **`convert.js`** — extracts CBR archives (via `node-unrar-js`) and bundles image folders into per-volume CBZ files (via `archiver`).
- **`server.js`** — an Express server that scans `library/` (comics) and `files/` (documents), serves comic pages on demand from inside the CBZ files (via `yauzl`), generates cached cover thumbnails (via `sharp`), and streams PDFs/EPUBs with HTTP range support.
- **`public/`** — the responsive single-page app (vanilla HTML/CSS/JS): comic image reader, native PDF viewer, and an EPUB reader (via `epub.js`), plus the PWA manifest and service worker.

No database, no build step.

## ⚖️ Legal

This is a **reader for comics you already own**. It ships with no content.
Don't use it to distribute copyrighted material. Your files in `raw files/` and
`library/` are git-ignored and never published.

## 📄 License

[MIT](LICENSE) © fuzmaster
