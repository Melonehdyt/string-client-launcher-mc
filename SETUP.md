# String Client — Server Setup Guide

This document describes everything your server needs for the **installer** and **download page** to work.

---

## How It Works

1. User visits `https://yourserver.com/download`
2. User enters the download password (if set) → gets a token
3. User clicks **Download Setup** → downloads the installer `.exe`
4. User runs the installer → the installer:
   - Copies the Electron runtime from itself to the install folder
   - **Downloads `latest.zip` from your server** (the launcher app files)
   - Extracts to `resources/app/`
   - Runs `npm install` to install dependencies
   - Creates shortcuts and registry entries

---

## Server Requirements

### Files on the Server

Your server needs these files in the `launcher-build/` directory (relative to `server/index.js`):

```
server/
  launcher-build/
    latest.zip          ← Launcher app files (built locally)
    String-Client-Setup.exe  ← The installer exe (optional, for /download page)
    config.json         ← Auto-created, stores download password
```

### How to Get These Files There

#### `latest.zip` — Required

This contains the launcher app code (main.js, preload.js, auth-main.js, package.json, dist/, buildResources/).

**Build it locally:**
```bash
npm run build:zip
```

This creates `launcher-build.zip` and copies it to `server/launcher-build/latest.zip`.

**Upload to server:** Upload `latest.zip` to `server/launcher-build/` on your Pterodactyl panel via the Files tab or SFTP.

#### `String-Client-Setup.exe` — Optional (for /download page)

This is the installer itself. The `/download` page shows a download button only if this file exists.

**Build it locally:**
```bash
npm run build:installer
```

Creates `installer/dist/String Client Setup 1.0.0.exe`.

**Upload to server:** Upload to `server/launcher-build/` on your server. It can be named anything ending in `.exe` — the server finds the largest `.exe` in the folder.

---

## API Endpoints (Server)

These endpoints must be accessible on your server. They are already in `server/index.js`.

| Endpoint | Method | Description |
|---|---|---|
| `/api/launcher/download` | GET | Downloads `latest.zip` — **this is what the installer fetches** |
| `/api/launcher/download/exe` | GET | Downloads the installer `.exe` (requires token if password set) |
| `/api/launcher/download/verify-password` | POST | Verifies download password, returns token |
| `/api/launcher/build-info` | GET | Returns exe/zip file sizes (for download page) |
| `/download` | GET | The download page HTML |

### Download Password (Optional)

Set a password in the admin panel (Launcher tab) or via:

```bash
curl -X POST https://yourserver.com/api/admin/launcher/set-password \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_BOT_TOKEN" \
  -d '{"password":"yourpassword"}'
```

Leave empty for public (no password) downloads.

---

## Quick Setup Checklist

1. [ ] Server (`server/index.js`) is running on your Pterodactyl server
2. [ ] `.env` file has correct settings (`PORT`, `API_URL`, `BOT_TOKEN`)
3. [ ] `latest.zip` is uploaded to `server/launcher-build/`
4. [ ] `String-Client-Setup.exe` (optional) uploaded to `server/launcher-build/`
5. [ ] Firewall/port allows external access to the server port
6. [ ] Users can visit `https://yourserver.com/download` in browser
7. [ ] Users can download, run the installer, and it installs successfully

---

## Build Commands Summary

| Command | What It Does |
|---|---|
| `npm run build:zip` | Zips launcher app files → `server/launcher-build/latest.zip` |
| `npm run build:installer` | Builds the installer exe → `installer/dist/String Client Setup 1.0.0.exe` |
| `npm run electron:build:portable` | Builds the full launcher portable exe (for direct use, not installer) |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Download page says "No download available yet" | Upload a `.exe` file to `server/launcher-build/` |
| Installer says "Download failed" | Check server is running, `latest.zip` exists, and `/api/launcher/download` is accessible |
| Installer says "Dependency install failed" | npm might not be installed on the target machine, or network issue |
| Launcher doesn't start after install | Check `resources/app/` has `main.js`, `package.json`, and `node_modules/` |
