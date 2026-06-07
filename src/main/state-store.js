/**
 * src/main/state-store.js
 *
 * Phase 12: 持久化 last-known 检测结果.
 * Phase 27: 持久化 mutes (per-app 静音状态).
 *
 * 数据流:
 *   - 启动时 load() → 给 renderer 当初始 UI (网络抽风时不至于"瞬时瞎")
 *   - 每次 check-updates 完成时 saveAll() → atomic write
 *   - 用户右键 → setMute / clearMute → atomic write (mutes 独立于 apps 写入)
 *
 * 路径: ~/Library/Application Support/AppUpdateChecker/state.json
 * (跟 Electron app.getPath('userData') 一致)
 *
 * Schema:
 *   {
 *     "v": 1,
 *     "ts": 1234567890,           // 最后一次写入时间
 *     "apps": {
 *       "Cursor": {
 *         "name": "Cursor",
 *         "installed_version": "3.6.31",
 *         "latest_version": "3.6.31",
 *         "has_update": false,
 *         "status": "up_to_date",
 *         "source": "brew_formulae",
 *         "note": "",
 *         "bundle": "Cursor.app",
 *         "ts": 1234567890        // 这条结果的检测时间
 *       },
 *       ...
 *     },
 *     "mutes": {                  // Phase 27: per-app 静音
 *       "Cursor": { "until": 1750000000000, "reason": "manual" },
 *       "Kimi":   { "until": 0,             "reason": "manual" }   // 0 = 永远
 *     }
 *   }
 *
 * 兼容: 老 state.json 没有 mutes 字段 → load() 视作 {}；v 不变（v=1，向后兼容）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SCHEMA_VERSION = 1;

function defaultPath() {
  // 跟 main 进程的 app.getPath('userData') 保持一致:
  // ~/Library/Application Support/app-update-checker
  // 但这里用更可读的目录名, 跟 logs 一致
  return path.join(os.homedir(), 'Library', 'Application Support', 'AppUpdateChecker', 'state.json');
}

/**
 * 加载 state, 文件不存在/解析失败 → 返回 null (caller 当作"无缓存"处理).
 *
 * Phase 27: mutes 字段是可选的. 老 state.json 没有 mutes → load() 仍返回原对象
 * (mutes 字段为 undefined). mutes 的兜底 (空 map) 在 getMutes/saveAll/setMute
 * 等使用时各自处理 — load() 保持纯读, 不 mutate.
 */
function load(statePath = defaultPath()) {
  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object' || !j.apps || typeof j.apps !== 'object') {
      return null;
    }
    return j;
  } catch {
    return null;
  }
}

/**
 * 把 results 数组 (来自 worker 的 result 对象) 合并进现有 state 并落盘.
 * - 缺失字段的 app 不动
 * - 新 app 加进去
 * - mutes 字段保留 (不归 0)
 * - 写入是 atomic (写到 .tmp 再 rename), 防止写到一半断电/被杀进程
 *
 * Phase 18: changelog_history 处理. 当 r.latest_version 跟 prev.latest_version 不同 (且 prev 有
 * changelog), 把 prev 的 changelog 推到 prev.changelog_history, 限定最多 10 条.
 */
const CHANGELOG_HISTORY_MAX = 10;

function saveAll(results, statePath = defaultPath()) {
  const existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {}, mutes: {} };
  const now = Date.now();
  const apps = existing.apps || {};
  for (const r of results || []) {
    if (!r || !r.name) continue;
    const prev = apps[r.name] || {};

    // Phase 18: 检测到版本变化 → 把旧 changelog 推到 history
    let history = Array.isArray(prev.changelog_history) ? prev.changelog_history : [];
    const newVersion = r.latest_version;
    const oldVersion = prev.latest_version;
    if (
      newVersion && oldVersion && newVersion !== oldVersion
      && prev.changelog
    ) {
      // 推到队首, 去重:
      //   - 过滤掉同 oldVersion 的旧 entry (防重复推)
      //   - 过滤掉同 newVersion 的旧 entry (回滚场景: current 不该在 history 里)
      // 限长
      history = [
        {
          version: oldVersion,
          changelog: prev.changelog,
          changelog_url: prev.changelog_url || '',
          ts: prev.ts || now,
        },
        ...history.filter((h) => h && h.version !== oldVersion && h.version !== newVersion),
      ].slice(0, CHANGELOG_HISTORY_MAX);
    }

    apps[r.name] = {
      ...r,
      ts: now,
      last_notified: prev.last_notified,
      changelog_history: history.length > 0 ? history : undefined,
    };
  }
  const next = {
    v: SCHEMA_VERSION,
    ts: now,
    apps,
    mutes: cleanExpiredMutes(existing.mutes || {}, now),
  };
  writeAtomic(statePath, next);
  return next;
}

