const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

const tmp = path.join(process.env.TEMP, 'sc-min');
const out = path.join(__dirname, '..', 'server', 'launcher-build', 'latest.zip');

console.log('Creating zip from:', tmp);

const zip = new AdmZip();

// node_modules
zip.addLocalFolder(path.join(tmp, 'node_modules'), 'node_modules');

// app files
for (const f of ['main.js', 'preload.js', 'auth-main.js', 'package.json']) {
  const fp = path.join(tmp, f);
  if (fs.existsSync(fp)) zip.addLocalFile(fp, '');
}

// dist — only the web frontend, NOT win-unpacked or .exe files
const distDir = path.join(tmp, 'dist');
function addDistEntries(base, zipBase) {
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (entry.name === 'win-unpacked' || entry.name === 'installer-build') continue;
    if (entry.name.endsWith('.exe') || entry.name.endsWith('.exe.blockmap') || entry.name.endsWith('.yml') || entry.name.endsWith('.log')) continue;
    const full = path.join(base, entry.name);
    const target = path.join(zipBase, entry.name);
    if (entry.isDirectory()) {
      zip.addLocalFolder(full, target);
    } else {
      zip.addLocalFile(full, zipBase);
    }
  }
}
addDistEntries(distDir, 'dist');

// buildResources
zip.addLocalFolder(path.join(tmp, 'buildResources'), 'buildResources');

if (fs.existsSync(out)) fs.unlinkSync(out);
zip.writeZip(out);
console.log('Created:', out, '(' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
