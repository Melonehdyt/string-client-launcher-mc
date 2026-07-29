# Server-Setup für den Installer-Download

## 1. Launcher Build hochladen

Damit der Installer die Launcher-Dateien von deinem Server laden kann, muss eine ZIP-Datei auf dem Server liegen.

**Build lokal erstellen:**
```bash
npm run build              # React UI bauen
npm run build:zip          # erzeugt launcher-build.zip (~690 KB)
```

**Build auf Server hochladen:**

Manuell: Kopiere `launcher-build.zip` auf den Server nach:
```
server/launcher-build/latest.zip
```

ODER per Deploy-Script (setze `BOT_TOKEN` Umgebungsvariable vorher):
```bash
set BOT_TOKEN=dein_bot_token_aus_der_env
npm run deploy:launcher
```

## 2. Dateien in der ZIP

Die ZIP (`launcher-build.zip`) enthält:
```
main.js              - Electron Main Process
preload.js           - Preload-Script
auth-main.js         - Microsoft-Authentifizierung
package.json         - Abhängigkeiten (für npm install)
dist/                - React-UI (vite build)
  index.html
  assets/
buildResources/
  icon-256.png       - App-Icon
```

**Nicht in der ZIP** (werden beim Build automatisch mitgeliefert):
- `node_modules/` → wird via `npm install --omit=dev` auf dem Zielrechner installiert
- Electron-Runtime → wird vom portablen Installer kopiert

## 3. Server-Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `GET` | `/api/launcher/download` | Lädt `latest.zip` herunter |
| `POST` | `/api/admin/launcher/upload` | Upload neuer Builds (Auth via `x-admin-token` Header) |

**Auth für Upload:** Der `x-admin-token` Header muss mit dem `BOT_TOKEN` aus der `.env` übereinstimmen.

## 4. Ordnerstruktur auf dem Server

```
server/
├── index.js                    - HTTP + WS Server
├── launcher-build/
│   └── latest.zip              ← Die Launcher-Build-ZIP
├── .env                        - BOT_TOKEN, etc.
└── ...
```

## 5. Nach jedem Update

```bash
npm run build           # React neu bauen
npm run build:zip       # ZIP erstellen
# ZIP auf Server kopieren (manuell oder per deploy)
```

Der portable `.exe`-Installer muss **nicht** neu gebaut werden – er lädt immer die aktuelle ZIP vom Server.
