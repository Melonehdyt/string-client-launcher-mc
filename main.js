const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { loginWithMicrosoft, refreshMinecraftToken, checkSavedSession, loadRefreshSession } = require('./auth-main');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;
let mcProcess = null;
const DATA_DIR = path.join(app.getPath('userData'), 'String Client');

// TRANSPERENT-inspired directory structure
const DIRS = {
  data: DATA_DIR,
  backgrounds: path.join(DATA_DIR, 'backgrounds'),
  skins: path.join(DATA_DIR, 'skins'),
  jre: path.join(DATA_DIR, 'jre'),
  shared: path.join(DATA_DIR, 'shared'),
  versions: path.join(DATA_DIR, 'shared', 'versions'),
  libraries: path.join(DATA_DIR, 'shared', 'libraries'),
  assets: path.join(DATA_DIR, 'shared', 'assets'),
  assetsIndexes: path.join(DATA_DIR, 'shared', 'assets', 'indexes'),
  assetsObjects: path.join(DATA_DIR, 'shared', 'assets', 'objects'),
  profiles: path.join(DATA_DIR, 'profiles'),
  settings: path.join(DATA_DIR, 'settings'),
};
const ACCOUNTS_FILE = path.join(DIRS.settings, 'accounts.json');

function ensureDataDirs() {
  Object.values(DIRS).forEach(p => {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  });
}

// ── Custom Java Launcher (transperent-style) ──

