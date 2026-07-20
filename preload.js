const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  login: () => ipcRenderer.invoke('auth:login'),
  launchMinecraft: (o) => ipcRenderer.invoke('launch-minecraft', o),
  killMinecraft: () => ipcRenderer.invoke('kill-minecraft'),
  selectMinecraftPath: () => ipcRenderer.invoke('select-minecraft-path'),

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Events
  onMcLog: (cb) => { ipcRenderer.on('mc-log', (_, m) => cb(m)); },
  onMcData: (cb) => { ipcRenderer.on('mc-data', (_, m) => cb(m)); },
  onMcError: (cb) => { ipcRenderer.on('mc-error', (_, m) => cb(m)); },

  // Open URL in default browser
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Data folder
  getDataPath: () => ipcRenderer.invoke('data:get-path'),
  getDirs: () => ipcRenderer.invoke('data:get-dirs'),
  saveFile: (opts) => ipcRenderer.invoke('data:save-file', opts),
  deleteFile: (opts) => ipcRenderer.invoke('data:delete-file', opts),
  listFiles: (subdir) => ipcRenderer.invoke('data:list-files', subdir),
  saveAccounts: (data) => ipcRenderer.invoke('data:save-accounts', data),
  loadAccounts: () => ipcRenderer.invoke('data:load-accounts'),

  // Lunar-style version / profile management
  listVersions: () => ipcRenderer.invoke('mc:list-versions'),
  listProfiles: () => ipcRenderer.invoke('mc:list-profiles'),
  listLibraries: (v) => ipcRenderer.invoke('mc:list-libraries', v),
  listJres: () => ipcRenderer.invoke('mc:list-jres'),
  deleteProfile: (version) => ipcRenderer.invoke('mc:delete-profile', version),
});
