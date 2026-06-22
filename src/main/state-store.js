/**
 * src/main/state-store.js
 *
 * Phase 12: 持久化 last-known 检测结果.
 * Phase 27: 持久化 mutes (per-app 静音状态).
 * Phase 29: 持久化 last_opened (per-app 最近打开时间).
 * Phase A2: 持久化 active_category (Phase A app categorization, 顶部 tab).
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
 *     },
 *     "last_opened": {            // Phase 29: per-app 最近打开
 *       "Cursor":    { "ms": 1750000000000, "source": "spotlight" },
 *       "WorkBuddy": { "ms": null,          "source": "unknown" }
 *     },
 *     "active_category": "ai"     // Phase A: 当前选中的顶部 category tab ('all' | categoryId)
 *   }
 *
 * 兼容: 老 state.json 没有 mutes 字段 → load() 视作 {}；v 不变（v=1，向后兼容）
 */

const fs = require("fs");
const { renameSync } = fs;
const path = require("path");
const os = require("os");
const { isStateValid, validateState } = require("./state-store-schema");

class StateCorruptedError extends Error {
  constructor(message, { path, raw = null, parseError = null, schemaErrors = [] } = {}) {
    super(message);
    this.name = "StateCorruptedError";
    this.path = path;
    this.raw = raw;
    this.parseError = parseError;
    this.schemaErrors = schemaErrors;
  }
}

const SCHEMA_VERSION = 2;

const LEGACY_STATE_PATH = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "AppUpdateChecker",
  "state.json",
);

/** Electron userData 下的 state.json; initStateStorePaths() 在 app ready 后设置 */
let _resolvedStatePath = null;

// Phase Q8: last recovery event (consume-once). Set by loadOrRecover, read by IPC push to renderer.
let _lastRecoveryEvent = null;

function _tryGetUserDataDir() {
  try {
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") {
      return app.getPath("userData");
    }
  } catch {
    /* vitest / 非 Electron */
  }
  return null;
}

/**
 * app.whenReady 后调用: state.json 迁到 userData, 与 ai-keys 同目录.
 * @returns {string} 生效的 state 路径
 */
function initStateStorePaths() {
  const userData = _tryGetUserDataDir();
  if (!userData) {
    _resolvedStatePath = LEGACY_STATE_PATH;
    return _resolvedStatePath;
  }
  const target = path.join(userData, "state.json");
  migrateLegacyStateIfNeeded(target);
  _resolvedStatePath = target;
  return _resolvedStatePath;
}

function migrateLegacyStateIfNeeded(targetPath) {
  try {
    const dir = path.dirname(targetPath);
    fs.mkdirSync(dir, { recursive: true });

    const legacyExists = fs.existsSync(LEGACY_STATE_PATH);
    const targetExists = fs.existsSync(targetPath);

    if (!targetExists && legacyExists) {
      fs.copyFileSync(LEGACY_STATE_PATH, targetPath);
      return;
    }

    if (!legacyExists || !targetExists) return;

    const legacy = JSON.parse(fs.readFileSync(LEGACY_STATE_PATH, "utf-8"));
    const current = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    let merged = false;

    if (legacy.ai_sessions_config && !current.ai_sessions_config) {
      current.ai_sessions_config = legacy.ai_sessions_config;
      merged = true;
    }
    if (legacy.task_summaries && !current.task_summaries) {
      current.task_summaries = legacy.task_summaries;
      merged = true;
    }
    if (legacy.worldcup_match_insights && !current.worldcup_match_insights) {
      current.worldcup_match_insights = legacy.worldcup_match_insights;
      merged = true;
    }
    if (merged) {
      writeAtomic(targetPath, current);
    }
  } catch {
    /* 迁移失败不阻塞启动 */
  }
}

// ─── 新字段 preserve helper ─────────────────────────
//
// 用途: 让 saveAll / setMute / clearMute / saveLastOpened / saveActiveCategory
//       / saveTaskSummary / saveAISessionsConfig 在写盘时自动保留这些 "patch 后
//       加的" 字段, 避免被覆盖丢.
//
// 当前 preserve 的字段:
//   - classify_llm_cache: { appName: catId } (Step B LLM classify 用)
//   - task_summaries: { taskKey: entry } (AI 任务总结缓存)
//   - funds: { holdings, deletedIds, dailySnapshots } (基金管理, fund-store 写入)
//   - worldcupBets: { [date]: entry } (体彩记账, bets-store 写入)
//   - ithome_news: { articles, summaries, favorites, ts } (IT之家新闻, news-store 写入)
//   - reminders: [] (提醒, reminders.js 写入)
//   - recentActivity: [] (最近活动时间线, recent-activity.js 写入)
//
// 旧字段 daily_digests / daily_digest_v2 / last_digest_attempts 已废弃 —
// 不再 preserve, 下次写盘自然消失.
//
// 注: caller 不应该 mutate existing 直接, 应该从 load() 拿 immutable 副本.
// 保留策略: 如果 next 里已经有这字段 (caller 显式设), 用 next 的; 否则从 existing 拿.
const PRESERVE_FIELDS = [
  { key: "classify_llm_cache", kind: "object" },
  { key: "task_summaries", kind: "object", notArray: true },
  { key: "worldcup_txt", kind: "object" },
  { key: "worldcup_scores", kind: "object" },
  { key: "worldcup_match_insights", kind: "object" },
  { key: "worldcup_bracket_snapshot", kind: "object" },
  { key: "worldcupGoalNotified", kind: "object", notArray: true },  // 新增 (goal notifications v1)
  { key: "funds", kind: "object", notArray: true },
  { key: "worldcupBets", kind: "object", notArray: true },
  { key: "ithome_news", kind: "object", notArray: true },
  { key: "reminders", kind: "array" },
  { key: "recentActivity", kind: "array" },
  // AI 用量相关: ai_usage (snapshot) + ai_usage_history 互不覆盖
  { key: "ai_usage", kind: "object", notArray: true },
  { key: "ai_usage_history", kind: "object", notArray: true },
  { key: "circuitBreakers", kind: "object", notArray: true },  // Phase C1: per-detector circuit breaker state
  { key: "daily_digest", kind: "object", notArray: true },  // Phase I5: daily digest settings + last_push_date
];

