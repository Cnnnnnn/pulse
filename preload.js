const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
 getConfig: () => ipcRenderer.invoke('get-config'),
 getCachedState: () => ipcRenderer.invoke('get-cached-state'),
 checkUpdates: () => ipcRenderer.invoke('check-updates'),
 brewUpgrade: (cask) => ipcRenderer.invoke('brew-upgrade', cask),
 brewUpdate: () => ipcRenderer.invoke('brew-update'),
 getAppIcon: (b) => ipcRenderer.invoke('get-app-icon', b),
 openUrl: (url) => ipcRenderer.invoke('open-url', url),

 onCheckProgress: (cb) => ipcRenderer.on('check-progress', (_, data) => cb(data)),
 onStartCheck: (cb) => ipcRenderer.on('start-check', () => cb()),
 onAutoCheckFinished: (cb) => ipcRenderer.on('auto-check-finished', (_, data) => cb(data)),

 // Bulk Upgrade (Phase22)
 bulkUpgradeStart: (items) => ipcRenderer.invoke('bulk-upgrade:start', items),
 bulkUpgradeCancel: () => ipcRenderer.invoke('bulk-upgrade:cancel'),
 onBulkUpgradeProgress: (cb) => ipcRenderer.on('bulk-upgrade:progress', (_, data) => cb(data)),
 onBulkUpgradeDone: (cb) => ipcRenderer.on('bulk-upgrade:done', (_, data) => cb(data)),

 // Phase27: Mutes (per-app静音)
 getMutes: () => ipcRenderer.invoke('get-mutes'),
 setMute: (name, durationSec) => ipcRenderer.invoke('set-mute', name, durationSec),
 clearMute: (name) => ipcRenderer.invoke('clear-mute', name),

 // Phase29: Last-opened (per-app 最近打开)
 getLastOpened: () => ipcRenderer.invoke('get-last-opened'),
 refreshLastOpened: () => ipcRenderer.invoke('refresh-last-opened'),
 onLastOpenedUpdated: (cb) => ipcRenderer.on('last-opened-updated', (_, data) => cb(data)),

 // Phase A (App Categorization): active category tab
 getActiveCategory: () => ipcRenderer.invoke('get-active-category'),
 saveActiveCategory: (id) => ipcRenderer.invoke('save-active-category', id),

 // Phase B4 (AI Sessions Daily Digest):手动 rerun / backfill / get current
 rerunDigest: (opts) => ipcRenderer.invoke('ai-sessions:rerun', opts),
 backfillDigest: (days) => ipcRenderer.invoke('ai-sessions:backfill', days),
 getCurrentDigest: () => ipcRenderer.invoke('ai-sessions:get-current'),
 onDigestUpdated: (cb) => ipcRenderer.on('ai-digest-updated', (_, data) => cb(data)),
 onDigestProgress: (cb) => ipcRenderer.on('ai-digest-progress', (_, data) => cb(data)),

 // Phase B6c (AI Sessions Settings): safeStorage API key + config
 setAiKey: (providerId, apiKey) => ipcRenderer.invoke('ai-sessions:set-key', providerId, apiKey),
 clearAiKey: (providerId) => ipcRenderer.invoke('ai-sessions:clear-key', providerId),
 hasAiKey: (providerId) => ipcRenderer.invoke('ai-sessions:has-key', providerId),
 aiHealthcheck: (opts) => ipcRenderer.invoke('ai-sessions:healthcheck', opts),
 getAiSessionsConfig: () => ipcRenderer.invoke('ai-sessions:get-config'),
 saveAiSessionsConfig: (cfg) => ipcRenderer.invoke('ai-sessions:save-config', cfg),
 onAiSessionsConfigUpdated: (cb) => ipcRenderer.on('ai-sessions-config-updated', (_, data) => cb(data)),
});
