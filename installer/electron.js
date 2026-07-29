const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawn } = require('child_process');
const AdmZip = require('adm-zip');

let win;

const APP_NAME = 'String Client';
const LAUNCHER_DOWNLOAD_URL = process.env.LAUNCHER_DOWNLOAD_URL || 'https://stringclient.com/api/launcher/download';

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 560,
    frame: false,
    resizable: false,
    transparent: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'installer-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'icon.ico'),
    title: 'String Client Setup',
    show: false,
  });

  win.loadFile(path.join(__dirname, 'dist-installer', 'index.html'));
  win.once('ready-to-show', () => win.show());
}

// ── Window Controls ──
ipcMain.on('win:minimize', () => { if (win) win.minimize(); });
ipcMain.on('win:close', () => { if (win) win.close(); });

// ── Download helper ──
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? require('https') : require('http');
    const file = fs.createWriteStream(dest);
    mod.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        const next = res.headers.location;
        if (!next) return reject(new Error('Redirect with no Location header'));
        return downloadFile(next, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      try { file.close(); } catch {}
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

// Copy only the Electron runtime (electron.exe, DLLs, locales) — NOT resources/app
function copyElectronRuntime(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    // Skip: resources/ (we create it fresh), node_modules, .git, installer artifacts
    if (
      entry.name === 'resources' ||
      entry.name === 'node_modules' ||
      entry.name === '.git' ||
      entry.name === 'dist-installer' ||
      entry.name === 'installer-build' ||
      entry.name.endsWith('.blockmap')
    ) continue;
    const s = path.join(src, entry.name);
    // Rename any .exe to electron.exe — portable exe renames itself
    const destName = entry.isFile() && entry.name.endsWith('.exe') && entry.name !== 'electron.exe'
      ? 'electron.exe' : entry.name;
    const d = path.join(dest, destName);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      try { fs.copyFileSync(s, d); } catch {}
    }
  }
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      try { fs.copyFileSync(s, d); } catch {}
    }
  }
}

// ── IPC Handlers ──

const DEFAULT_PATH = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Programs', APP_NAME
);

ipcMain.handle('install:check', () => {
  if (!fs.existsSync(DEFAULT_PATH)) return false;
  return fs.existsSync(path.join(DEFAULT_PATH, 'electron.exe'));
});

ipcMain.handle('install:get-default-path', () => DEFAULT_PATH);