function shouldPreserveValue(val, spec) {
  if (spec.kind === "array") return Array.isArray(val);
  if (!val || typeof val !== "object") return false;
  if (spec.notArray && Array.isArray(val)) return false;
  return true;
}

function preserveExtraFields(existing, next) {
  if (!existing || typeof existing !== "object") return next;
  if (!next || typeof next !== "object") return next;
  for (const spec of PRESERVE_FIELDS) {
    if (!(spec.key in next) && shouldPreserveValue(existing[spec.key], spec)) {
      next[spec.key] = existing[spec.key];
    }
  }
  return next;
}

function defaultPath() {
  if (_resolvedStatePath) return _resolvedStatePath;
  const userData = _tryGetUserDataDir();
  if (userData) return path.join(userData, "state.json");
  return LEGACY_STATE_PATH;
}

// ─── 公共 patch 范式 ─────────────────────────────────────────
//
// 所有 save* 函数共享的写入骨架:
//   1) load existing (没有 → 空 baseline)
//   2) 构造 base next: v / ts / apps / mutes (自动 GC) / last_opened / active_category
//   3) 默认保留 ai_sessions_config (opts.dropAiSessionsConfig=true 时丢弃, 用于显式清空)
//   4) 调 updater(next, existing, now) — 让 caller 把自己负责的字段写到 next
//   5) preserveExtraFields — 把 caller 没动的 "patch 后加的" 字段搬过来
//   6) writeAtomic 落盘
//
// 这样每个 save 函数只保留"我要改哪个字段"的差异, 不能再忘了 preserve.
// 修了两个 pre-existing bug: saveWorldcupMatchInsights / saveActiveCategory
// 原本没保留 ai_sessions_config, 重构后自动保留.
function patchState(updater, statePath = defaultPath(), opts = {}) {
  const existing = load(statePath) || {
    v: SCHEMA_VERSION,
    ts: 0,
    apps: {},
    mutes: {},
  };
  const now = Date.now();
  const next = {
    v: SCHEMA_VERSION,
    ts: now,
    apps: existing.apps || {},
    mutes: cleanExpiredMutes(existing.mutes || {}, now),
    last_opened: existing.last_opened || {},
    active_category: existing.active_category || "all",
  };
  if (!opts.dropAiSessionsConfig && existing.ai_sessions_config) {
    next.ai_sessions_config = existing.ai_sessions_config;
  }
  if (typeof updater === "function") {
    updater(next, existing, now);
  }
  preserveExtraFields(existing, next);
  writeAtomic(statePath, next);
  return next;
}

/**
 * Phase Q8: internal loader that distinguishes missing / corrupted / valid.
 *  - File missing → return null (cold start, normal)
 *  - File present but invalid JSON → throw StateCorruptedError (parse_failed)
 *  - File present, valid JSON, but fails schema → throw StateCorruptedError (schema_failed)
 *  - File present, valid JSON, valid schema → return parsed state
 *
 * @param {string} statePath
 * @returns {object|null}
 */
function _loadOrThrow(statePath) {
  let raw;
  try {
    raw = fs.readFileSync(statePath, "utf-8");
  } catch (err) {
    if (err && err.code === "ENOENT") return null; // missing — cold start
    throw err; // permission / IO — propagate (caller will surface)
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new StateCorruptedError(
      `state.json is not valid JSON: ${e.message}`,
      { path: statePath, raw: raw.slice(0, 1024), parseError: e },
    );
  }
  if (!isStateValid(parsed)) {
    const { errors } = validateState(parsed);
    throw new StateCorruptedError(
      "state.json failed schema validation",
      { path: statePath, raw: raw.slice(0, 1024), schemaErrors: errors },
    );
  }
  return parsed;
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
    const raw = fs.readFileSync(statePath, "utf-8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || !j.apps || typeof j.apps !== "object") {
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
  return patchState((next, existing, now) => {
    const apps = existing.apps || {};
    for (const r of results || []) {
      if (!r || !r.name) continue;
      const prev = apps[r.name] || {};

      // Phase 18: 检测到版本变化 → 把旧 changelog 推到 history
      let history = Array.isArray(prev.changelog_history)
        ? prev.changelog_history
        : [];
      const newVersion = r.latest_version;
      const oldVersion = prev.latest_version;
      if (
        newVersion &&
        oldVersion &&
        newVersion !== oldVersion &&
        prev.changelog
      ) {
        history = [
          {
            version: oldVersion,
            changelog: prev.changelog,
            changelog_url: prev.changelog_url || "",
            ts: prev.ts || now,
          },
          ...history.filter(
            (h) => h && h.version !== oldVersion && h.version !== newVersion,
          ),
        ].slice(0, CHANGELOG_HISTORY_MAX);
      }

      apps[r.name] = {
        ...r,
        ts: now,
        last_notified: prev.last_notified,
        changelog_history: history.length > 0 ? history : undefined,
        // Phase C2: preserve snooze fields across saves
        snoozeUntil: typeof prev.snoozeUntil === "number" ? prev.snoozeUntil : undefined,
        skippedVersion: typeof prev.skippedVersion === "string" && prev.skippedVersion.length > 0
          ? prev.skippedVersion
          : undefined,
      };

      // Phase C2: clear skippedVersion when user upgrades past the skipped version.
      // 当 latest_version 变化 (新版本上线) → 自动清除 app.skippedVersion,
      // 这样 "跳过该版本" 的 snooze 不再黏在新版本上, 用户升到新版本或新版
      // 再次出现时, 通知/UI 会正常显示.
      const newLatest = r.latest_version;
      if (
        prev.skippedVersion &&
        typeof newLatest === "string" &&
        newLatest.length > 0 &&
        prev.skippedVersion !== newLatest
      ) {
        delete apps[r.name].skippedVersion;
      }
      // snoozeUntil 不再是未来时也清掉(避免无限期 stale 状态)
      if (
        typeof apps[r.name].snoozeUntil === "number" &&
        apps[r.name].snoozeUntil <= now
      ) {
        delete apps[r.name].snoozeUntil;
      }
    }
    next.apps = apps;
  }, statePath);
}

/**
 * Phase 17: 标记一批 app 已被通知 (写 last_notified). 不影响其它字段.
 * @param {string[]} names
 * @param {string} [statePath]
 */
function markNotified(names, statePath = defaultPath()) {
  if (!Array.isArray(names) || names.length === 0) return null;
  return patchState((next) => {
    const apps = next.apps || {};
    for (const name of names) {
      if (!name || !apps[name]) continue;
      apps[name] = { ...apps[name], last_notified: next.ts };
    }
    next.apps = apps;
  }, statePath);
}

// ─── Phase 27: Mutes ──────────────────────────────────────────

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
  if (!mute || typeof mute !== "object") return false;
  // until=0 → 永远有效
  if (!mute.until) return true;
  // until>0 → 到期时间. now < until → 还有效.
  return typeof now === "number" && now < mute.until;
}

