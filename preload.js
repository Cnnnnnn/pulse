const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig:       ()     => ipcRenderer.invoke('get-config'),
  getCachedState:  ()     => ipcRenderer.invoke('get-cached-state'),
  checkUpdates:    ()     => ipcRenderer.invoke('check-updates'),
  brewUpgrade:     (cask) => ipcRenderer.invoke('brew-upgrade', cask),
  brewUpdate:      ()     => ipcRenderer.invoke('brew-update'),
  getAppIcon:      (b)    => ipcRenderer.invoke('get-app-icon', b),
  openUrl:         (url)  => ipcRenderer.invoke('open-url', url),

  onCheckProgress: (cb) => ipcRenderer.on('check-progress', (_, data) => cb(data)),
  onStartCheck:    (cb) => ipcRenderer.on('start-check', () => cb()),
  onAutoCheckFinished: (cb) => ipcRenderer.on('auto-check-finished', (_, data) => cb(data)),

  // Bulk Upgrade (Phase 22)
  bulkUpgradeStart:  (items) => ipcRenderer.invoke('bulk-upgrade:start', items),
  bulkUpgradeCancel: ()      => ipcRenderer.invoke('bulk-upgrade:cancel'),
  onBulkUpgradeProgress: (cb) => ipcRenderer.on('bulk-upgrade:progress', (_, data) => cb(data)),
  onBulkUpgradeDone:     (cb) => ipcRenderer.on('bulk-upgrade:done', (_, data) => cb(data)),

  // Phase 27: Mutes (per-app 静音)
  getMutes:    ()                 => ipcRenderer.invoke('get-mutes'),
  setMute:     (name, durationSec) => ipcRenderer.invoke('set-mute', name, durationSec),
  clearMute:   (name)              => ipcRenderer.invoke('clear-mute', name),
});
