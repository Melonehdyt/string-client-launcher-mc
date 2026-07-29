const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkInstalled: () => ipcRenderer.invoke('install:check'),
  getDefaultInstallPath: () => ipcRenderer.invoke('install:get-default-path'),
  selectInstallPath: () => ipcRenderer.invoke('install:select-path'),
  installApp: (opts) => ipcRenderer.invoke('install:run', opts),
  launchInstalled: (installPath) => ipcRenderer.invoke('install:launch', installPath),
  onInstallLog: (cb) => ipcRenderer.on('install:log', (_, msg) => cb(msg)),
  minimize: () => ipcRenderer.send('win:minimize'),
  close: () => ipcRenderer.send('win:close'),
});