/**
 * 纯函数: 过滤掉过期的 mute entries. 写盘前调用, 保持 state.json 干净.
 * @param {object} mutes
 * @param {number} now
 * @returns {object} 新的 mutes 对象 (新引用, 不 mutate 原对象)
 */
function cleanExpiredMutes(mutes, now) {
  if (!mutes || typeof mutes !== "object") return {};
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
  const t = typeof now === "number" ? now : Date.now();
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
  if (!name || typeof name !== "string") {
    throw new TypeError("setMute: name must be non-empty string");
  }
  if (typeof untilMs !== "number" || !Number.isFinite(untilMs) || untilMs < 0) {
    throw new TypeError(
      "setMute: untilMs must be non-negative finite number (0 = forever)",
    );
  }
  return patchState((next, existing) => {
    const mutes = next.mutes || {};
    mutes[name] = {
      until: untilMs,
      reason: typeof reason === "string" && reason ? reason : "manual",
    };
    next.mutes = mutes;
  }, statePath);
}

/**
 * 取消某 app 静音 (如果存在).
 * @param {string} name
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function clearMute(name, statePath = defaultPath()) {
  if (!name || typeof name !== "string") {
    throw new TypeError("clearMute: name must be non-empty string");
  }
  return patchState((next) => {
    const mutes = next.mutes || {};
    if (name in mutes) delete mutes[name];
    next.mutes = mutes;
  }, statePath);
}

// ─── Phase C2: Per-app snooze (等下次再升) ─────────────────────

/**
 * Phase C2: write app snooze (until ms or skippedVersion). Atomic write, preserves other fields.
 * @param {string} name
 * @param {{until?: number, version?: string}} opts
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function setAppSnooze(name, opts, statePath = defaultPath()) {
  if (!name || typeof name !== "string") {
    throw new TypeError("setAppSnooze: name must be non-empty string");
  }
  if (!opts || typeof opts !== "object" || Array.isArray(opts)) {
    throw new TypeError("setAppSnooze: opts must be plain object");
  }
  return patchState((next, existing) => {
    const prev = (existing.apps && existing.apps[name]) || {};
    const updated = { ...prev };
    if (typeof opts.until === "number") {
      updated.snoozeUntil = opts.until;
    }
    if (typeof opts.version === "string" && opts.version.length > 0) {
      updated.skippedVersion = opts.version;
    }
    next.apps = { ...(existing.apps || {}), [name]: updated };
  }, statePath);
}

/**
 * Phase C2: clear all snooze for an app.
 * @param {string} name
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function clearAppSnooze(name, statePath = defaultPath()) {
  if (!name || typeof name !== "string") {
    throw new TypeError("clearAppSnooze: name must be non-empty string");
  }
  return patchState((next, existing) => {
    const prev = (existing.apps && existing.apps[name]);
    if (!prev) return;
    const { snoozeUntil: _u, skippedVersion: _v, ...rest } = prev;
    next.apps = { ...(existing.apps || {}), [name]: rest };
  }, statePath);
}

/**
 * Phase C2: read snooze sub-state for one app.
 * @param {string} name
 * @param {string} [statePath]
 * @returns {{snoozeUntil: number|null, skippedVersion: string|null}}
 */
function loadAppSnooze(name, statePath = defaultPath()) {
  const s = load(statePath);
  const app = s && s.apps && s.apps[name];
  return {
    snoozeUntil: app && typeof app.snoozeUntil === "number" ? app.snoozeUntil : null,
    skippedVersion: app && typeof app.skippedVersion === "string" ? app.skippedVersion : null,
  };
}

// ─── Phase 29: Last-opened ───────────────────────────────────

/**
 * 读 last_opened 字段. 老 state.json 无该字段 → {} (兼容).
 * 跟 mutes 不同, last_opened 没有 expiry, 不做 cleanup.
 * @param {string} [statePath]
 * @returns {object} { [name]: { ms: number|null, source: string } }
 */
function loadLastOpened(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s) return {};
  if (
    !s.last_opened ||
    typeof s.last_opened !== "object" ||
    Array.isArray(s.last_opened)
  )
    return {};
  return s.last_opened;
}

/**
 * 写 last_opened 字段. atomic write, 保留 apps / mutes.
 * @param {object} map  { [name]: { ms, source } }
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveLastOpened(map, statePath = defaultPath()) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    throw new TypeError("saveLastOpened: map must be plain object");
  }
  return patchState((next) => {
    next.last_opened = map;
  }, statePath);
}

/**
 * 读 worldcup Football.TXT 缓存. 老 state.json (无 worldcup_txt 字段) → null.
 * 没 expiry (caller 用 ts 自查).
 * @param {string} [statePath]
 * @returns {{txt: string, ts: number}|null}
 */