function findJava(javaPath) {
  if (javaPath && fs.existsSync(javaPath)) return javaPath;
  // Check bundled JREs
  if (fs.existsSync(DIRS.jre)) {
    const jres = fs.readdirSync(DIRS.jre);
    for (const hash of jres) {
      const candidate = path.join(DIRS.jre, hash, 'bin', 'java.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return 'java'; // fallback to system PATH
}

function buildClasspath(jars) {
  return jars.join(path.delimiter);
}

function launchMinecraft(options) {
  return new Promise((resolve, reject) => {
    const {
      username, version, ram, javaPath, mcPath,
      mainClass, jarPaths, extraJvmArgs,
      accessToken, uuid, gameDir,
    } = options;

    const mem = parseInt(ram) || 4096;
    const java = findJava(javaPath);
    const nativesDir = path.join(DIRS.profiles, version || 'default', 'natives');

    // Build classpath from provided jars or use default structure
    let classpath;
    if (jarPaths && jarPaths.length > 0) {
      classpath = buildClasspath(jarPaths);
    } else {
      // Default: look for version jar in shared/versions/<version>/
      const versionDir = path.join(DIRS.versions, version || 'default');
      const jars = [];
      if (fs.existsSync(versionDir)) {
        fs.readdirSync(versionDir).filter(f => f.endsWith('.jar')).forEach(f => {
          jars.push(path.join(versionDir, f));
        });
      }
      // Add libraries from shared/libraries/
      const libDir = path.join(DIRS.libraries);
      if (fs.existsSync(libDir)) {
        function collectJars(dir) {
          if (!fs.existsSync(dir)) return;
          fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) collectJars(full);
            else if (entry.name.endsWith('.jar')) jars.push(full);
          });
        }
        collectJars(libDir);
      }
      classpath = buildClasspath(jars);
    }

    const jvmArgs = [
      `-Xms${Math.floor(mem / 2)}M`,
      `-Xmx${mem}M`,
      '-Djava.library.path=' + nativesDir,
      `-Dminecraft.client.jar=${jarPaths?.[0] || ''}`,
      ...(extraJvmArgs || []),
    ];

    if (!fs.existsSync(nativesDir)) {
      fs.mkdirSync(nativesDir, { recursive: true });
    }

    const mcArgs = [
      '--username', username || 'Player',
      '--version', version || '1.21',
      '--gameDir', gameDir || mcPath || path.join(DIRS.profiles, version || 'default'),
      '--assetsDir', DIRS.assets,
      '--uuid', uuid || '00000000-0000-0000-0000-000000000000',
      '--accessToken', accessToken || '0',
      '--userType', 'msa',
      '--versionType', 'release',
    ];

    const args = [...jvmArgs, '-cp', classpath, mainClass || 'net.minecraft.client.main.Main', ...mcArgs];

    const log = (msg) => {
      if (mainWindow) mainWindow.webContents.send('mc-log', msg);
    };

    log(`[Launcher] Java: ${java}`);
    log(`[Launcher] Classpath jars: ${jars ? jars.length : jarPaths?.length}`);
    log(`[Launcher] Main class: ${mainClass || 'net.minecraft.client.main.Main'}`);

    try {
      mcProcess = spawn(`"${java}"`, args, {
        cwd: gameDir || mcPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      mcProcess.stdout.on('data', (data) => {
        log(data.toString());
      });

      mcProcess.stderr.on('data', (data) => {
        log(data.toString());
      });

      mcProcess.on('error', (err) => {
        log(`[Launcher] Error: ${err.message}`);
        if (mainWindow) mainWindow.webContents.send('mc-error', err.message);
        mcProcess = null;
        reject(err);
      });

      mcProcess.on('exit', (code) => {
        log(`[Launcher] Process exited with code ${code}`);
        mcProcess = null;
      });

      resolve({ pid: mcProcess.pid });
    } catch (err) {
      reject(err);
    }
  });
}

// ── Electron Window ──

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    title: 'String Client',
    icon: path.join(__dirname, 'buildResources', 'icon-256.png'),
    backgroundColor: '#0b0b12',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.setIcon(nativeImage.createFromPath(path.join(__dirname, 'buildResources', 'icon-256.png')));

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    const headers = { ...details.responseHeaders }
    if (details.resourceType === 'mainFrame') {
      headers['Content-Security-Policy'] = ["default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: http: https: file:; media-src 'self' blob: http: https: file:; frame-src *; connect-src 'self' ws://localhost:3001 http://localhost:3001 ws://200.141.0.156:3000 http://200.141.0.156:3000 https://api.modrinth.com https://api.mineatar.io https://api.minecraftservices.com https://sessionserver.mojang.com https://mineskin.eu https://api.mojang.com https://textures.minecraft.net https://*.textures.minecraft.net https://pagead2.googlesyndication.com https://stringclient.com wss://stringclient.com; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com;"]
    }
    delete headers['Permissions-Policy']
    cb({ responseHeaders: headers })
  })

  // Provide a referrer for YouTube embed so Error 153 doesn't occur
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, cb) => {
    try {
      if (/youtube\.com|ytimg\.com/i.test(new URL(details.url).hostname)) {
        details.requestHeaders['Referer'] = 'https://string-client.app/'
      }
    } catch {}
    cb({ requestHeaders: details.requestHeaders })
  })

  const distPath = path.join(__dirname, 'dist', 'index.html');
  if (!app.isPackaged && !fs.existsSync(distPath)) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(distPath);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  ipcMain.on('window:minimize', () => mainWindow.minimize());
  ipcMain.on('window:maximize', () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('window:close', () => mainWindow.close());
  ipcMain.handle('open-external', async (_, url) => { shell.openExternal(url) });
}

// ── Data folder IPC ──

ipcMain.handle('data:get-path', () => DATA_DIR);
ipcMain.handle('data:get-dirs', () => DIRS);

