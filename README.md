# 📚 Comic Reader — self-hosted comic & manga reader for desktop and phone

A lightweight, **self-hosted comic book reader** that converts your `.cbr`, `.cbz`,
and loose image folders into a clean library and lets you read them in any
browser — on your **desktop or your phone** — over your home network. No cloud,
no accounts, no subscriptions. Your comics never leave your machine.

Built with Node.js. Supports **CBR/CBZ conversion**, **pinch-to-zoom**,
**right-to-left manga mode**, **resume-where-you-left-off**, and **offline
reading as an installable PWA**.

---

## ✨ Features

- **Read anywhere** — responsive web reader that works on desktop, tablet, and phone. Open it on your computer, or on your phone over the same WiFi.
- **Converter included** — turns `.cbr` (RAR) archives and `Series/Volume/Chapter/*.jpg` image folders into standard **CBZ** files, grouped by volume.
- **Pinch & zoom** — pinch-to-zoom on touch, mouse-wheel zoom on desktop, drag-to-pan, double-tap to zoom.
- **Manga mode** — per-series **right-to-left** reading toggle (flips page-turn direction, tap zones, and the slider).
- **Continue Reading** — a shelf of your in-progress volumes, and **auto-advance to the next volume** when you finish one.
- **Remembers your place** — reading progress is saved per volume, with progress bars on every cover.
- **Fast covers** — auto-generated, cached cover thumbnails so the library loads instantly.
- **Installable (PWA)** — "Add to Home Screen" for an app-like, fullscreen experience, with offline caching of pages you've opened.
- **Fit modes & keyboard shortcuts** — fit-to-width / fit-to-height, arrow-key navigation, and more.

## 📦 Requirements

- [Node.js](https://nodejs.org/) 18 or newer (includes `npm`).

## 🚀 Quick start

```bash
# 1. Clone and install
git clone https://github.com/fuzmaster/book-comic-reader.git
cd book-comic-reader
npm install

# 2. Add your comics to the "raw files" folder (see layout below)

# 3. Convert them into the library
npm run convert

# 4. Start the reader (opens your browser automatically)
npm start
```

The server prints a `localhost` link for this computer and a `http://192.168.x.x:4288`
link you can open on your **phone** (same WiFi).

## 📁 How to organize your comics

Put your files in the `raw files/` folder. The converter understands two layouts:

**1. Archive files** — one volume per archive:

```
raw files/
  Maus/
    Maus 1 - Art Spiegelman.cbr
    Maus 2 - Art Spiegelman.cbr
```

**2. Image folders** — `Series / Volume / Chapter / pages`:

```
raw files/
  My Manga/
    VOLUME 1/
      chapter 1/  01_001.jpg, 01_002.jpg, ...
      chapter 2/  ...
    VOLUME 2/
      ...
```

Run `npm run convert` and each volume becomes a single `.cbz` in `library/`.
Re-running is safe — it skips volumes that are already converted.

> Supported page formats: JPG, PNG, GIF, WebP, BMP. Archive input: CBR (RAR) and CBZ (ZIP).

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
- **`server.js`** — an Express server that scans `library/`, serves pages on demand directly from inside the CBZ files (via `yauzl`), and generates cached cover thumbnails (via `sharp`).
- **`public/`** — the responsive single-page reader (vanilla HTML/CSS/JS) plus the PWA manifest and service worker.

No database, no build step.

## ⚖️ Legal

This is a **reader for comics you already own**. It ships with no content.
Don't use it to distribute copyrighted material. Your files in `raw files/` and
`library/` are git-ignored and never published.

## 📄 License

[MIT](LICENSE) © fuzmaster
