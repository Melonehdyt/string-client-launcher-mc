const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { loginWithMicrosoft, refreshMinecraftToken } = require('./auth-main');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;
let mcProcess = null;
const DATA_DIR = path.join(app.getPath('userData'), 'String Client');

// Lunar-inspired directory structure
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

// ── Custom Java Launcher (Lunar-style) ──

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
    icon: nativeImage.createFromPath(path.join(__dirname, 'buildResources', 'icon.png')),
    backgroundColor: '#0b0b12',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.setIcon(nativeImage.createFromPath(path.join(__dirname, 'buildResources', 'icon.png')));

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
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.stringclient.launcher');
    const icoPath = path.join(__dirname, 'buildResources', 'icon.ico');
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

// ── Launch (Lunar-style custom launcher) ──
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

// ── Version / Profile Management (Lunar-style) ──

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