ipcMain.handle('install:select-path', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Installation Directory',
    defaultPath: DEFAULT_PATH,
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('install:run', async (_, { installPath, desktopShortcut, startMenuShortcut }) => {
  const send = (msg) => { try { win.webContents.send('install:log', msg); } catch {} };

  try {
    const targetDir = installPath;
    const appDir = path.join(targetDir, 'resources', 'app');

    send('Verifying system requirements...');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    // Get the Electron runtime source — for portable exe this is the temp extraction dir
    let srcPath;
    if (app.isPackaged) {
      srcPath = path.dirname(process.resourcesPath);
    } else {
      srcPath = __dirname;
    }
    send(`  Source: ${srcPath}`);

    // Step 1: Copy Electron runtime (electron.exe, DLLs, locales — NOT resources/app)
    send('Copying launcher runtime...');
    copyElectronRuntime(srcPath, targetDir);
    send('  ✓ Runtime copied');

    // Step 2: Download launcher app from server
    send('Connecting to server...');
    let downloaded = false;
    try {
      send(`  URL: ${LAUNCHER_DOWNLOAD_URL}`);
      const zipDest = path.join(os.tmpdir(), 'string-client-launcher.zip');
      await downloadFile(LAUNCHER_DOWNLOAD_URL, zipDest);
      const zipSize = fs.statSync(zipDest).size;
      send(`  ✓ Downloaded ${(zipSize / 1024).toFixed(0)} KB`);

      // Step 3: Create resources/app and extract
      send('Extracting launcher files...');
      if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });
      try {
        const zip = new AdmZip(zipDest);
        zip.extractAllTo(appDir, true);
      } catch (zipErr) {
        // Fallback to PowerShell if adm-zip fails
        execSync(
          `powershell -NoProfile -Command "Expand-Archive -Path '${zipDest}' -DestinationPath '${appDir}' -Force"`,
          { timeout: 120000, shell: true }
        );
      }
      try { fs.unlinkSync(zipDest); } catch {}
      send('  ✓ Launcher files extracted');
      downloaded = true;
    } catch (e) {
      send(`  ⚠ Download failed: ${e.message}`);
    }

    if (!downloaded) {
      send('  ✗ Could not download launcher from server');
      send('  Installation cannot continue without server files.');
      send('  ✗ Installation failed');
      return { error: 'Download failed' };
    }

    // Verify package.json exists in app dir
    const pkgPath = path.join(appDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      send('  ✗ package.json not found after extraction');
      send('  ✗ Installation failed');
      return { error: 'Missing package.json' };
    }
    send(`  ✓ package.json found`);

    // Step 5: Find the Electron exe in the installed runtime
    let exePath = path.join(targetDir, 'electron.exe');
    if (!fs.existsSync(exePath)) {
      send('  ✗ electron.exe not found');
      return { error: 'Electron runtime not found' };
    }

    // Step 6: Create shortcuts
    send('Creating shortcuts...');

    // Find the launcher icon
    let iconPath = path.join(appDir, 'buildResources', 'icon.ico');
    if (!fs.existsSync(iconPath)) iconPath = path.join(appDir, 'buildResources', 'icon.png');
    if (!fs.existsSync(iconPath)) iconPath = exePath;

    function createShortcut(linkPath, targetExe, workDir, icon) {
      const psScript = path.join(os.tmpdir(), `mkshortcut-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
      const iconArg = icon.endsWith('.ico') ? `${icon},0` : icon;
      const ps = `$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${linkPath}'); $s.TargetPath = '${targetExe}'; $s.WorkingDirectory = '${workDir}'; $s.IconLocation = '${iconArg}'; $s.Save()`;
      // Write with UTF-8 BOM so PowerShell handles Unicode paths
      const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      fs.writeFileSync(psScript, Buffer.concat([bom, Buffer.from(ps, 'utf8')]));
      try {
        execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}"`, { timeout: 10000, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
        if (fs.existsSync(linkPath)) {
          return true;
        } else {
          send(`  ⚠ Shortcut file not found: ${linkPath}`);
          return false;
        }
      } catch (e) {
        send(`  ⚠ Shortcut error: ${e.message}`);
        return false;
      } finally {
        try { fs.unlinkSync(psScript); } catch {}
      }
    }

    if (desktopShortcut) {
      const desktopLnk = path.join(os.homedir(), 'Desktop', `${APP_NAME}.lnk`);
      send(`  Desktop: ${desktopLnk}`);
      const ok = createShortcut(desktopLnk, exePath, targetDir, iconPath);
      if (ok) send('  ✓ Desktop shortcut created');
    } else {
      send('  Skipping desktop shortcut');
    }

    if (startMenuShortcut) {
      const smPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', APP_NAME);
      if (!fs.existsSync(smPath)) fs.mkdirSync(smPath, { recursive: true });
      const smLnk = path.join(smPath, `${APP_NAME}.lnk`);
      send(`  Start Menu: ${smLnk}`);
      const ok = createShortcut(smLnk, exePath, targetDir, iconPath);
      if (ok) send('  ✓ Start Menu shortcut created');
    } else {
      send('  Skipping start menu shortcut');
    }

    // Step 7: Write registry entries
    send('Writing registry entries...');
    try {
      let pkgVer = '1.0.0';
      try { pkgVer = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version || pkgVer; } catch {}
      const uninstallKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME.replace(/\s/g, '')}`;
      execSync(`reg add "${uninstallKey}" /v "DisplayName" /t REG_SZ /d "${APP_NAME}" /f`, { timeout: 5000, stdio: 'ignore' });
      execSync(`reg add "${uninstallKey}" /v "DisplayVersion" /t REG_SZ /d "${pkgVer}" /f`, { timeout: 5000, stdio: 'ignore' });
      execSync(`reg add "${uninstallKey}" /v "Publisher" /t REG_SZ /d "String Client" /f`, { timeout: 5000, stdio: 'ignore' });
      execSync(`reg add "${uninstallKey}" /v "InstallLocation" /t REG_SZ /d "${targetDir.replace(/\//g, '\\')}" /f`, { timeout: 5000, stdio: 'ignore' });
      execSync(`reg add "${uninstallKey}" /v "DisplayIcon" /t REG_SZ /d "${exePath}" /f`, { timeout: 5000, stdio: 'ignore' });
      execSync(`reg add "${uninstallKey}" /v "UninstallString" /t REG_SZ /d "${exePath}" /f`, { timeout: 5000, stdio: 'ignore' });
      send('  ✓ Registry entries written');
    } catch {
      send('  ⚠ Registry write skipped');
    }

    send('');
    send('✓ Installation complete!');
    return { success: true };
  } catch (e) {
    send(`✗ Error: ${e.message}`);
    return { error: e.message };
  }
});

ipcMain.handle('install:launch', async (_, installPath) => {
  try {
    const targetDir = installPath || DEFAULT_PATH;
    const exePath = path.join(targetDir, 'electron.exe');
    if (!fs.existsSync(exePath)) {
      return { error: 'electron.exe not found at ' + exePath };
    }
    const child = spawn(exePath, [], {
      cwd: targetDir,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    setTimeout(() => app.exit(0), 500);
  } catch (e) {
    return { error: e.message };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
