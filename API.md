# String Client Developer API

## Overview

String Client uses a Lunar Client-inspired directory structure for managing Minecraft versions, libraries, assets, and profiles. The Electron main process (`main.js`) exposes IPC handlers that the React renderer can call via `window.electronAPI`.

---

## Directory Structure

```
%APPDATA%/String Client/
├── backgrounds/            # Custom background images/videos
├── skins/                  # Saved Minecraft skins
├── jre/                    # Bundled Java runtimes (hash-named folders)
│   └── <hash>/
│       └── bin/java.exe
├── shared/
│   ├── versions/           # Minecraft version jars
│   │   └── <version>/
│   │       └── <version>.jar
│   ├── libraries/          # Maven-style library jars
│   │   └── <group>/
│   │       └── <artifact>/
│   │           └── <version>/
│   │               └── <artifact>-<version>.jar
│   └── assets/             # Minecraft game assets
│       ├── indexes/        # Asset index JSON files
│       └── objects/        # Asset object files (hash-stored)
├── profiles/               # Per-version game profiles
│   └── <version>/
│       ├── libraries/
│       │   └── java/       # Version-specific Java libraries
│       ├── natives/        # Extracted native libraries
│       ├── mods/           # Fabric/Forge mods
│       ├── config/         # Mod configuration files
│       └── options.txt     # Minecraft options
├── settings/
│   ├── accounts.json       # Saved Microsoft accounts
│   └── launcher.json       # Launcher configuration
```

---

## IPC API (Renderer → Main)

All IPC handlers are exposed via `window.electronAPI` in the renderer process.

### Auth

#### `login()`
Initiates Microsoft OAuth login flow.
- **Returns**: `{ username, uuid, accessToken }` or `{ error: string }`

### Launch

#### `launchMinecraft(options)`
Launches Minecraft using a Lunar Client-style Java classpath builder.
- **Options**:
  - `username` — Minecraft username
  - `uuid` — Player UUID
  - `accessToken` — Microsoft access token
  - `version` — Version string (e.g. `"1.21"`, `"26.2"`)
  - `ram` — Memory in MB (default 4096)
  - `javaPath` — Custom Java executable path
  - `mcPath` — Game directory override
  - `mainClass` — Main class (default `net.minecraft.client.main.Main`)
  - `jarPaths` — Array of jar paths for custom classpath
  - `extraJvmArgs` — Array of additional JVM arguments
- **Returns**: `{ pid: number }`
- **Emits**: `mc-log`, `mc-data`, `mc-error` events

#### `killMinecraft()`
Kills the running Minecraft process.
- **Returns**: `boolean`

### Classpath Resolution (Lunar-style)

When `jarPaths` is NOT provided, the launcher automatically builds the classpath:

1. **Version jars** from `shared/versions/<version>/*.jar`
2. **Profile libraries** from `profiles/<version>/libraries/java/` (recursive)
3. **Shared libraries** from `shared/libraries/` (recursive, Maven layout)

The JVM is resolved in order:
1. Custom `javaPath` if provided
2. Any JRE in `jre/<hash>/bin/java.exe`
3. System `java` PATH fallback

### Version & Profile Management

#### `listVersions()`
Lists version directories in `shared/versions/`.
- **Returns**: `string[]`

#### `listProfiles()`
Lists profile directories in `profiles/`.
- **Returns**: `string[]`

#### `listLibraries(version)`
Lists all jar files in the profile + shared libraries.
- **Returns**: `string[]` (absolute paths)

#### `listJres()`
Lists installed Java runtimes.
- **Returns**: `{ hash, path }[]`

### Data Storage

#### `saveFile({ subdir, name, dataUrl })`
Saves a file from a data URL to a subdirectory.
- `subdir` — key from DIRS map (`backgrounds`, `skins`, etc.) or raw path
- **Returns**: `{ path, filename }`

#### `deleteFile({ subdir, name })`
Deletes a file from a subdirectory.

#### `listFiles(subdir)`
Lists files in a subdirectory.
- **Returns**: `{ name, filename, path }[]`

#### `getDataPath()`
Returns the root data directory path.

#### `getDirs()`
Returns the full DIRS map with all subdirectory paths.

#### `saveAccounts(data)` / `loadAccounts()`
Persists Microsoft account data to `settings/accounts.json`.

### Window Controls

- `minimize()` — Minimize window
- `maximize()` — Toggle maximize
- `close()` — Close window
- `openExternal(url)` — Open URL in system browser

### Events (Main → Renderer)

- `onMcLog(callback)` — `(message: string)` Minecraft log output
- `onMcData(callback)` — `(data: string)` Minecraft stdout data
- `onMcError(callback)` — `(error: string)` Minecraft errors

---

## Adding a New Version (Lunar-style)

1. Create `shared/versions/<version>/<version>.jar` — the main version jar
2. Add libraries to `shared/libraries/<group>/<artifact>/<version>/<artifact>-<version>.jar`
3. Create `profiles/<version>/` for profile-specific data
4. Add profile libraries to `profiles/<version>/libraries/java/`
5. Launch with: `electronAPI.launchMinecraft({ version: "<version>", username, uuid, accessToken, ram: 4096 })`

## Updating the Launcher

The launcher supports a version manifest system. To add update support:

1. Host a `versions.json` manifest at your update URL:
```json
[
  {
    "id": "1.0.0",
    "url": "https://cdn.example.com/string-client/versions/1.0.0.jar",
    "libraries": [
      "https://cdn.example.com/string-client/libraries/lwjgl-3.4.1.jar"
    ],
    "releaseDate": "2026-01-15"
  }
]
```

2. In the renderer, fetch the manifest and download jars:
```js
const manifest = await fetch('https://cdn.example.com/versions.json').then(r => r.json())
const version = manifest[0]
const jarPath = await electronAPI.saveFile({ subdir: 'versions', name: version.id, dataUrl: await fetch(version.url).then(r => r.blob()).then(b => /* blob to dataUrl */) })
```

3. Or use the `minecraft-launcher-core` for standard Mojang version manifest support (kept as fallback).

---

## Events Reference

| Channel | Direction | Payload | Description |
|---------|-----------|---------|-------------|
| `auth:login` | renderer→main | — | Triggers Microsoft OAuth |
| `launch-minecraft` | renderer→main | `LaunchOptions` | Launches game process |
| `kill-minecraft` | renderer→main | — | Kills game process |
| `mc:list-versions` | renderer→main | — | Lists installed versions |
| `mc:list-profiles` | renderer→main | — | Lists game profiles |
| `mc:list-libraries` | renderer→main | `version` | Lists libraries for a version |
| `mc:list-jres` | renderer→main | — | Lists installed Java runtimes |
| `data:save-file` | renderer→main | `SaveOptions` | Persists a file to disk |
| `data:delete-file` | renderer→main | `DeleteOptions` | Removes a file from disk |
| `data:list-files` | renderer→main | `subdir` | Lists files in subdirectory |
| `mc-log` | main→renderer | `string` | Game log output |
| `mc-data` | main→renderer | `string` | Game stdout data |
| `mc-error` | main→renderer | `string` | Game error messages |
| `window:minimize` | renderer→main | — | Minimize window |
| `window:maximize` | renderer→main | — | Toggle maximize |
| `window:close` | renderer→main | — | Close window |
| `open-external` | renderer→main | `url` | Open URL in browser |
