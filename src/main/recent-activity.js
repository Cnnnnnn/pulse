/**
 * src/main/recent-activity.js
 *
 * v2.11 最近时间线 (Recent Activity) — store + 折叠去重
 *
 * 模式跟 src/main/worldcup/bets-store.js 一致:
 *   - 走 state-store.load / writeAtomic (同进程复用, atomic write)
 *   - 顶层 state.json.recentActivity[] = array of RecentActivityEntry
 *   - cap 走 config.json.recentActivity.maxEntries (默认 200, 范围 [50, 1000])
 *
 * 折叠去重:
 *   - 5 分钟内同 kind+ref 的不新 push, 在原 entry 上 count+1, lastTs 更新
 *   - 超出 cap 从头裁
 *
 * 写入入口:
 *   - 主进程 IPC 'recent:push' (renderer 调, 主进程落盘)
 *   - 推 IPC 'recent:updated' 事件给 renderer (让 modal 实时刷新)
 */

const fs = require("fs");
const stateStore = require("./state-store");
const { mainLog } = require("./log");

const VALID_KINDS = [
  "app-upgrade",
  "app-check",
  "reminder-create",
  "reminder-fire",
  "reminder-done",
  "reminder-dismissed",
  "worldcup-match-view",
  "fund-view",
  "ithome-view",
  "ithome-favorite",
  "settings-open",
];

const DEFAULT_MAX_ENTRIES = 200;
const MIN_MAX_ENTRIES = 50;
const MAX_MAX_ENTRIES = 1000;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

let _onUpdate = null; // push 后回调, 推 IPC 事件
let _cachedConfig = null; // config.json 缓存, 避免每次 push 都读盘
let _cachedConfigAt = 0;
const CONFIG_TTL_MS = 5_000;

// ── 内部 helpers ──────────────────────────────────────────

function _readStateRaw(statePath) {
  const p = statePath || stateStore.defaultPath();
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return {};
    return j;
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    mainLog.warn("[recent-activity] state read failed, treating as empty", {
      msg: err && err.message,
    });
    return {};
  }
}

function _withStateShell(raw) {
  const base = raw && typeof raw === "object" ? { ...raw } : {};
  if (!base.v) base.v = stateStore.SCHEMA_VERSION;
  if (!base.apps || typeof base.apps !== "object") base.apps = {};
  if (!base.mutes || typeof base.mutes !== "object") base.mutes = {};
  return base;
}

function _validateEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return { ok: false, reason: "invalid_input" };
  }
  if (typeof entry.kind !== "string" || !VALID_KINDS.includes(entry.kind)) {
    return { ok: false, reason: "invalid_kind" };
  }
  if (typeof entry.ref !== "string" || entry.ref.length === 0) {
    return { ok: false, reason: "invalid_ref" };
  }
  if (entry.ref.length > 500) {
    return { ok: false, reason: "ref_too_long" };
  }
  if (typeof entry.label !== "string" || entry.label.length === 0) {
    return { ok: false, reason: "invalid_label" };
  }
  if (entry.label.length > 500) {
    return { ok: false, reason: "label_too_long" };
  }
  return { ok: true };
}

/**
 * 读 config.json 的 recentActivity.maxEntries.
 * 缺省 200, 范围 [50, 1000] 钳制. 缓存 5s, 避免每次 push 都读盘.
 * @param {string} [configPath]  注入便于测试
 * @param {number} [now]         注入便于测试
 * @returns {number}
 */
function _getMaxEntries(configPath, now) {
  const t = (typeof now === "number") ? now : Date.now();
  if (
    _cachedConfig &&
    configPath === _cachedConfig.path &&
    (t - _cachedConfigAt) < CONFIG_TTL_MS
  ) {
    return _cachedConfig.max;
  }
  let raw = {};
  try {
    const path = configPath || _defaultConfigPath();
    if (path) {
      raw = JSON.parse(fs.readFileSync(path, "utf-8"));
    }
  } catch {
    /* noop */
  }
  let max = DEFAULT_MAX_ENTRIES;
  const v = raw && raw.recentActivity && raw.recentActivity.maxEntries;
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v < MIN_MAX_ENTRIES || v > MAX_MAX_ENTRIES) {
      // 越界 → 走 default (用户配错别覆盖成奇怪的边界值)
      max = DEFAULT_MAX_ENTRIES;
    } else {
      max = v;
    }
  }
  _cachedConfig = { path: configPath, max };
  _cachedConfigAt = t;
  return max;
}

let _defaultConfigPath = null;
function _setupDefaultConfigPath(fn) {
  _defaultConfigPath = fn;
}

function _normalizeEntry(e) {
  if (!e || typeof e !== "object") return null;
  if (typeof e.kind !== "string" || !VALID_KINDS.includes(e.kind)) return null;
  if (typeof e.ref !== "string" || e.ref.length === 0) return null;
  if (typeof e.label !== "string" || e.label.length === 0) return null;
  return {
    ts: typeof e.ts === "number" ? e.ts : Date.now(),
    kind: e.kind,
    ref: e.ref,
    label: e.label,
    meta: e.meta && typeof e.meta === "object" ? e.meta : undefined,
    count: typeof e.count === "number" && e.count > 0 ? e.count : undefined,
    lastTs: typeof e.lastTs === "number" ? e.lastTs : undefined,
  };
}