function loadWorldcupTxt(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s) return null;
  if (!s.worldcup_txt || typeof s.worldcup_txt !== "object") return null;
  const { txt, ts } = s.worldcup_txt;
  if (typeof txt !== "string" || typeof ts !== "number") return null;
  return { txt, ts };
}

/**
 * 写 worldcup Football.TXT 缓存. atomic write, 保留 apps / mutes / last_opened 等.
 * @param {{txt: string, ts: number}} entry
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveWorldcupTxt(entry, statePath = defaultPath()) {
  if (!entry || typeof entry.txt !== "string" || typeof entry.ts !== "number") {
    throw new TypeError(
      "saveWorldcupTxt: entry must be {txt: string, ts: number}",
    );
  }
  return patchState((next) => {
    next.worldcup_txt = { txt: entry.txt, ts: entry.ts };
  }, statePath);
}

/**
 * Twitter Serenity — 内置默认镜像源 (首次启动写入 state.json, 用户可在设置页改).
 * 对齐 spec §5.3: 3 个 Nitter 派生 + 1 个公共 RSSHub.
 */
const DEFAULT_TWITTER_SOURCES = [
  { id: "nitter-twiiit", type: "nitter", url: "https://twiiit.com", enabled: true, priority: 1 },
  { id: "nitter-xcancel", type: "nitter", url: "https://xcancel.com", enabled: true, priority: 2 },
  { id: "nitter-poast", type: "nitter", url: "https://nitter.poast.org", enabled: true, priority: 3 },
  { id: "rsshub-public", type: "rsshub", url: "https://rsshub.app", enabled: true, priority: 4 },
];

/**
 * 读 twitterCache. 老 state.json (无字段) → null.
 * @param {string} [statePath]
 * @returns {object|null}  twitterCache 对象 (handle/tweets/translations/...)
 */
function loadTwitterCache(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s) return null;
  if (!s.twitterCache || typeof s.twitterCache !== "object") return null;
  return s.twitterCache;
}

/**
 * 写 twitterCache. atomic write, 保留所有其他字段 (走 patchState 范式).
 * @param {object} cache
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveTwitterCache(cache, statePath = defaultPath()) {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
    throw new TypeError("saveTwitterCache: cache must be plain object");
  }
  return patchState((next) => {
    next.twitterCache = cache;
  }, statePath);
}

/**
 * 读 twitterSources. 无值或空数组 → 返回默认 4 镜像 (首次启动 fallback).
 * @param {string} [statePath]
 * @returns {object[]}  镜像源配置数组
 */
function loadTwitterSources(statePath = defaultPath()) {
  const s = load(statePath);
  if (s && Array.isArray(s.twitterSources) && s.twitterSources.length > 0) {
    return s.twitterSources;
  }
  return DEFAULT_TWITTER_SOURCES.slice();
}

/**
 * 写 twitterSources. atomic write, 保留所有其他字段.
 * @param {object[]} sources
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveTwitterSources(sources, statePath = defaultPath()) {
  if (!Array.isArray(sources)) {
    throw new TypeError("saveTwitterSources: sources must be array");
  }
  return patchState((next) => {
    next.twitterSources = sources;
  }, statePath);
}

/**
 * 读 worldcup 淘汰赛 bracket snapshot. 老 state.json (无 worldcup_bracket_snapshot
 * 字段) 或值非法 → null. 没有 expiry — caller 用 computedAt 自查.
 * @param {string} [statePath]
 * @returns {object|null}  BracketSnapshot
 *   { version, computedAt, projected, r32, r16, qf, sf, final, third,
 *     thirdPlacedAdvancing, annexCIndex, warnings }
 */
function loadWorldcupBracket(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s) return null;
  const snap = s.worldcup_bracket_snapshot;
  if (!snap || typeof snap !== "object") return null;
  return snap;
}

/**
 * 写 worldcup 淘汰赛 bracket snapshot. atomic write, 保留 apps / mutes /
 * last_opened / worldcup_txt / worldcup_scores / worldcup_match_insights
 * 等所有其它字段.
 * @param {object} snapshot  BracketSnapshot
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveWorldcupBracket(snapshot, statePath = defaultPath()) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError("saveWorldcupBracket: snapshot must be plain object");
  }
  return patchState((next) => {
    next.worldcup_bracket_snapshot = { ...snapshot };
  }, statePath);
}

/**
 * 读 worldcup 比分缓存
 * @returns {{ entries: object, ts: number }|null}
 */
function loadWorldcupScores(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s || !s.worldcup_scores || typeof s.worldcup_scores !== "object")
    return null;
  const { entries, ts } = s.worldcup_scores;
  if (!entries || typeof entries !== "object" || typeof ts !== "number")
    return null;
  return { entries, ts };
}

/**
 * 写 worldcup 比分缓存
 * @param {{ entries: object, ts: number }} cache
 */
function saveWorldcupScores(cache, statePath = defaultPath()) {
  if (
    !cache ||
    typeof cache.entries !== "object" ||
    typeof cache.ts !== "number"
  ) {
    throw new TypeError(
      "saveWorldcupScores: cache must be {entries: object, ts: number}",
    );
  }
  return patchState((next) => {
    next.worldcup_scores = { entries: cache.entries, ts: cache.ts };
  }, statePath);
}

/**
 * 读世界杯场次 AI 缓存 (赛前预测 / 赛后总结)
 * @returns {{ entries: object, ts: number }|null}
 */
function loadWorldcupMatchInsights(statePath = defaultPath()) {
  const s = load(statePath);
  if (
    !s ||
    !s.worldcup_match_insights ||
    typeof s.worldcup_match_insights !== "object"
  ) {
    return null;
  }
  const { entries, ts } = s.worldcup_match_insights;
  if (!entries || typeof entries !== "object" || typeof ts !== "number") {
    return null;
  }
  return { entries, ts };
}

/**
 * @param {{ entries: object, ts: number }} cache
 */
