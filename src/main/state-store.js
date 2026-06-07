/**
 * src/main/state-store.js
 *
 * Phase 12: 持久化 last-known 检测结果.
 *
 * 数据流:
 *   - 启动时 load() → 给 renderer 当初始 UI (网络抽风时不至于"瞬时瞎")
 *   - 每次 check-updates 完成时 saveAll() → atomic write
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
 *     }
 *   }
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
 * - 写入是 atomic (写到 .tmp 再 rename), 防止写到一半断电/被杀进程
 *
 * Phase 18: changelog_history 处理. 当 r.latest_version 跟 prev.latest_version 不同 (且 prev 有
 * changelog), 把 prev 的 changelog 推到 prev.changelog_history, 限定最多 10 条.
 */
const CHANGELOG_HISTORY_MAX = 10;

function saveAll(results, statePath = defaultPath()) {
  const existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {} };
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
  const next = { v: SCHEMA_VERSION, ts: now, apps };
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
  const existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {} };
  const now = Date.now();
  const apps = existing.apps || {};
  for (const name of names) {
    if (!name || !apps[name]) continue;
    apps[name] = { ...apps[name], last_notified: now };
  }
  const next = { v: SCHEMA_VERSION, ts: now, apps };
  writeAtomic(statePath, next);
  return next;
}

/**
 * 把单个 result 加/更新进 state (用于更细粒度的写入, 比如每个 worker 跑完就写一次).
 */
function saveOne(result, statePath = defaultPath()) {
  return saveAll([result], statePath);
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

module.exports = { load, saveAll, saveOne, markNotified, defaultPath, SCHEMA_VERSION };
