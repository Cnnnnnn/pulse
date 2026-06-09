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

const fs = require('fs');
const path = require('path');
const os = require('os');

const SCHEMA_VERSION = 1;

// ─── 新字段 preserve helper (Phase v2.5.2) ─────────────────────────
//
// 用途: 让 saveAll / setMute / clearMute / saveLastOpened / saveActiveCategory
//       / saveDailyDigest / saveAISessionsConfig 在写盘时自动保留这些 "patch 后
//       加的" 字段, 避免被覆盖丢.
//
// 当前 preserve 的字段:
//   - last_digest_attempts: ring buffer (排查 digest never runs 用)
//   - classify_llm_cache: { appName: catId } (Step B LLM classify 用)
//
// 注: caller 不应该 mutate existing 直接, 应该从 load() 拿 immutable 副本.
// 保留策略: 如果 next 里已经有这字段 (caller 显式设), 用 next 的; 否则从 existing 拿.
function preserveExtraFields(existing, next) {
  if (!existing || typeof existing !== 'object') return next;
  if (!next || typeof next !== 'object') return next;
  if (!('last_digest_attempts' in next) && Array.isArray(existing.last_digest_attempts)) {
    next.last_digest_attempts = existing.last_digest_attempts;
  }
  if (!('classify_llm_cache' in next) && existing.classify_llm_cache && typeof existing.classify_llm_cache === 'object') {
    next.classify_llm_cache = existing.classify_llm_cache;
  }
  return next;
}

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
    last_opened: existing.last_opened || {},
    active_category: existing.active_category || 'all',
    daily_digests: cleanExpiredDigests(existing.daily_digests || {}, now),
  };
  if (existing.ai_sessions_config) {
    next.ai_sessions_config = existing.ai_sessions_config;
  }
  preserveExtraFields(existing, next);
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
    last_opened: existing.last_opened || {},
    active_category: existing.active_category || 'all',
    daily_digests: cleanExpiredDigests(existing.daily_digests || {}, now),
  };
  if (existing.ai_sessions_config) {
    next.ai_sessions_config = existing.ai_sessions_config;
  }
  preserveExtraFields(existing, next);
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
    last_opened: existing.last_opened || {},
    active_category: existing.active_category || 'all',
    daily_digests: cleanExpiredDigests(existing.daily_digests || {}, now),
  };
  if (existing.ai_sessions_config) {
    next.ai_sessions_config = existing.ai_sessions_config;
  }
  preserveExtraFields(existing, next);
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
    last_opened: existing.last_opened || {},
    active_category: existing.active_category || 'all',
    daily_digests: cleanExpiredDigests(existing.daily_digests || {}, now),
  };
  if (existing.ai_sessions_config) {
    next.ai_sessions_config = existing.ai_sessions_config;
  }
  preserveExtraFields(existing, next);
  writeAtomic(statePath, next);
  return next;
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
  if (!s.last_opened || typeof s.last_opened !== 'object' || Array.isArray(s.last_opened)) return {};
  return s.last_opened;
}

/**
 * 写 last_opened 字段. atomic write, 保留 apps / mutes.
 * @param {object} map  { [name]: { ms, source } }
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveLastOpened(map, statePath = defaultPath()) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new TypeError('saveLastOpened: map must be plain object');
  }
  const existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {}, mutes: {} };
  const now = Date.now();
  const next = {
    v: SCHEMA_VERSION,
    ts: now,
    apps: existing.apps || {},
    mutes: cleanExpiredMutes(existing.mutes || {}, now),
    last_opened: map,
    active_category: existing.active_category || 'all',
    daily_digests: cleanExpiredDigests(existing.daily_digests || {}, now),
  };
  if (existing.ai_sessions_config) {
    next.ai_sessions_config = existing.ai_sessions_config;
  }
  preserveExtraFields(existing, next);
  writeAtomic(statePath, next);
  return next;
}

// ─── Phase B (AI Sessions Daily Digest) ────────────────────────
// 30 天外 digests 自动 GC, 跟 mutes / last_opened 同款处理.
// 字段: daily_digests = { [dateKey]: Digest }
//   Digest: { dateKey, generatedAt, provider, model, sessionCount, summary, sessionIds }
//   ai_sessions_config = { enabled, provider, model, ollama: {host, model}, cloud: {providerId, model} }

const DAILY_DIGESTS_GC_DAYS = 30;

/**
 * GC: 删 30 天外的 digests. 写盘前调 (跟 cleanExpiredMutes 风格一致).
 * 30 是默认, 后续可让 config 覆盖 (spec §3.1).
 * @param {object} digests  { [dateKey]: Digest }
 * @param {number} now      epoch ms
 * @returns {object} 新的 digests (新引用, 不 mutate 原对象)
 */