/**
 * Phase 17: 标记一批 app 已被通知 (写 last_notified). 不影响其它字段.
 * @param {string[]} names
 * @param {string} [statePath]
 */
function markNotified(names, statePath = defaultPath()) {
  if (!Array.isArray(names) || names.length === 0) return null;
  const existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {}, mutes: {} };
  const now = Date.now();
  const apps = existing.apps || {};
  for (const name of names) {
    if (!name || !apps[name]) continue;
    apps[name] = { ...apps[name], last_notified: now };
  }
  const next = {
    v: SCHEMA_VERSION,
    ts: now,
    apps,
    mutes: cleanExpiredMutes(existing.mutes || {}, now),
  };
  writeAtomic(statePath, next);
  return next;
}

/**
 * 把单个 result 加/更新进 state (用于更细粒度的写入, 比如每个 worker 跑完就写一次).
 */
function saveOne(result, statePath = defaultPath()) {
  return saveAll([result], statePath);
}

// ─── Phase 27: Mutes ──────────────────────────────────────────

/**
 * 判断单条 mute 是否还有效 (not expired).
 * @param {{until?: number}} mute
 * @param {number} now   epoch ms, 注入便于测试
 * @returns {boolean}
 */
function isMuteActive(mute, now) {
  if (!mute || typeof mute !== 'object') return false;
  // until=0 → 永远有效
  if (!mute.until) return true;
  // until>0 → 到期时间. now < until → 还有效.
  return typeof now === 'number' && now < mute.until;
}

/**
 * 纯函数: 过滤掉过期的 mute entries. 写盘前调用, 保持 state.json 干净.
 * @param {object} mutes
 * @param {number} now
 * @returns {object} 新的 mutes 对象 (新引用, 不 mutate 原对象)
 */
function cleanExpiredMutes(mutes, now) {
  if (!mutes || typeof mutes !== 'object') return {};
  const out = {};
  for (const [name, m] of Object.entries(mutes)) {
    if (isMuteActive(m, now)) out[name] = m;
  }
  return out;
}

/**
 * 读 mutes. 同时清理过期的, 但不自动写盘 (避免每次读都 I/O).
 * 写盘清理交给 setMute/clearMute.
 *
 * @param {string} [statePath]
 * @param {number} [now]   注入便于测试, 默认 Date.now()
 * @returns {object} { [name]: { until, reason } }
 */
function getMutes(statePath = defaultPath(), now) {
  const t = (typeof now === 'number') ? now : Date.now();
  const s = load(statePath);
  if (!s) return {};
  return cleanExpiredMutes(s.mutes || {}, t);
}

/**
 * 设置某 app 静音. 写入 state.json (mutes 字段).
 * @param {string} name           app name
 * @param {number} untilMs        到期时间 (epoch ms); 0 = 永远
 * @param {string} [reason]       'manual' (default) | 'auto-*'
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function setMute(name, untilMs, reason, statePath = defaultPath()) {
  if (!name || typeof name !== 'string') {
    throw new TypeError('setMute: name must be non-empty string');
  }
  if (typeof untilMs !== 'number' || !Number.isFinite(untilMs) || untilMs < 0) {
    throw new TypeError('setMute: untilMs must be non-negative finite number (0 = forever)');
  }
  const existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {}, mutes: {} };
  const now = Date.now();
  const mutes = cleanExpiredMutes(existing.mutes || {}, now);
  mutes[name] = {
    until: untilMs,
    reason: (typeof reason === 'string' && reason) ? reason : 'manual',
  };
  const next = {
    v: SCHEMA_VERSION,
    ts: now,
    apps: existing.apps || {},
    mutes,
  };
  writeAtomic(statePath, next);
  return next;
}

/**
 * 取消某 app 静音 (如果存在).
 * @param {string} name
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function clearMute(name, statePath = defaultPath()) {
  if (!name || typeof name !== 'string') {
    throw new TypeError('clearMute: name must be non-empty string');
  }
  const existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {}, mutes: {} };
  const now = Date.now();
  const mutes = cleanExpiredMutes(existing.mutes || {}, now);
  if (name in mutes) {
    delete mutes[name];
  }
  const next = {
    v: SCHEMA_VERSION,
    ts: now,
    apps: existing.apps || {},
    mutes,
  };
  writeAtomic(statePath, next);
  return next;
}

function writeAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* noop */ }
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // 清理 tmp, 重新抛
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
    throw err;
  }
}

module.exports = {
  load,
  saveAll,
  saveOne,
  markNotified,
  defaultPath,
  SCHEMA_VERSION,
  // Phase 27
  isMuteActive,
  cleanExpiredMutes,
  getMutes,
  setMute,
  clearMute,
};
