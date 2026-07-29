const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'string-client-server.zip');

if (fs.existsSync(dest)) fs.unlinkSync(dest);

// Stage files in a temp dir with correct layout
const tmp = path.join(root, '_server_pack');
if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true });
fs.mkdirSync(tmp, { recursive: true });

// Copy server/ into temp
execSync(`xcopy /E /I /Q "${path.join(root, 'server')}" "${path.join(tmp, 'server')}"`, { stdio: 'ignore', shell: true });

// Copy launcher-build.zip into server/launcher-build/latest.zip
const lb = path.join(root, 'launcher-build.zip');
if (fs.existsSync(lb)) {
  const lbDir = path.join(tmp, 'server', 'launcher-build');
  fs.mkdirSync(lbDir, { recursive: true });
  fs.copyFileSync(lb, path.join(lbDir, 'latest.zip'));
} else {
  const lbAlt = path.join(root, 'server', 'launcher-build.zip');
  if (fs.existsSync(lbAlt)) {
    const lbDir = path.join(tmp, 'server', 'launcher-build');
    fs.mkdirSync(lbDir, { recursive: true });
    fs.copyFileSync(lbAlt, path.join(lbDir, 'latest.zip'));
  }
}

// Remove .env (contains secrets), keep .env.example
const envFile = path.join(tmp, 'server', '.env');
if (fs.existsSync(envFile)) fs.unlinkSync(envFile);

// Remove launcher-build.zip from server root (if present), put it in launcher-build/latest.zip instead
const oldLb = path.join(tmp, 'server', 'launcher-build.zip');
if (fs.existsSync(oldLb)) fs.unlinkSync(oldLb);

// Zip it
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${tmp}\\*' -DestinationPath '${dest}' -Force"`, { stdio: 'ignore', shell: true });

// Cleanup temp
fs.rmSync(tmp, { recursive: true });

console.log('Created: ' + dest);
const size = fs.statSync(dest).size;
console.log('Size: ' + (size / 1024 / 1024).toFixed(1) + ' MB');