function saveWorldcupMatchInsights(cache, statePath = defaultPath()) {
  if (
    !cache ||
    typeof cache.entries !== "object" ||
    typeof cache.ts !== "number"
  ) {
    throw new TypeError(
      "saveWorldcupMatchInsights: cache must be {entries: object, ts: number}",
    );
  }
  // bug 修复: 老实现没 preserve ai_sessions_config, 走 patchState 自动补上.
  return patchState((next) => {
    next.worldcup_match_insights = { entries: cache.entries, ts: cache.ts };
  }, statePath);
}

// ─── AI 任务总结缓存 (task_summaries) ────────────────────────
// 重做版: 按任务缓存 (不再按天). 30 天外 GC, 跟 mutes 同款处理.
// 字段: task_summaries = { [taskKey]: Entry }
//   taskKey = "<appName>:<sessionId>"
//   Entry   = { taskKey, sessionId, appName, title, userGoal, outcome,
//               provider, model, generatedAt, contentHash, dateKey }

const TASK_SUMMARIES_GC_DAYS = 30;

/**
 * GC: 删 30 天外的任务总结. 写盘前调.
 * @param {object} map  { [taskKey]: Entry }
 * @param {number} now  epoch ms
 * @returns {object} 新 map (新引用, 不 mutate 原对象)
 */
function cleanExpiredTaskSummaries(map, now) {
  if (!map || typeof map !== "object") return {};
  const out = {};
  const cutoffMs = now - TASK_SUMMARIES_GC_DAYS * 86400_000;
  for (const [taskKey, e] of Object.entries(map)) {
    if (!e || typeof e !== "object") continue;
    if (typeof e.generatedAt !== "number" || e.generatedAt < cutoffMs) continue;
    out[taskKey] = e;
  }
  return out;
}

/**
 * 读任务总结缓存. 老 state.json (无 task_summaries 字段) → {} (兼容).
 * @param {string} [statePath]
 * @returns {object} { [taskKey]: Entry }
 */
function loadTaskSummaries(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s) return {};
  if (
    !s.task_summaries ||
    typeof s.task_summaries !== "object" ||
    Array.isArray(s.task_summaries)
  )
    return {};
  return cleanExpiredTaskSummaries(s.task_summaries, Date.now());
}

/**
 * 写一条任务总结. atomic write, 保留其余字段.
 * @param {object} entry   必须含 taskKey
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveTaskSummary(entry, statePath = defaultPath()) {
  if (
    !entry ||
    typeof entry !== "object" ||
    typeof entry.taskKey !== "string" ||
    entry.taskKey.length === 0
  ) {
    throw new TypeError(
      "saveTaskSummary: entry.taskKey must be non-empty string",
    );
  }
  return patchState((next, existing, now) => {
    const map = cleanExpiredTaskSummaries(existing.task_summaries || {}, now);
    map[entry.taskKey] = {
      ...entry,
      generatedAt:
        typeof entry.generatedAt === "number" ? entry.generatedAt : now,
    };
    next.task_summaries = map;
  }, statePath);
}

/**
 * 读 AI sessions config. 老 state.json (无 ai_sessions_config 字段) → null (缺省).
 * @param {string} [statePath]
 * @returns {object|null}
 */
function loadAISessionsConfig(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s || !s.ai_sessions_config || typeof s.ai_sessions_config !== "object")
    return null;
  return { ...s.ai_sessions_config };
}

/**
 * 写 AI sessions config. atomic write, 保留 apps / mutes / last_opened / active_category / task_summaries.
 * @param {object} cfg
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveAISessionsConfig(cfg, statePath = defaultPath()) {
  if (cfg != null && typeof cfg !== "object") {
    throw new TypeError("saveAISessionsConfig: cfg must be object or null");
  }
  // cfg=null → 显式清字段: patchState 里的 ai_sessions_config 默认保留要禁用
  return patchState(
    (next) => {
      if (cfg != null) next.ai_sessions_config = { ...cfg };
    },
    statePath,
    { dropAiSessionsConfig: cfg == null },
  );
}

function writeAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* noop */
  }
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // 清理 tmp, 重新抛
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* noop */
    }
    throw err;
  }
}

// ─── Phase A (App Categorization): Active category tab ──────────

/**
 * 读 active_category. 缺字段 / 非 string → 'all' 兜底.
 * - 'all' 是合法值, 表示"全部 tab"
 * - 其它合法值是 categoryId (e.g. 'ai', 'dev'), 渲染端用 category.js 验证
 * - 非法值 (object / number / 不存在的 id) → 'all' (spec §7 边界)
 *
 * @param {string} [statePath]
 * @returns {string}  'all' 或 categoryId
 */
function loadActiveCategory(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s) return "all";
  const v = s.active_category;
  if (typeof v !== "string" || v.length === 0) return "all";
  return v;
}

/**
 * 写 active_category. atomic write, 保留 apps / mutes / last_opened.
 * 写完返完整 state.
 *
 * @param {string} id             'all' 或 categoryId
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveActiveCategory(id, statePath = defaultPath()) {
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError("saveActiveCategory: id must be non-empty string");
  }
  // bug 修复: 老实现没 preserve ai_sessions_config, 走 patchState 自动补上.
  return patchState((next) => {
    next.active_category = id;
  }, statePath);
}

// ─── Phase I5: Daily Digest (notification settings) ──────────

/**
 * Phase I5: write daily_digest sub-state. Atomic write, preserves other fields.
 * @param {{enabled?: boolean, time?: string, last_push_date?: string|null}} cfg
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveDailyDigest(cfg, statePath = defaultPath()) {
  if (cfg == null || typeof cfg !== "object" || Array.isArray(cfg)) {
    throw new TypeError("saveDailyDigest: cfg must be plain object");
  }
  return patchState((next, existing) => {
    const prev = (existing.daily_digest && typeof existing.daily_digest === "object")
      ? existing.daily_digest
      : {};
    next.daily_digest = { ...prev, ...cfg };
  }, statePath);
}

/**
 * Phase I5: read daily_digest sub-state. Missing/invalid → default shape.
 * @param {string} [statePath]
 * @returns {{enabled: boolean, time: string, last_push_date: string|null}}
 */