function _normalizeAll(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(_normalizeEntry).filter(Boolean);
}

// ── 纯函数: 折叠 + 裁 ─────────────────────────────────

/**
 * 纯函数: 给定现有 entries + 新 entry, 算下一个 entries 数组.
 * - 同 kind+ref 且 lastTs 在 5min 内 → 折叠: count+1, lastTs 更新
 * - 否则推入队首
 * - 超过 cap 从尾部裁
 *
 * @param {RecentActivityEntry[]} entries
 * @param {RecentActivityEntry} entry
 * @param {number} now
 * @param {number} max
 * @returns {{ entries: RecentActivityEntry[], deduped: boolean }}
 */
function _dedupAndPush(entries, entry, now, max) {
  const cap = Math.max(MIN_MAX_ENTRIES, Math.min(MAX_MAX_ENTRIES, max || DEFAULT_MAX_ENTRIES));
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (
      e &&
      e.kind === entry.kind &&
      e.ref === entry.ref &&
      typeof e.ts === "number" &&
      Math.abs(entry.ts - e.ts) < DEDUP_WINDOW_MS
    ) {
      // 折叠: 原地 count+1, ts 用最新一次 push 的 entry.ts (保持事件时间序列), lastTs 留老 ts
      const next = entries.slice();
      next[i] = {
        ...e,
        ts: entry.ts,
        count: typeof e.count === "number" ? e.count + 1 : 2,
        lastTs: e.ts,
      };
      return { entries: next, deduped: true };
    }
  }
  // 不折叠, 推入队首, 裁到 cap
  const next = [entry, ...entries];
  if (next.length > cap) {
    next.length = cap;
  }
  return { entries: next, deduped: false };
}

// ── 公开 API ──────────────────────────────────────────

/**
 * 读 entries. 兼容老 state.json (无 recentActivity 字段) → [].
 * @param {object} [opts]
 * @param {string} [opts.statePath]
 * @param {string} [opts.configPath]
 * @returns {RecentActivityEntry[]}
 */
function list(opts) {
  const o = opts || {};
  const raw = _readStateRaw(o.statePath);
  return _normalizeAll(raw.recentActivity);
}

/**
 * 推一条 entry. 5min 内同 kind+ref 折叠; 超出 cap 裁.
 * 写盘后调 _onUpdate({ entries }) 推 IPC 事件.
 *
 * @param {RecentActivityEntry} entry
 * @param {object} [opts]
 * @param {string} [opts.statePath]
 * @param {string} [opts.configPath]
 * @param {number} [opts.now]            注入便于测试
 * @returns {{ ok: true, deduped: boolean } | { ok: false, reason: string }}
 */
function push(entry, opts) {
  const v = _validateEntry(entry);
  if (!v.ok) return v;
  const o = opts || {};
  const now = (typeof o.now === "number") ? o.now : Date.now();
  const path = o.statePath || stateStore.defaultPath();
  const existing = _withStateShell(_readStateRaw(path));
  const entries = _normalizeAll(existing.recentActivity);
  const newEntry = _normalizeEntry({ ...entry, ts: entry.ts || now });
  if (!newEntry) return { ok: false, reason: "invalid_entry" };
  const max = _getMaxEntries(o.configPath, now);
  const { entries: next, deduped } = _dedupAndPush(entries, newEntry, now, max);
  stateStore.writeAtomic(path, { ...existing, recentActivity: next });
  if (typeof _onUpdate === "function") {
    try {
      _onUpdate({ entries: next, deduped });
    } catch (err) {
      mainLog.warn("[recent-activity] onUpdate failed", {
        msg: err && err.message,
      });
    }
  }
  return { ok: true, deduped };
}

/**
 * 主动让主进程推 'recent:updated' 事件 (renderer reloadRecent 时调).
 * 不写盘.
 * @param {object} [opts]
 * @param {string} [opts.statePath]
 * @returns {RecentActivityEntry[]}
 */
function broadcast(opts) {
  const o = opts || {};
  const entries = list(o);
  if (typeof _onUpdate === "function") {
    try {
      _onUpdate({ entries });
    } catch (err) {
      mainLog.warn("[recent-activity] broadcast onUpdate failed", {
        msg: err && err.message,
      });
    }
  }
  return entries;
}

function setOnUpdate(fn) {
  _onUpdate = typeof fn === "function" ? fn : null;
}

function clearConfigCache() {
  _cachedConfig = null;
  _cachedConfigAt = 0;
}

module.exports = {
  // CRUD
  list,
  push,
  broadcast,
  setOnUpdate,
  clearConfigCache,
  // 常量
  DEFAULT_MAX_ENTRIES,
  MIN_MAX_ENTRIES,
  MAX_MAX_ENTRIES,
  DEDUP_WINDOW_MS,
  VALID_KINDS,
  // test-only
  _validateEntry,
  _normalizeEntry,
  _normalizeAll,
  _dedupAndPush,
  _getMaxEntries,
  _setupDefaultConfigPath,
  _readStateRaw,
  _withStateShell,
};
