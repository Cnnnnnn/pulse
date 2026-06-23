/**
 * src/main/version-history.js
 *
 * 2026-06-14: App rollback · version history layer.
 *
 * Thin helper over state-store's version_history 字段. 职责单一:
 *   - recordUpgrade(appName, entry, statePath?) → unshift + cap 2, 写盘
 *   - listHistory(appName, statePath?)         → 单 app 历史 (倒序)
 *   - deleteEntry(appName, to, statePath?)      → 删单条, 返回 freed bytes
 *   - getTotalSize(statePath?)                 → 跨所有 app 累加 sizeBytes
 *
 * cap 设计: state 数组 cap 2, fs prune 由调用方负责 (e.g. backup.pruneOldBackups).
 * 这样 version-history 不知道 backups 目录在哪, 保持解耦.
 *
 * 不在 worker: 全是同步 IO (read/write state.json), 没有重活.
 *
 * 设计: 每个函数接受可选 statePath 参数 (传则用, 不传走 defaultPath), 跟
 * state-store 的 load/saveAll 等保持一致. 这样测试无需 hook global state.
 */

const stateStore = require("./state-store");

const HISTORY_CAP = 2;

function getAll(statePath = stateStore.defaultPath()) {
  return stateStore.getVersionHistory(statePath) || {};
}

/**
 * 把一条升级记录塞到 app 历史最前 (unshift), cap 2 截断.
 * @param {string} appName
 * @param {{from:string, to:string, at:number, backupPath:string, source:string, sizeBytes:number}} entry
 * @param {string} [statePath]
 */
function recordUpgrade(appName, entry, statePath = stateStore.defaultPath()) {
  if (!appName || typeof appName !== "string") {
    throw new TypeError("recordUpgrade: appName must be non-empty string");
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("recordUpgrade: entry must be plain object");
  }
  const vh = getAll(statePath);
  if (!vh[appName]) vh[appName] = [];
  vh[appName].unshift(entry);
  vh[appName] = vh[appName].slice(0, HISTORY_CAP);
  stateStore.saveVersionHistory(vh, statePath);
}

/**
 * 单 app 历史 (倒序: 0 是当前装的版本).
 * @param {string} appName
 * @param {string} [statePath]
 * @returns {Array}
 */
function listHistory(appName, statePath = stateStore.defaultPath()) {
  return getAll(statePath)[appName] || [];
}

/**
 * 删 (appName, to) 一条; 删完如果该 app 数组空, 把 app 键也删了.
 * 返 sizeBytes (估算值, fs 实际删由调用方负责).
 * @param {string} appName
 * @param {string} toVersion
 * @param {string} [statePath]
 * @returns {number} freed bytes (0 if not found)
 */
function deleteEntry(appName, toVersion, statePath = stateStore.defaultPath()) {
  const vh = getAll(statePath);
  const list = vh[appName] || [];
  const idx = list.findIndex((e) => e.to === toVersion);
  if (idx === -1) return 0;
  const freed = list[idx].sizeBytes || 0;
  vh[appName] = list.filter((_, i) => i !== idx);
  if (vh[appName].length === 0) delete vh[appName];
  stateStore.saveVersionHistory(vh, statePath);
  return freed;
}

/**
 * 跨所有 app 累加 sizeBytes.
 * @param {string} [statePath]
 * @returns {number} total bytes
 */
function getTotalSize(statePath = stateStore.defaultPath()) {
  const vh = getAll(statePath);
  let total = 0;
  for (const app of Object.keys(vh)) {
    for (const e of vh[app]) total += e.sizeBytes || 0;
  }
  return total;
}

module.exports = {
  HISTORY_CAP,
  recordUpgrade,
  listHistory,
  deleteEntry,
  getTotalSize,
};