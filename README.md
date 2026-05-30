# 📚 Comic Reader — self-hosted library for comics, manga, books & PDFs

A lightweight, **self-hosted reading library** for your **comics, manga, PDFs,
and EPUB books**. It converts `.cbr`/`.cbz`/image folders into a clean comic
library, and reads PDFs and EPUBs in place — all in any browser, on your
**desktop or your phone**, over your home network. No cloud, no accounts,
no subscriptions. Your files never leave your machine.

Built with Node.js. Organizes everything into categories (Comics, Books,
Learning, and any you add), with **pinch-to-zoom**, **right-to-left manga**,
a **3D page-flip** animation, a **built-in PDF viewer**, an **EPUB reader**,
**bookmarks**, **stats**, **mark-as-finished**, **bulk operations**,
**resume-where-you-left-off**, and **offline reading as an installable PWA**.

> ⚠️ **Trust model:** this is designed for a **personal LAN** (your home WiFi
> or a private Tailscale tailnet). It has no built-in user accounts. Anyone
> who can reach the port can upload, delete, and read your library. There's
> an optional `READER_TOKEN` for shared-secret auth (see *Security* below) —
> set it before exposing the app to anything wider than your own network.

---

## ✨ Features

- **One library, many formats** — comics (CBR/CBZ/image folders), PDFs, EPUB.
- **Read anywhere** — responsive web reader, works on desktop and phone.
- **Comic converter** — `.cbr` (RAR) and image-folder series → standard CBZ.
- **3D page-flip** that follows your finger, on comics *and* PDFs.
- **Pinch & zoom**, mouse-wheel zoom, drag-to-pan, double-tap.
- **Manga mode** — per-series right-to-left toggle.
- **PDF viewer** — paged image reader + "Open original" for the native viewer.
- **EPUB reader** — paginated, adjustable font, progress slider.
- **Continue Reading**, **Finished shelf**, **bookmarks**.
- **Cross-device sync** — reading progress saved server-side.
- **Add from the browser** — guided upload wizard with **folder drop**.
- **Search, sort, filter** the library; **series detail page**.
- **Stats** — daily/weekly/all-time pages and time, per-item top reads, CSV/JSON export.
- **Bulk operations** — multi-select to mark finished or delete.
- **Custom categories** — add your own document folders from Settings.
- **Installable as a PWA**, offline reading of cached pages.

---

## 🚀 Quick start