function loadDailyDigest(statePath = defaultPath()) {
  const s = load(statePath);
  const def = { enabled: true, time: "08:30", last_push_date: null };
  if (!s || !s.daily_digest || typeof s.daily_digest !== "object" || Array.isArray(s.daily_digest)) return def;
  return {
    enabled: typeof s.daily_digest.enabled === "boolean" ? s.daily_digest.enabled : def.enabled,
    time: typeof s.daily_digest.time === "string" ? s.daily_digest.time : def.time,
    last_push_date: typeof s.daily_digest.last_push_date === "string" ? s.daily_digest.last_push_date : null,
  };
}

// ─── AI 配额快照 (ai_usage) ───────────────────────────────────
//
// 用途: 缓存 minimax coding plan 配额快照, 用于:
//   - 启动时给 renderer 当 initial UI (网络抽风时不"瞬时瞎")
//   - 上次 fetch 失败时, 仍能展示 last known snapshot
//
// v1 平铺 schema (单 minimax) 已废弃 — 现走 v2 多 provider (见下方).
// 这两个旧函数保留作向后兼容: 读写都落到 v2 的 providers.minimax 槽,
// 老调用方 / 老测试无需改动.

/**
 * 读 AI 配额快照 (minimax, v1 兼容). 内部走 v2 providers.minimax.
 * 老 state.json (无 ai_usage) → null.
 * @param {string} [statePath]
 * @returns {object|null}
 */
function loadAiUsageSnapshot(statePath = defaultPath()) {
  return loadAiUsageSnapshotProvider("minimax", statePath);
}

/**
 * 写 AI 配额快照 (minimax, v1 兼容). 内部走 v2 providers.minimax.
 * @param {object} snapshot  必须含 provider / region / fetchedAt
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveAiUsageSnapshot(snapshot, statePath = defaultPath()) {
  return saveAiUsageSnapshotProvider(
    (snapshot && snapshot.provider) || "minimax",
    snapshot,
    statePath,
  );
}

// ─── AI 配额历史 (ai_usage_history) ─────────────────────────────
//
// 用途: 每天累积 minimax coding plan 5h 窗口的 used, 用于 sparkline 趋势图.
// 每次 fetch 成功后, 拿当前 used (取当天最大值) 写回当天 entry.
//
// Schema: state.json.ai_usage_history = { days: [{date, used, percent, updatedAt}] }
//   date     "YYYY-MM-DD" (本地时区), 唯一 key
//   used     当天 used 的最大值 (used 是累积量, 可能因 5h 窗口重置回落)
//   percent  当天 used 最高时的 percent
//   updatedAt epoch ms
//
// 保留 30 天 (GC 删更早的), 不让文件无限涨.

const USAGE_HISTORY_GC_DAYS = 30;
const USAGE_HISTORY_MAX_DAYS = 30;

/**
 * GC: 删 30 天外的 entry. 写盘前调.
 * @param {Array<{date: string}>|null|undefined} days
 * @returns {Array}
 */
function cleanExpiredUsageHistory(days) {
  if (!Array.isArray(days)) return [];
  // 简单按 date string 倒序排, 截前 N 条. YYYY-MM-DD 可直接字符串比较.
  const sorted = [...days]
    .filter((d) => d && typeof d === "object" && typeof d.date === "string")
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return sorted.slice(0, USAGE_HISTORY_MAX_DAYS);
}

/**
 * 读 AI 用量历史 (minimax, v1 兼容). 内部走 v2 providers.minimax.
 * @param {string} [statePath]
 * @returns {{days: Array}}
 */
function loadAiUsageHistory(statePath = defaultPath()) {
  return loadAiUsageHistoryProvider("minimax", statePath);
}

/**
 * 追加/更新一天的 entry (minimax, v1 兼容). 内部走 v2 providers.minimax.
 * @param {{date: string, used: number, percent?: number|null}} entry
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function appendAiUsageHistoryDay(entry, statePath = defaultPath()) {
  return appendAiUsageHistoryDayProvider("minimax", entry, statePath);
}

// ─── AI 配额快照 (v2 多 provider) ─────────────────────────────
//
// v2 schema:
//   state.json.ai_usage = {
//     schema_version: 2,
//     providers: {
//       minimax: { provider, region, fetchedAt, endpoint, windows: {...}, ... },
//       glm:     { ... },
//     },
//   }
//   state.json.ai_usage_history = {
//     schema_version: 2,
//     providers: {
//       minimax: { days: [...] },
//       glm:     { days: [...] },
//     },
//   }
//
// 历史 v1 (平铺单 minimax) 由 _ensureAiUsageV2 惰性迁移.
const AI_USAGE_KNOWN_PROVIDERS = ["minimax", "glm"];

function _isAiUsageV2(val) {
  return (
    val &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    val.schema_version === 2 &&
    val.providers &&
    typeof val.providers === "object"
  );
}

/**
 * 读 ai_usage, 保证返回 v2 形状 { schema_version, providers }.
 * 盘上是 v1 平铺 (有 ai_usage 但无 schema_version) → 提升为 v2 并落盘一次性迁移.
 * 盘上无 ai_usage → 返回 v2 空壳 (providers={}).
 * @param {string} [statePath]
 * @returns {{schema_version:2, providers: object}}
 */
function _ensureAiUsageV2(statePath = defaultPath()) {
  const s = load(statePath);
  const empty = { schema_version: 2, providers: {} };
  if (!s || !s.ai_usage || typeof s.ai_usage !== "object" || Array.isArray(s.ai_usage)) {
    return empty;
  }
  if (_isAiUsageV2(s.ai_usage)) {
    return { schema_version: 2, providers: { ...s.ai_usage.providers } };
  }
  // v1 平铺 → 当 minimax
  const migrated = { schema_version: 2, providers: { minimax: { ...s.ai_usage } } };
  patchState((next) => {
    next.ai_usage = migrated;
  }, statePath);
  return migrated;
}