function cleanExpiredDigests(digests, now) {
  if (!digests || typeof digests !== 'object') return {};
  const out = {};
  const cutoffMs = now - DAILY_DIGESTS_GC_DAYS * 86400_000;
  for (const [dateKey, d] of Object.entries(digests)) {
    if (!d || typeof d !== 'object' || typeof d.dateKey !== 'string') continue;
    // generatedAt 不存在或早于 cutoff → 删
    if (typeof d.generatedAt !== 'number' || d.generatedAt < cutoffMs) {
      // spec 写 "30 天外" — 但 daily_digests 通常是昨天/前天/... 极少有 generatedAt
      // 来自很老的时间 (例如手动 import 旧数据). cutoff 命中就 GC.
      continue;
    }
    out[dateKey] = d;
  }
  return out;
}

/**
 * 读 digests. 老 state.json (无 daily_digests 字段) → {} (兼容).
 * @param {string} [statePath]
 * @returns {object} { [dateKey]: Digest }
 */
function loadDailyDigests(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s) return {};
  if (!s.daily_digests || typeof s.daily_digests !== 'object' || Array.isArray(s.daily_digests)) return {};
  return cleanExpiredDigests(s.daily_digests, Date.now());
}

/**
 * 检查指定 dateKey 是否已有 digest. 给 DailyDigestRunner idempotent 用.
 * @param {string} dateKey
 * @param {string} [statePath]
 * @returns {boolean}
 */
function hasDailyDigest(dateKey, statePath = defaultPath()) {
  if (typeof dateKey !== 'string' || dateKey.length === 0) return false;
  const s = load(statePath);
  if (!s || !s.daily_digests || typeof s.daily_digests !== 'object') return false;
  return Boolean(s.daily_digests[dateKey]);
}

/**
 * 写一条 digest. atomic write, 保留 apps / mutes / last_opened / active_category.
 * @param {object} digest  Digest
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveDailyDigest(digest, statePath = defaultPath()) {
  if (!digest || typeof digest !== 'object' || typeof digest.dateKey !== 'string') {
    throw new TypeError('saveDailyDigest: digest must have non-empty dateKey');
  }
  if (digest.dateKey.length === 0) {
    throw new TypeError('saveDailyDigest: digest.dateKey must be non-empty');
  }
  const existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {}, mutes: {} };
  const now = Date.now();
  const digests = cleanExpiredDigests(existing.daily_digests || {}, now);
  digests[digest.dateKey] = { ...digest, generatedAt: typeof digest.generatedAt === 'number' ? digest.generatedAt : now };
  const next = {
    v: SCHEMA_VERSION,
    ts: now,
    apps: existing.apps || {},
    mutes: cleanExpiredMutes(existing.mutes || {}, now),
    last_opened: existing.last_opened || {},
    active_category: existing.active_category || 'all',
    daily_digests: digests,
  };
  preserveExtraFields(existing, next);
  writeAtomic(statePath, next);
  return next;
}

/**
 * 读 AI sessions config. 老 state.json (无 ai_sessions_config 字段) → null (缺省).
 * @param {string} [statePath]
 * @returns {object|null}
 */
function loadAISessionsConfig(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s || !s.ai_sessions_config || typeof s.ai_sessions_config !== 'object') return null;
  return { ...s.ai_sessions_config };
}