ipcMain.handle('data:save-file', async (_, { subdir, name, dataUrl }) => {
  const dir = DIRS[subdir] || path.join(DATA_DIR, subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ext = dataUrl.split(';')[0].split('/')[1] || 'png';
  const filename = `${name}.${ext}`;
  const filePath = path.join(dir, filename);
  const base64 = dataUrl.split(',')[1];
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return { path: filePath, filename };
});

ipcMain.handle('data:delete-file', async (_, { subdir, name }) => {
  const dir = DIRS[subdir] || path.join(DATA_DIR, subdir);
  if (!fs.existsSync(dir)) return false;
  const files = fs.readdirSync(dir);
  const match = files.find(f => f.startsWith(name));
  if (match) { fs.unlinkSync(path.join(dir, match)); return true }
  return false;
});

ipcMain.handle('data:list-files', async (_, subdir) => {
  const dir = DIRS[subdir] || path.join(DATA_DIR, subdir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map(f => ({
    name: f.replace(/\.[^.]+$/, ''),
    filename: f,
    path: `file://${path.join(dir, f).replace(/\\/g, '/')}`,
  }));
});

ipcMain.handle('data:save-accounts', async (_, data) => {
  const dir = path.dirname(ACCOUNTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
});

ipcMain.handle('data:load-accounts', async () => {
  if (!fs.existsSync(ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
});

app.whenReady().then(() => {
  loadRefreshSession();
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.stringclient.launcher');
    const icoPath = path.join(__dirname, 'buildResources', 'icon-256.png');
    try {
      const ico = nativeImage.createFromPath(icoPath);
      if (!ico.isEmpty()) app.setUserTasks([{ program: process.execPath, arguments: '', iconPath: icoPath, iconIndex: 0, title: 'String Client', description: 'Launch String Client' }]);
    } catch {}
  }
  ensureDataDirs(); createWindow()
});
app.on('window-all-closed', () => {
  if (mcProcess) mcProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Auth
ipcMain.handle('auth:login', async () => {
  try {
    const profile = await loginWithMicrosoft();
    return { username: profile.username, uuid: profile.uuid, accessToken: profile.accessToken };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('auth:check', async () => {
  try {
    const session = await checkSavedSession();
    if (session) {
      // Try silent refresh to verify token is still valid
      try {
        const refreshed = await refreshMinecraftToken();
        return { ...session, accessToken: refreshed.accessToken };
      } catch {
        // Saved session exists but token expired — still return profile info
        return session;
      }
    }
    return null;
  } catch {
    return null;
  }
});

ipcMain.handle('auth:refresh', async () => {
  try {
    const result = await refreshMinecraftToken();
    return { accessToken: result.accessToken };
  } catch (e) {
    return { error: e.message };
  }
});

// Minecraft Directory
ipcMain.handle('select-minecraft-path', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Minecraft Directory',
  });
  return r.canceled ? null : r.filePaths[0];
});

// ── Launch (TRANSPERENT-style custom launcher) ──
ipcMain.handle('launch-minecraft', async (_, opts) => {
  const {
    username, version, ram, javaPath, mcPath,
    mainClass, jarPaths, extraJvmArgs,
    accessToken, uuid,
  } = opts;

  const mem = parseInt(ram) || 4096;
  const java = findJava(javaPath);
  const profileDir = path.join(DIRS.profiles, version || 'default');

  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  let classpath;
  if (jarPaths && jarPaths.length > 0) {
    classpath = jarPaths.join(path.delimiter);
  } else {
    const jars = [];
    // Collect version jars (profiles/<version>/libraries/java/)
    const libJava = path.join(profileDir, 'libraries', 'java');
    if (fs.existsSync(libJava)) {
      function collect(dir) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
          const f = path.join(dir, e.name);
          if (e.isDirectory()) collect(f);
          else if (e.name.endsWith('.jar')) jars.push(f);
        });
      }
      collect(libJava);
    }
    // Collect shared libraries
    const sharedLib = DIRS.libraries;
    if (fs.existsSync(sharedLib)) {
      function collectShared(dir) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
          const f = path.join(dir, e.name);
          if (e.isDirectory()) collectShared(f);
          else if (e.name.endsWith('.jar')) jars.push(f);
        });
      }
      collectShared(sharedLib);
    }
    // Add version jar from shared/versions/
    const verDir = path.join(DIRS.versions, version || 'default');
    if (fs.existsSync(verDir)) {
      fs.readdirSync(verDir).filter(f => f.endsWith('.jar')).forEach(f => {
        jars.push(path.join(verDir, f));
      });
    }
    classpath = jars.join(path.delimiter);
  }

  const nativesDir = path.join(profileDir, 'natives');
  if (!fs.existsSync(nativesDir)) fs.mkdirSync(nativesDir, { recursive: true });

  const jvmArgs = [
    `-Xms${Math.floor(mem / 2)}M`,
    `-Xmx${mem}M`,
    `-Djava.library.path=${nativesDir}`,
    ...(extraJvmArgs || []),
  ];

  const mcArgs = [
    '--username', username || 'Player',
    '--version', version || '1.21',
    '--gameDir', profileDir,
    '--assetsDir', DIRS.assets,
    '--uuid', uuid || '00000000-0000-0000-0000-000000000000',
    '--accessToken', accessToken || '0',
    '--userType', 'msa',
    '--versionType', 'release',
  ];

  const allArgs = [...jvmArgs, '-cp', classpath, mainClass || 'net.minecraft.client.main.Main', ...mcArgs];

  const send = (ch, msg) => { if (mainWindow) mainWindow.webContents.send(ch, msg) };
  send('mc-log', `[Launcher] Java: ${java}`);
  send('mc-log', `[Launcher] Main class: ${mainClass || 'net.minecraft.client.main.Main'}`);

  return new Promise((resolve, reject) => {
    try {
      mcProcess = spawn(`"${java}"`, allArgs, {
        cwd: profileDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      mcProcess.stdout.on('data', (d) => { send('mc-log', d.toString()) });
      mcProcess.stderr.on('data', (d) => { send('mc-data', d.toString()) });
      mcProcess.on('error', (err) => {
        send('mc-error', err.message);
        mcProcess = null;
        reject(err);
      });
      mcProcess.on('exit', (code) => {
        send('mc-log', `[Launcher] Exited with code ${code}`);
        mcProcess = null;
      });

      resolve({ pid: mcProcess.pid });
    } catch (err) {
      reject(err);
    }
  });
});

// Kill
ipcMain.handle('kill-minecraft', async () => {
  if (mcProcess) {
    mcProcess.kill();
    mcProcess = null;
    return true;
  }
  return false;
});

// ── Version / Profile Management (TRANSPERENT-style) ──

ipcMain.handle('mc:list-versions', async () => {
  const versions = [];
  if (fs.existsSync(DIRS.versions)) {
    fs.readdirSync(DIRS.versions, { withFileTypes: true }).forEach(e => {
      if (e.isDirectory()) versions.push(e.name);
    });
  }
  return versions;
});

ipcMain.handle('mc:list-profiles', async () => {
  const profiles = [];
  if (fs.existsSync(DIRS.profiles)) {
    fs.readdirSync(DIRS.profiles, { withFileTypes: true }).forEach(e => {
      if (e.isDirectory()) profiles.push(e.name);
    });
  }
  return profiles;
});

ipcMain.handle('mc:delete-profile', async (_, version) => {
  const dir = path.join(DIRS.profiles, version || '');
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }
  return false;
});

ipcMain.handle('mc:list-libraries', async (_, version) => {
  const jars = [];
  const dirs = [
    path.join(DIRS.profiles, version || 'default', 'libraries', 'java'),
    DIRS.libraries,
  ];
  dirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      function walk(d) {
        fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
          const f = path.join(d, e.name);
          if (e.isDirectory()) walk(f);
          else if (e.name.endsWith('.jar')) jars.push(f);
        });
      }
      walk(dir);
    }
  });
  return jars;
});