/**
 * 读某 provider 的 AI 配额快照. 无 → null.
 * @param {string} providerId
 * @param {string} [statePath]
 * @returns {object|null}
 */
function loadAiUsageSnapshotProvider(providerId, statePath = defaultPath()) {
  if (typeof providerId !== "string" || !providerId) return null;
  const v2 = _ensureAiUsageV2(statePath);
  const snap = v2.providers[providerId];
  if (!snap || typeof snap !== "object") return null;
  return { ...snap };
}

/**
 * 写某 provider 的快照 (atomic, 不影响其它 provider / 字段).
 * @param {string} providerId
 * @param {object} snapshot
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveAiUsageSnapshotProvider(providerId, snapshot, statePath = defaultPath()) {
  if (typeof providerId !== "string" || !providerId) {
    throw new TypeError("saveAiUsageSnapshotProvider: providerId must be non-empty string");
  }
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError("saveAiUsageSnapshotProvider: snapshot must be plain object");
  }
  const v2 = _ensureAiUsageV2(statePath);
  v2.providers[providerId] = { ...snapshot };
  return patchState((next) => {
    next.ai_usage = { schema_version: 2, providers: { ...v2.providers } };
  }, statePath);
}

/**
 * 读某 provider 的 history. 无 → { days: [] }.
 * @param {string} providerId
 * @param {string} [statePath]
 * @returns {{days: Array}}
 */
function loadAiUsageHistoryProvider(providerId, statePath = defaultPath()) {
  if (typeof providerId !== "string" || !providerId) return { days: [] };
  const s = load(statePath);
  if (!s || !s.ai_usage_history || typeof s.ai_usage_history !== "object") {
    return { days: [] };
  }
  let days;
  if (_isAiUsageV2(s.ai_usage_history)) {
    const ph =
      s.ai_usage_history.providers &&
      s.ai_usage_history.providers[providerId];
    days = ph && Array.isArray(ph.days) ? ph.days : [];
  } else if (providerId === "minimax") {
    // v1 平铺 history → minimax
    days = Array.isArray(s.ai_usage_history.days) ? s.ai_usage_history.days : [];
  } else {
    days = [];
  }
  return { days: cleanExpiredUsageHistory(days) };
}

/**
 * 追加/更新某 provider 当天的 history entry.
 * @param {string} providerId
 * @param {{date: string, used?: number, percent: number}} entry
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function appendAiUsageHistoryDayProvider(
  providerId,
  entry,
  statePath = defaultPath(),
) {
  if (typeof providerId !== "string" || !providerId) {
    throw new TypeError("appendAiUsageHistoryDayProvider: providerId must be non-empty string");
  }
  // 复用 v1 的 entry 校验逻辑 (日期格式 + percent 0-100 + used 类型)
  // 直接调 appendAiUsageHistoryDay 会写到 v1 平铺, 这里要写到 v2 providers 槽.
  if (
    !entry ||
    typeof entry.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
  ) {
    throw new TypeError("appendAiUsageHistoryDayProvider: entry.date must be YYYY-MM-DD");
  }
  if (typeof entry.percent !== "number" || !Number.isFinite(entry.percent) || entry.percent < 0 || entry.percent > 100) {
    throw new TypeError("appendAiUsageHistoryDayProvider: entry.percent must be 0-100 number");
  }
  if (entry.used != null && (typeof entry.used !== "number" || !Number.isFinite(entry.used) || entry.used < 0)) {
    throw new TypeError("appendAiUsageHistoryDayProvider: entry.used (if present) must be non-negative number");
  }

  const existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {}, mutes: {} };
  const cur = existing.ai_usage_history;
  let providers;
  if (cur && _isAiUsageV2(cur)) {
    providers = { ...cur.providers };
  } else if (cur && Array.isArray(cur.days)) {
    // v1 平铺 → minimax
    providers = { minimax: { days: cur.days } };
  } else {
    providers = {};
  }
  const slot = providers[providerId];
  const oldDays = slot && Array.isArray(slot.days) ? slot.days : [];
  const map = new Map();
  for (const d of oldDays) {
    if (d && typeof d.date === "string") map.set(d.date, d);
  }
  const prev = map.get(entry.date);
  const percent = Math.max(prev && typeof prev.percent === "number" ? prev.percent : 0, entry.percent);
  let used = prev && typeof prev.used === "number" ? prev.used : null;
  if (typeof entry.used === "number") {
    used = Math.max(used == null ? 0 : used, entry.used);
  }
  map.set(entry.date, {
    date: entry.date,
    percent,
    used: typeof used === "number" ? used : null,
    updatedAt: Date.now(),
  });
  providers[providerId] = { days: cleanExpiredUsageHistory([...map.values()]) };

  return patchState((next) => {
    next.ai_usage_history = { schema_version: 2, providers: { ...providers } };
  }, statePath);
}


//
// 用途: 启动时把 "Step B 之前已经分类过的 app" 从 state.json 拿出来,
// 注入到 category module 的 LLM cache (避免重复调 LLM).
// 写盘函数: main 调 LLM 拿到结果后, merge 旧值 + 新值再写盘 (不丢).
//
// Schema: state.json.classify_llm_cache = { "kimi": "ai", "kodi": "media", ... }
// key 是 lowercase appName (跟 category module 一致).

function loadLLMClassifyCache(statePath = defaultPath()) {
  const s = load(statePath);
  if (
    !s ||
    !s.classify_llm_cache ||
    typeof s.classify_llm_cache !== "object" ||
    Array.isArray(s.classify_llm_cache)
  )
    return {};
  // 简单 trim: 只保留 string → string
  const out = {};
  for (const [k, v] of Object.entries(s.classify_llm_cache)) {
    if (
      typeof k === "string" &&
      k.length > 0 &&
      typeof v === "string" &&
      v.length > 0
    ) {
      out[k] = v;
    }
  }
  return out;
}

function saveLLMClassifyCache(map, statePath = defaultPath()) {
  if (map == null || typeof map !== "object" || Array.isArray(map)) {
    throw new TypeError("saveLLMClassifyCache: map must be plain object");
  }
  // 简单 trim
  const trimmed = {};
  for (const [k, v] of Object.entries(map)) {
    if (
      typeof k === "string" &&
      k.length > 0 &&
      typeof v === "string" &&
      v.length > 0
    ) {
      trimmed[k] = v;
    }
  }
  return patchState((next, existing) => {
    // 合并: 旧值 + 新值, 新值覆盖旧值 (新分类优先)
    next.classify_llm_cache = {
      ...(existing.classify_llm_cache || {}),
      ...trimmed,
    };
  }, statePath);
}

function _backupCorruptState(statePath) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  // Pattern: <dirname>/state.corrupt-<ts>.json
  //  - "state.corrupt-" 是固定的字面 anchor, 测试 + 取证都靠它一眼定位损坏的 backup.
  //  - 时间戳 (ISO 替换 : 和 .) 防止同一次启动内多次损坏互相覆盖.
  //  - 跟原 statePath 的 basename 解耦, 即使将来 statePath 改名也不会污染历史 backup.
  const dir = path.dirname(statePath);
  const backupPath = path.join(dir, `state.corrupt-${ts}.json`);
  try {
    renameSync(statePath, backupPath);
    return { ok: true, backupPath };
  } catch (err) {
    // Best-effort: backup failure must not block startup
    try {
      const { mainLog } = require("./log");
      mainLog.warn(
        `state-store: failed to back up corrupt state to ${backupPath}: ${err && err.message}`,
      );
    } catch {
      /* log module may not exist in test env; swallow */
    }
    return { ok: false, error: err && err.message };
  }
}