// ─── Digest 启动期 trail (排查用) ─────────────────────────
//
// 用途: main bootstrap 期间记录 "merged_config" / "wiring_build" / "bootstrap" 三个
// 关键 phase 的状态, 写到 state.json.last_digest_attempts[] (ring buffer, 最多 8 条).
// 排查 "digest never runs" 时: 用户拿 state.json 给我看, 我能直接看到:
//   - merged config enabled? provider? detectors?
//   - wiring build ok?
//   - bootstrap 跑到哪? yesterday backfill 状态?
// 走 atomic write, 不破坏其他字段. 失败 log warn 不 throw.

const DIGEST_ATTEMPT_BUFFER_MAX = 8;

function recordDigestAttempt(entry, statePath = defaultPath()) {
  if (!entry || typeof entry !== 'object') return;
  const now = Date.now();
  const record = {
    ts: now,
    phase: typeof entry.phase === 'string' ? entry.phase : 'unknown',
    ok: Boolean(entry.ok),
    reason: typeof entry.reason === 'string' ? entry.reason : null,
    provider: typeof entry.provider === 'string' ? entry.provider : null,
    detectors: typeof entry.detectors === 'string' ? entry.detectors : null,
    enabled: typeof entry.enabled === 'boolean' ? entry.enabled : null,
    yesterdayStatus: typeof entry.yesterdayStatus === 'string' ? entry.yesterdayStatus : null,
    backfillStatus: typeof entry.backfillStatus === 'string' ? entry.backfillStatus : null,
  };
  let existing;
  try {
    existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {}, mutes: {} };
  } catch (err) {
    // load 失败也不 throw, 只 log warn — 排查 patch 不能雪崩
    // eslint-disable-next-line no-console
    console.warn('[state-store] recordDigestAttempt: load failed', err && err.message);
    return;
  }
  const attempts = Array.isArray(existing.last_digest_attempts) ? existing.last_digest_attempts.slice() : [];
  attempts.push(record);
  // ring buffer: 只留最近 N 条
  const trimmed = attempts.length > DIGEST_ATTEMPT_BUFFER_MAX
    ? attempts.slice(attempts.length - DIGEST_ATTEMPT_BUFFER_MAX)
    : attempts;
  const next = {
    v: SCHEMA_VERSION,
    ts: now,
    apps: existing.apps || {},
    mutes: cleanExpiredMutes(existing.mutes || {}, now),
    last_opened: existing.last_opened || {},
    active_category: existing.active_category || 'all',
    daily_digests: cleanExpiredDigests(existing.daily_digests || {}, now),
    last_digest_attempts: trimmed,
  };
  if (existing.ai_sessions_config) next.ai_sessions_config = existing.ai_sessions_config;
  // recordDigestAttempt 本身是 last_digest_attempts 字段的写入方, preserveExtraFields
  // 会自动跳过 (next 已有该字段), 但 classify_llm_cache 需要从 existing 保留.
  preserveExtraFields(existing, next);
  try {
    writeAtomic(statePath, next);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[state-store] recordDigestAttempt: writeAtomic failed', err && err.message);
  }
}

function loadDigestAttempts(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s || !Array.isArray(s.last_digest_attempts)) return [];
  return s.last_digest_attempts.slice();
}