ipcMain.handle('mc:list-jres', async () => {
  const jres = [];
  if (fs.existsSync(DIRS.jre)) {
    fs.readdirSync(DIRS.jre, { withFileTypes: true }).forEach(e => {
      if (e.isDirectory()) {
        const javaExe = path.join(DIRS.jre, e.name, 'bin', 'java.exe');
        if (fs.existsSync(javaExe)) {
          jres.push({ hash: e.name, path: javaExe });
        }
      }
    });
  }
  return jres;
});

// ── Discord Rich Presence ──
let discordRpc = null;
let discordReady = false;

ipcMain.handle('discord:start', async (_, activity) => {
  try {
    if (discordRpc) { try { discordRpc.destroy() } catch {} }
    const DiscordRPC = require('discord-rpc');
    const clientId = '1528534548940456116';
    const client = new DiscordRPC.Client({ transport: 'ipc' });
    discordReady = false;
    await new Promise((resolve, reject) => {
      client.on('ready', () => {
        discordReady = true;
        if (activity) {
          client.setActivity(activity).catch(() => {});
        }
        resolve();
      });
      client.login({ clientId }).catch(err => { discordRpc = null; discordReady = false; reject(err) });
    });
    discordRpc = client;
    return true;
  } catch { return false }
});

ipcMain.handle('discord:update', async (_, activity) => {
  if (!discordRpc || !discordReady) return false;
  try {
    await discordRpc.setActivity(activity);
    return true;
  } catch { return false }
});