/**
 * Phase Q8: safe startup entry point. On corrupt state, back up the file and
 * return null (so the caller falls back to the default baseline). Records
 * the recovery event for the renderer to consume via getLastRecoveryEvent.
 *
 * @param {string} [statePath]
 * @returns {object|null}
 */
function loadOrRecover(statePath = defaultPath()) {
  try {
    const state = _loadOrThrow(statePath);
    // Successful load — clear any stale event from a previous boot
    _lastRecoveryEvent = null;
    return state;
  } catch (err) {
    if (err && err.name === "StateCorruptedError") {
      const backup = _backupCorruptState(statePath);
      const event = {
        path: statePath,
        backup: backup.ok ? backup.backupPath : null,
        backupFailed: !backup.ok,
        reason: err.parseError ? "parse_failed" : "schema_failed",
        errors: Array.isArray(err.schemaErrors) && err.schemaErrors.length > 0
          ? err.schemaErrors
          : (err.parseError && err.parseError.message ? [err.parseError.message] : []),
        ts: Date.now(),
      };
      _lastRecoveryEvent = event;
      return null; // baseline will be used by patchState
    }
    throw err; // unrelated IO error — propagate
  }
}

/**
 * Phase Q8: consume-once accessor for the last recovery event. Returns the
 * event on first call, null thereafter. The renderer asks for this once at
 * bootstrap; if null, no banner is shown.
 */
function getLastRecoveryEvent() {
  const evt = _lastRecoveryEvent;
  _lastRecoveryEvent = null; // consume
  return evt;
}

module.exports = {
  load,
  saveAll,
  saveOne,
  markNotified,
  defaultPath,
  initStateStorePaths,
  migrateLegacyStateIfNeeded,
  SCHEMA_VERSION,
  writeAtomic, // 暴露给同进程的 fund-store 复用 (跟 saveAll 一致 atomic)
  patchState, // 公共 patch 范式, 给 fund-store / news-store / bets-store 等使用
  // Phase 27
  isMuteActive,
  cleanExpiredMutes,
  getMutes,
  setMute,
  clearMute,
  // Phase 29
  loadLastOpened,
  saveLastOpened,
  // Phase A (App Categorization)
  loadActiveCategory,
  saveActiveCategory,
  // AI 任务总结缓存 (重做版)
  TASK_SUMMARIES_GC_DAYS,
  cleanExpiredTaskSummaries,
  loadTaskSummaries,
  saveTaskSummary,
  loadAISessionsConfig,
  saveAISessionsConfig,
  // AI 配额快照
  loadAiUsageSnapshot,
  saveAiUsageSnapshot,
  // AI 配额快照 v2 (多 provider)
  loadAiUsageSnapshotProvider,
  saveAiUsageSnapshotProvider,
  // AI 配额历史 (sparkline 用)
  USAGE_HISTORY_GC_DAYS,
  USAGE_HISTORY_MAX_DAYS,
  cleanExpiredUsageHistory,
  loadAiUsageHistory,
  appendAiUsageHistoryDay,
  // AI 配额历史 v2 (多 provider)
  loadAiUsageHistoryProvider,
  appendAiUsageHistoryDayProvider,
  // Step B: LLM classify cache 持久化
  loadLLMClassifyCache,
  saveLLMClassifyCache,
  // v2.9.0: 世界杯 Football.TXT 缓存 (24h TTL, fetcher 调用)
  loadWorldcupTxt,
  saveWorldcupTxt,
  loadWorldcupScores,
  saveWorldcupScores,
  loadWorldcupMatchInsights,
  saveWorldcupMatchInsights,
  // 世界杯淘汰赛 bracket 快照
  loadWorldcupBracket,
  saveWorldcupBracket,
  // Phase Q8: state.json corruption self-recovery
  StateCorruptedError,
  loadOrRecover,
  getLastRecoveryEvent,
  // Phase I5: daily digest sub-state
  saveDailyDigest,
  loadDailyDigest,
  // Phase C2: per-app snooze
  setAppSnooze,
  clearAppSnooze,
  loadAppSnooze,
  // Twitter Serenity (spec 2026-06-22)
  DEFAULT_TWITTER_SOURCES,
  loadTwitterCache,
  saveTwitterCache,
  loadTwitterSources,
  saveTwitterSources,
};