/**
 * 写 AI sessions config. atomic write, 保留 apps / mutes / last_opened / active_category / daily_digests.
 * @param {object} cfg
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveAISessionsConfig(cfg, statePath = defaultPath()) {
  if (cfg != null && typeof cfg !== 'object') {
    throw new TypeError('saveAISessionsConfig: cfg must be object or null');
  }
  const existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {}, mutes: {} };
  const now = Date.now();
  const next = {
    v: SCHEMA_VERSION,
    ts: now,
    apps: existing.apps || {},
    mutes: cleanExpiredMutes(existing.mutes || {}, now),
    last_opened: existing.last_opened || {},
    active_category: existing.active_category || 'all',
    daily_digests: cleanExpiredDigests(existing.daily_digests || {}, now),
  };
  if (cfg == null) {
    // 显式清除字段
  } else {
    next.ai_sessions_config = { ...cfg };
  }
  preserveExtraFields(existing, next);
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
  if (!s) return 'all';
  const v = s.active_category;
  if (typeof v !== 'string' || v.length === 0) return 'all';
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
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError('saveActiveCategory: id must be non-empty string');
  }
  const existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {}, mutes: {} };
  const now = Date.now();
  const next = {
    v: SCHEMA_VERSION,
    ts: now,
    apps: existing.apps || {},
    mutes: cleanExpiredMutes(existing.mutes || {}, now),
    last_opened: existing.last_opened || {},
    active_category: id,
  };
  preserveExtraFields(existing, next);
  writeAtomic(statePath, next);
  return next;
}

// ─── Step B: LLM classify cache 持久化 ─────────────────────────
//
// 用途: 启动时把 "Step B 之前已经分类过的 app" 从 state.json 拿出来,
// 注入到 category module 的 LLM cache (避免重复调 LLM).
// 写盘函数: main 调 LLM 拿到结果后, merge 旧值 + 新值再写盘 (不丢).
//
// Schema: state.json.classify_llm_cache = { "kimi": "ai", "kodi": "media", ... }
// key 是 lowercase appName (跟 category module 一致).

function loadLLMClassifyCache(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s || !s.classify_llm_cache || typeof s.classify_llm_cache !== 'object' || Array.isArray(s.classify_llm_cache)) return {};
  // 简单 trim: 只保留 string → string
  const out = {};
  for (const [k, v] of Object.entries(s.classify_llm_cache)) {
    if (typeof k === 'string' && k.length > 0 && typeof v === 'string' && v.length > 0) {
      out[k] = v;
    }
  }
  return out;
}

function saveLLMClassifyCache(map, statePath = defaultPath()) {
  if (map == null || typeof map !== 'object' || Array.isArray(map)) {
    throw new TypeError('saveLLMClassifyCache: map must be plain object');
  }
  // 简单 trim
  const trimmed = {};
  for (const [k, v] of Object.entries(map)) {
    if (typeof k === 'string' && k.length > 0 && typeof v === 'string' && v.length > 0) {
      trimmed[k] = v;
    }
  }
  const existing = load(statePath) || { v: SCHEMA_VERSION, ts: 0, apps: {}, mutes: {} };
  const now = Date.now();
  // 合并: 旧值 + 新值, 新值覆盖旧值 (新分类优先)
  const merged = { ...(existing.classify_llm_cache || {}), ...trimmed };
  const next = {
    v: SCHEMA_VERSION,
    ts: now,
    apps: existing.apps || {},
    mutes: cleanExpiredMutes(existing.mutes || {}, now),
    last_opened: existing.last_opened || {},
    active_category: existing.active_category || 'all',
    daily_digests: cleanExpiredDigests(existing.daily_digests || {}, now),
    classify_llm_cache: merged,
  };
  if (existing.ai_sessions_config) next.ai_sessions_config = existing.ai_sessions_config;
  // next 已设 classify_llm_cache 字段, preserveExtraFields 会自动跳过该字段,
  // 但会保留 last_digest_attempts 防止被吃.
  preserveExtraFields(existing, next);
  writeAtomic(statePath, next);
  return next;
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
  // Phase 29
  loadLastOpened,
  saveLastOpened,
  // Phase A (App Categorization)
  loadActiveCategory,
  saveActiveCategory,
  // Phase B (AI Sessions Daily Digest)
  DAILY_DIGESTS_GC_DAYS,
  cleanExpiredDigests,
  loadDailyDigests,
  hasDailyDigest,
  saveDailyDigest,
  loadAISessionsConfig,
  saveAISessionsConfig,
  // 排查 patch: digest 启动期 trail (Phase B "never runs" 排查)
  recordDigestAttempt,
  loadDigestAttempts,
  DIGEST_ATTEMPT_BUFFER_MAX,
  // Step B: LLM classify cache 持久化
  loadLLMClassifyCache,
  saveLLMClassifyCache,
};