ipcMain.handle('discord:stop', async () => {
  if (!discordRpc) return;
  discordReady = false;
  try { discordRpc.destroy() } catch {}
  discordRpc = null;
});

// ── Installer IPC ──
const APP_NAME = 'String Client';
const INSTALL_MARKER = path.join(DATA_DIR, '.installed');

ipcMain.handle('install:check', async () => {
  return fs.existsSync(INSTALL_MARKER);
});

ipcMain.handle('install:get-default-path', async () => {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', APP_NAME);
});

ipcMain.handle('install:select-path', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Installation Directory',
    defaultPath: path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', APP_NAME),
  });
  return r.canceled ? null : r.filePaths[0];
});

const LAUNCHER_DOWNLOAD_URL = process.env.LAUNCHER_DOWNLOAD_URL || 'http://localhost:3000/api/launcher/download';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const mod = url.startsWith('https:') ? require('https') : require('http');
    mod.get(url, res => {
      if (res.statusCode !== 200) { reject(new Error(`Server returned HTTP ${res.statusCode}`)); return }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve() });
    }).on('error', err => { file.close(); try { fs.unlinkSync(dest) } catch {}; reject(err) });
  });
}

ipcMain.handle('install:run', async (_, { installPath, desktopShortcut, startMenuShortcut }) => {
  const send = (msg) => { try { mainWindow.webContents.send('install:log', msg) } catch {} };
  try {
    const isDev = !app.isPackaged;
    const targetDir = installPath;
    let pkgVer = '1.0.0';
    try { pkgVer = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8')).version || pkgVer } catch {}

    send('Verifying system requirements...');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    if (isDev) {
      // Dev mode: copy files locally for fast iteration
      send('Copying application files...');
      function copyRecursive(src, dest) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.opencode' || entry.name === 'win-unpacked' || entry.name === 'builder-debug.yml' || entry.name.endsWith('.blockmap')) continue;
          const s = path.join(src, entry.name);
          const d = path.join(dest, entry.name);
          if (entry.isDirectory()) copyRecursive(s, d);
          else fs.copyFileSync(s, d);
        }
      }
      copyRecursive(__dirname, targetDir);
    } else {
      // Packaged mode: copy Electron runtime + bundled files, then download app files from server
      const srcPath = path.dirname(app.getPath('exe'));
      send('Copying launcher runtime...');
      function copyRecursive(src, dest) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name.endsWith('.blockmap')) continue;
          const s = path.join(src, entry.name);
          const d = path.join(dest, entry.name);
          if (entry.isDirectory()) copyRecursive(s, d);
          else fs.copyFileSync(s, d);
        }
      }
      copyRecursive(srcPath, targetDir);

      try {
        send('Downloading latest launcher from server...');
        const zipDest = path.join(os.tmpdir(), 'string-client-launcher.zip');
        await downloadFile(LAUNCHER_DOWNLOAD_URL, zipDest);
        send('Extracting...');
        const extractDir = path.join(targetDir, 'resources', 'app');
        if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });
        execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipDest}' -DestinationPath '${extractDir}' -Force"`, { timeout: 60000, shell: true });
        try { fs.unlinkSync(zipDest) } catch {}
      } catch { send('  ⚠ Server download failed — using bundled version'); }
    }

    send('Installing dependencies...');
    try {
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      execSync(`${npm} install --omit=dev`, { cwd: targetDir, timeout: 120000, shell: true });
      send('  ✓ Dependencies installed');
    } catch (e) { send('  ⚠ Dependency install failed: ' + (e.message || e)); }

    let exePath = path.join(targetDir, 'node_modules', 'electron', 'dist', 'electron.exe');
    if (!fs.existsSync(exePath)) {
      exePath = path.join(targetDir, path.basename(app.getPath('exe'))).replace(/\//g, '\\');
    }

    send('Creating shortcuts...');
    const shortcutArgs = exePath.endsWith('electron.exe') ? `"${targetDir}"` : '';
    const shortcutWorkDir = targetDir.replace(/'/g, "''");
    if (desktopShortcut) {
      try {
        const desktopLnk = path.join(os.homedir(), 'Desktop', `${APP_NAME}.lnk`);
        execSync(`powershell -Command "$ws=New-Object -ComObject WScript.Shell;$s=$ws.CreateShortcut('${desktopLnk.replace(/'/g, "''")}');$s.TargetPath='${exePath.replace(/'/g, "''")}';$s.Arguments='${shortcutArgs}';$s.WorkingDirectory='${shortcutWorkDir}';$s.Save()"`, { timeout: 10000, shell: true, stdio: 'ignore' });
        send('  ✓ Desktop shortcut created');
      } catch { send('  ✗ Desktop shortcut failed'); }
    }

    if (startMenuShortcut) {
      try {
        const smPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', APP_NAME);
        if (!fs.existsSync(smPath)) fs.mkdirSync(smPath, { recursive: true });
        const smLnk = path.join(smPath, `${APP_NAME}.lnk`);
        execSync(`powershell -Command "$ws=New-Object -ComObject WScript.Shell;$s=$ws.CreateShortcut('${smLnk.replace(/'/g, "''")}');$s.TargetPath='${exePath.replace(/'/g, "''")}';$s.Arguments='${shortcutArgs}';$s.WorkingDirectory='${shortcutWorkDir}';$s.Save()"`, { timeout: 10000, shell: true, stdio: 'ignore' });
        send('  ✓ Start Menu shortcut created');
      } catch { send('  ✗ Start Menu shortcut failed'); }
    }

    send('Writing registry entries...');
    try {
      const uninstallKey = `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME.replace(/\s/g, '')}`;
      execSync(`reg add "${uninstallKey}" /v "DisplayName" /t REG_SZ /d "${APP_NAME}" /f`, { timeout: 5000, stdio: 'ignore' });
      execSync(`reg add "${uninstallKey}" /v "DisplayVersion" /t REG_SZ /d "${pkgVer}" /f`, { timeout: 5000, stdio: 'ignore' });
      execSync(`reg add "${uninstallKey}" /v "Publisher" /t REG_SZ /d "String Client" /f`, { timeout: 5000, stdio: 'ignore' });
      execSync(`reg add "${uninstallKey}" /v "InstallLocation" /t REG_SZ /d "${targetDir.replace(/\//g, '\\')}" /f`, { timeout: 5000, stdio: 'ignore' });
      execSync(`reg add "${uninstallKey}" /v "DisplayIcon" /t REG_SZ /d "${exePath}" /f`, { timeout: 5000, stdio: 'ignore' });
      execSync(`reg add "${uninstallKey}" /v "UninstallString" /t REG_SZ /d "${exePath}" /f`, { timeout: 5000, stdio: 'ignore' });
    } catch {}

    send('Finalizing installation...');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(INSTALL_MARKER, JSON.stringify({ installedAt: new Date().toISOString(), path: targetDir, version: pkgVer }));

    send('✓ Installation complete!');
    return { success: true };
  } catch (e) {
    send(`✗ Error: ${e.message}`);
    return { error: e.message };
  }
});

ipcMain.handle('install:launch', async (_, installPath) => {
  try {
    const targetDir = installPath || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', APP_NAME);
    // Try node_modules/electron (from npm install) first
    let exePath = path.join(targetDir, 'node_modules', 'electron', 'dist', 'electron.exe');
    if (fs.existsSync(exePath)) {
      spawn(exePath, [targetDir], { detached: true, stdio: 'ignore' });
      app.exit(0);
    }
    // Fallback: use the exe copied by copyRecursive (packaged mode)
    exePath = path.join(targetDir, path.basename(app.getPath('exe')));
    if (fs.existsSync(exePath)) {
      spawn(exePath, [targetDir], { detached: true, stdio: 'ignore' });
      app.exit(0);
    }
  } catch {}
});