### Requirements
- [Node.js](https://nodejs.org/) **18 or newer** (includes `npm`).

### Install
```bash
git clone https://github.com/fuzmaster/book-comic-reader.git
cd book-comic-reader
npm install
```

### Run

| OS | Command |
|---|---|
| **Windows** | double-click **`Comic Reader.cmd`**, or run `npm start` |
| **macOS / Linux** | `./start.sh`, or `npm start` |

The first time it runs it'll open `http://localhost:4288` in your browser and
print a `http://192.168.x.x:4288` URL you can open on your phone.

### Add your content
Click **`+ Add`** in the top bar — the wizard accepts:

- `.cbz` / `.cbr` files (Comics)
- Folders of page images (Comics — bundled into one CBZ per subfolder)
- `.pdf` files (Books / Learning / any category you've added)
- `.epub` files (Books / Learning / any category)

You can also drop files/folders straight into `files/` on disk (and run
`npm run convert` for raw comics) — the server watches the folder and
re-indexes automatically.

---

## 📱 Reading on your phone

1. Phone on the **same WiFi** as the PC.
2. Open the LAN URL the server printed (or check it in `Settings → Network` on Windows).
3. **Add to Home Screen** in your browser for a fullscreen app icon.

### Firewall (one-time)

| OS | What to do |
|---|---|
| **Windows** | run as admin: `New-NetFirewallRule -DisplayName "Comic Reader 4288" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4288 -Profile Private` |
| **macOS** | System Settings → Network → Firewall → allow incoming for `node` |
| **Linux (ufw)** | `sudo ufw allow from 192.168.0.0/16 to any port 4288` |

### Reading away from home
Install [Tailscale](https://tailscale.com) on your PC and phone (free for
personal use). On the PC run `tailscale serve --bg 4288` and open the
`https://<your-pc>.<tailnet>.ts.net` URL on your phone — works from anywhere,
HTTPS included.

---

## 🔁 Auto-start in the background

### Windows (Scheduled Task with crash auto-restart)
```powershell
$action  = New-ScheduledTaskAction -Execute "wscript.exe" `
            -Argument ("`"" + (Resolve-Path tools/run-hidden.vbs) + "`"") `
            -WorkingDirectory (Get-Location)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
             -ExecutionTimeLimit ([System.TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName "ComicReader" -Action $action -Trigger $trigger -Settings $settings `
  -User "$env:USERDOMAIN\$env:USERNAME" -RunLevel Limited -Force
```

### macOS (launchd)
Create `~/Library/LaunchAgents/io.comic-reader.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>io.comic-reader</string>
  <key>WorkingDirectory</key><string>/ABSOLUTE/PATH/TO/book-comic-reader</string>
  <key>ProgramArguments</key>
  <array><string>/usr/local/bin/node</string><string>server.js</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key><dict><key>NO_OPEN</key><string>1</string></dict>
</dict></plist>
```
Then `launchctl load ~/Library/LaunchAgents/io.comic-reader.plist`.

### Linux (systemd, user service)
Create `~/.config/systemd/user/comic-reader.service`:
```ini
[Unit]
Description=Comic Reader

[Service]
WorkingDirectory=/ABSOLUTE/PATH/TO/book-comic-reader
ExecStart=/usr/bin/node server.js
Environment=NO_OPEN=1
Restart=on-failure

[Install]
WantedBy=default.target
```
Then `systemctl --user enable --now comic-reader`.

---

## 🔒 Security

The server has no user accounts by design — your LAN firewall is the perimeter.
If you ever want to expose it more widely, set a **shared-secret token**:

```bash
# Linux/macOS
READER_TOKEN="mysecret" node server.js

# Windows PowerShell
$env:READER_TOKEN="mysecret"; node server.js
```

With the token set, any write request (upload, delete, settings, progress,
stats) requires `Authorization: Bearer mysecret`. The web UI will prompt you
once per browser for the token and remember it.

Other knobs:
- `HOST=127.0.0.1` to bind to localhost only (no LAN access).
- `PORT=4400` to use a different port.
- `NO_OPEN=1` to skip auto-opening the browser (good for background services).

The server also:
- Sets `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, and `Permissions-Policy` on every response.
- Rate-limits the Open Library metadata proxy to 60 req/min/IP.
- Caps individual uploads at 1 GB.
- Returns generic error messages — full details go to the server log only.

---

## 📁 How your files are stored

```
book-comic-reader/
  files/                 ← drop content here
    comics/              (.cbr or Series/Volume/Chapter image trees)
    books/               (.pdf / .epub)
    learning/            (.pdf / .epub)
    <your category>/     (any extra category added from Settings)
  library/               ← converted comic CBZ files
  .cache/                ← thumbnails, rendered PDF pages, progress, stats
```

`files/` and `library/` are in `.gitignore` — they will **never** be committed.

---

## ⌨️ Controls

| Action | Desktop | Touch |
|---|---|---|
| Next / previous page | `←` `→` / `Space` | tap right / left third, or drag |
| Toggle menu | click center | tap center |
| Zoom in / out | wheel, `+` / `-` | pinch |
| Reset zoom | `0` | double-tap |
| Pan when zoomed | drag | drag |
| Bookmark | toolbar 🔖 | toolbar 🔖 |
| Day / Dim / Sepia | toolbar 🌞 | toolbar 🌞 |
| Two-page spread (desktop) | toolbar 📖 | n/a |
| Fit width / height | `f` | toolbar |
| RTL (manga) | `d` | toolbar `L→R` / `R→L` |
| Back to library | `Esc` | ‹ Library |

---

## 🛠️ How it works

- **`convert.js`** — extracts CBR (via `node-unrar-js`) and bundles image folders into per-volume CBZ (via `archiver`).
- **`server.js`** — Express server. Indexes `library/` (comics) and `files/` (documents), streams comic pages from CBZ (via `yauzl`), renders PDF pages with `pdf-to-img`, generates thumbnails with `sharp`, and serves PDFs/EPUBs with HTTP range support.
- **`public/`** — vanilla HTML/CSS/JS: image reader, paged-PDF reader, and EPUB reader (via vendored `epub.js`); PWA manifest + service worker for offline.

No database, no build step.

---

## ⚖️ Legal

This is a **reader for content you already own**. It ships with no content.
Don't use it to distribute copyrighted material. The contents of `files/` and
`library/` never leave your machine.

---

## 📄 License

[MIT](LICENSE) © fuzmaster
