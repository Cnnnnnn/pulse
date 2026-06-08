/**
 * src/renderer/store.js
 *
 * Preact signals 单例 store —— 整个 renderer 共享一份状态。
 *
 * 关键设计：
 *  - `apps` / `results` / `checkStatus` 是公开 signal
 *  - 每个 app 单独持有一份 `result` signal (在 resultSignals Map 里)，
 *    这样 applyProgress(name) → 只触发订阅该 name 的 <AppRow> 重渲染，
 *    其它 row 不动。这是 spec §7 规定的 "局部更新" 不变量。
 *  - `results` Map signal 是 grouping 的真相源；`resultsBySection` (computed)
 *    依赖它做分组。app 完成一次 status 变化时，Map 变化 → resultsBySection
 *    重算 → Section 重渲染，但 Section 内部用稳定 `key={name}` 复用 AppRow
 *    实例，所以"只该 row 重渲染"依然成立。
 *  - 暴露 resetCheck() / finishCheck() / applyProgress() 是单向数据流 API，
 *    外部不直接 .value = ...
 */

import { signal, computed } from '@preact/signals';
import * as category from '../config/category.js';

// ─── 公开 signals ──────────────────────────────────────
export const apps = signal([]);                  // 从 config 加载的 app 列表
export const results = signal(new Map());        // name → latest result
export const checkStatus = signal('idle');       // 'idle' | 'running' | 'done' | 'error'
export const checkStartTime = signal(null);
export const checkDuration = signal(null);
export const lastError = signal(null);           // 整轮 check 出错时的 message

// Phase 19: 完整 cached state (含 changelog_history) — 给 WeeklyBanner 算周报用
export const cachedState = signal(null);

// Phase 23: Search + Filter 状态. FilterBar 写, selectors 读.
// searchQuery: 当前 search 框内容 (string). activeFilter: 'all' | 'update' | 'latest' | 'error'.
export const searchQuery = signal('');
export const activeFilter = signal('all');

// Phase A (App Categorization): 当前选中的顶部 category tab.
//   - 'all'    -> 全部 (默认, 不过滤)
//   - categoryId -> 仅显示该 categoryId 的 app (e.g. 'ai', 'dev')
// 持久化到 state.json.active_category; 还原由 loadActiveCategory() 完成.
export const activeCategory = signal('all');

// Phase B5 (AI Sessions Daily Digest): 昨日 digest banner
//   - dailyDigest: 从 state.json.daily_digests[yesterday] 拿, 或 IPC 'ai-sessions:get-current' 拿
//   - digestLoading: rerun / backfill 中
//   - aiSessionsEnabled: config.aiSessions.enabled (banner 整体显隐)
export const dailyDigest = signal(null);
export const digestLoading = signal(false);
export const aiSessionsEnabled = signal(false);

// Phase 27: Mutes. Map<name, {until, reason}>.
//   - until: 0 = 永远, >0 = epoch ms 到期
//   - reason: 'manual' 现阶段; 后续 'auto-cooldown' 之类
// bootstrap 时通过 api.getMutes() 填进来. 后续 setMute/clearMute 经 IPC
// 写到主进程 state.json 后, 再回写这个 signal (保证本地状态 = 主进程状态).
export const mutedApps = signal(new Map());

/**
 * 判断某个 app 当前是否被静音 (考虑 expiry).
 * @param {string} name
 * @param {number} [now]   注入便于测试, 默认 Date.now()
 * @returns {boolean}
 */
export function isMuted(name, now) {
  if (!name) return false;
  const m = mutedApps.value.get(name);
  if (!m) return false;
  const t = (typeof now === 'number') ? now : Date.now();
  if (!m.until) return true;        // 0 = 永远
  return t < m.until;
}

// Phase 29: Last-opened. Map<name, {ms, source}>.
//   - ms: 0/负 = 不知道 / 错误, >0 = epoch ms
//   - source: 'spotlight' | 'atime' | 'unknown'
// bootstrap 时通过 api.getLastOpened() 填进来. 主进程在 checkUpdates 完成后
// 推 last-opened-updated 事件, signal 也回写.
export const lastOpenedApps = signal(new Map());

/**
 * 纯函数: 给一个 lastMs + now, 算出 tier.
 * 跟主进程 tier.js 同 logic (前端不调 IPC, 减少主进程来回).
 * @param {number|null} lastMs
 * @param {number} [now]
 * @returns {'hot'|'warm'|'cold'|'unknown'}
 */
export function getLocalTier(lastMs, now) {
  if (lastMs == null || typeof lastMs !== 'number') return 'unknown';
  const t = (typeof now === 'number') ? now : Date.now();
  if (t < lastMs) return 'unknown';
  const ageDays = (t - lastMs) / 86400_000;
  if (ageDays <= 7) return 'hot';
  if (ageDays <= 30) return 'warm';
  return 'cold';
}

/**
 * Mute 一个 app. 写主进程 + 同步本地 signal. durationSec=0 表示永远.
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function setMute(name, durationSec) {
  if (!name || typeof name !== 'string') return { ok: false, reason: 'invalid_name' };
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec < 0) {
    return { ok: false, reason: 'invalid_duration' };
  }
  // 走 api 而不是直接调 ipcRenderer, 测试好 mock
  // eslint-disable-next-line no-undef
  const { api } = await import('./api.js');
  const r = await api.setMute(name, durationSec);
  if (r && r.ok && r.mutes) {
    // 同步本地
    const next = new Map();
    for (const [k, v] of Object.entries(r.mutes)) next.set(k, v);
    mutedApps.value = next;
    return { ok: true };
  }
  return { ok: false, reason: (r && r.reason) || 'threw' };
}

/**
 * 取消静音.
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function clearMute(name) {
  if (!name || typeof name !== 'string') return { ok: false, reason: 'invalid_name' };
  // eslint-disable-next-line no-undef
  const { api } = await import('./api.js');
  const r = await api.clearMute(name);
  if (r && r.ok && r.mutes) {
    const next = new Map();
    for (const [k, v] of Object.entries(r.mutes)) next.set(k, v);
    mutedApps.value = next;
    return { ok: true };
  }
  return { ok: false, reason: (r && r.reason) || 'threw' };
}

/**
 * Bootstrap 时调用: 从主进程拉一次 mutes, 填到 signal.
 * @returns {Promise<object>} 当前 mutes
 */
export async function loadMutes() {
  // eslint-disable-next-line no-undef
  const { api } = await import('./api.js');
  try {
    const r = await api.getMutes();
    const mutes = (r && r.mutes) || {};
    const next = new Map();
    for (const [k, v] of Object.entries(mutes)) next.set(k, v);
    mutedApps.value = next;
    return mutes;
  } catch {
    mutedApps.value = new Map();
    return {};
  }
}

/**
 * Bootstrap 时调用: 从主进程拉一次 last-opened, 填到 signal.
 * @returns {Promise<object>} 当前 last_opened map
 */
export async function loadLastOpened() {
  // eslint-disable-next-line no-undef
  const { api } = await import('./api.js');
  try {
    const r = await api.getLastOpened();
    const lo = (r && r.lastOpened) || {};
    const next = new Map();
    for (const [k, v] of Object.entries(lo)) next.set(k, v);
    lastOpenedApps.value = next;
    return lo;
  } catch {
    lastOpenedApps.value = new Map();
    return {};
  }
}

/**
 * 触发主进程 refresh-last-opened (fire-and-forget).
 * 主进程完成后会推 last-opened-updated 事件, store 监听自动回写 signal.
 * @returns {Promise<{ok: boolean, count: number}>}
 */
export async function refreshLastOpened() {
  // eslint-disable-next-line no-undef
  const { api } = await import('./api.js');
  try {
    return await api.refreshLastOpened();
  } catch {
    return { ok: false, count: 0 };
  }
}

// ─── Phase A: Active category tab ──────────────────────────

/**
 * 设置 active category tab + 异步写 state.json.
 * 同步: signal.value 立即更新 (驱动 UI)
 * 异步: api.saveActiveCategory 走 IPC 写盘; 失败 log warn 不 throw.
 *
 * 复用 setMute 模式: dynamic import('./api.js') 避免循环依赖.
 *
 * @param {string} id    'all' 或 categoryId (e.g. 'ai', 'dev')
 */
export function setActiveCategory(id) {
  if (typeof id !== 'string' || id.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[store] setActiveCategory: id must be non-empty string, got', id);
    return;
  }
  activeCategory.value = id;
  // 异步落盘, 失败 log warn, 不影响 UI
  // eslint-disable-next-line no-undef
  import('./api.js').then(({ api }) => {
    if (api && typeof api.saveActiveCategory === 'function') {
      // api.saveActiveCategory 可能是真实 promise (preload) 也可能是 noop (测试)
      const p = api.saveActiveCategory(id);
      if (p && typeof p.then === 'function') {
        p.then(
          () => {},
          (err) => {
            // eslint-disable-next-line no-console
            console.warn('[store] saveActiveCategory failed:', err && err.message);
          }
        );
      }
    }
  });
}

/**
 * Bootstrap 时调用: 从主进程拉一次 active_category, 填到 signal.
 * 跟 loadMutes / loadLastOpened 风格一致.
 * @returns {Promise<string>} 当前 active_category id
 */
export async function loadActiveCategory() {
  // eslint-disable-next-line no-undef
  const { api } = await import('./api.js');
  try {
    const r = await api.getActiveCategory();
    const saved = (r && r.activeCategory) || 'all';
    if (typeof saved === 'string' && saved.length > 0) {
      activeCategory.value = saved;
    }
    return activeCategory.value;
  } catch {
    return 'all';
  }
}

// ─── Phase B5: AI Sessions Daily Digest ──────────────────────────

/**
 * 拿 digest 局部 setter (测试 / IPC 事件回写用).
 * @param {object|null} digest
 */
export function setDailyDigest(digest) {
  dailyDigest.value = digest;
}

export function setDigestLoading(loading) {
  digestLoading.value = Boolean(loading);
}

export function setAISessionsEnabled(enabled) {
  aiSessionsEnabled.value = Boolean(enabled);
}

/**
 * Bootstrap 时调用: 从主进程拉 (1) aiSessions config enabled 标志 + (2) 昨日 digest.
 * 失败 graceful — digest 留 null, enabled 留 false.
 * @returns {Promise<{enabled: boolean, hasDigest: boolean}>}
 */
export async function loadDailyDigest() {
  // eslint-disable-next-line no-undef
  const { api } = await import('./api.js');
  try {
    const r = await api.getCurrentDigest();
    setAISessionsEnabled(Boolean(r && r.enabled));
    setDailyDigest(r && r.digest ? r.digest : null);
    return { enabled: Boolean(r && r.enabled), hasDigest: Boolean(r && r.digest) };
  } catch {
    return { enabled: false, hasDigest: false };
  }
}

/**
 * 用户在 banner 点 🔄 调. 异步, 同步:
 *   - digestLoading=true
 *   - api.rerunDigest() 走 IPC
 *   - 成功: 写回 dailyDigest signal
 *   - 失败: log warn, 不 throw (UI 仍可用)
 * @returns {Promise<object|null>} 新 digest 或 null (失败)
 */
export async function rerunDigest() {
  digestLoading.value = true;
  try {
    // eslint-disable-next-line no-undef
    const { api } = await import('./api.js');
    const r = await api.rerunDigest();
    if (r && r.ok && r.digest) {
      dailyDigest.value = r.digest;
      return r.digest;
    }
    // eslint-disable-next-line no-console
    console.warn('[store] rerunDigest failed:', r && r.reason);
    return null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[store] rerunDigest threw:', err && err.message);
    return null;
  } finally {
    digestLoading.value = false;
  }
}

/**
 *订阅 main推的 ai-digest-updated事件,同步回写 signal. bootstrap 时调.
 */
export function subscribeDigestUpdates() {
 // eslint-disable-next-line no-undef
 import('./api.js').then(({ api }) => {
 if (api && typeof api.onDigestUpdated === 'function') {
 api.onDigestUpdated((data) => {
 if (data && data.digest) {
 dailyDigest.value = data.digest;
 }
 });
 }
 });
}

// 注: Phase 25 app 图标走 useIcon hook 的 module-level cache (hooks/useIcon.js),
//      不挂到全局 signal. AppAvatar 已经接好, 不再额外抽象.

// ─── Per-row signal 注册表 ──────────────────────────────
/**
 * name → signal<Result>。每个 result 单独一个 signal，AppRow 通过
 * getResultSignal(name) 拿到对应 signal 并订阅 .value —— 单 row 重渲染。
 */
const resultSignals = new Map();

/**
 * 取出（或惰性创建）app 对应的 result signal。
 * 外部用 useSignal 包装或直接读 .value 即可触发订阅。
 */
export function getResultSignal(name) {
  let sig = resultSignals.get(name);
  if (!sig) {
    sig = signal(undefined);
    resultSignals.set(name, sig);
  }
  return sig;
}

// ─── 变更 API ──────────────────────────────────────────
/**
 * 单个 app 完成一次检测（无论是首检还是后续 progress）。
 * 行为：
 *   1. 更新 results Map signal（驱动 resultsBySection 重算）
 *   2. 更新该 app 自己的 result signal（驱动 <AppRow> 局部更新）
 */
export function applyProgress(result) {
  if (!result || !result.name) return;
  const next = new Map(results.value);
  next.set(result.name, result);
  results.value = next;

  const sig = getResultSignal(result.name);
  sig.value = result;
}

/**
 * 启动新一轮检查：清空 results，把状态切到 running。
 * 不重置 apps（apps 是 config 来的，跨次检查不变）。
 */
export function resetCheck() {
  results.value = new Map();
  // 清空 per-row signals —— 旧结果不再展示，新结果会重新 set
  for (const sig of resultSignals.values()) {
    sig.value = undefined;
  }
  checkStartTime.value = Date.now();
  checkDuration.value = null;
  lastError.value = null;
  checkStatus.value = 'running';
}

/** 一轮 check 正常完成 */
export function finishCheck() {
  checkStatus.value = 'done';
  if (checkStartTime.value != null) {
    checkDuration.value = Date.now() - checkStartTime.value;
  }
}

/** 一轮 check 抛错 (顶层 catch) */
export function setError(message) {
  checkStatus.value = 'error';
  lastError.value = message || '未知错误';
}

/**
 * Phase 12: 从主进程 last-known state 应用结果.
 * 用法: bootstrap 时调用, 用户进 UI 立即看到上次的检测状态.
 * 不会触发新一轮 check; check 仍由 checkStatus 信号驱动.
 *
 * 注意: 缓存结果没有 `ts` 字段 (我们自己的), 实际上每个 result 都有 ts;
 * 渲染器看 result.ts 决定 stale badge.
 */
export function applyCachedResults(cached) {
  if (!cached || !cached.apps) return;
  const next = new Map(results.value);
  for (const [name, r] of Object.entries(cached.apps)) {
    if (!r || !r.name) continue;
    // 标 stale: 主进程的 ts 是 state-level 写入时间, 但我们想要 per-app 的 ts
    // 实际上 saveAll 给每个 result 单独塞了 ts (state-store.js:54)
    next.set(name, r);
    const sig = getResultSignal(name);
    sig.value = r;
  }
  results.value = next;
  // Phase 19: 缓存 state 整体也保留给 WeeklyBanner 用 (含 changelog_history)
  cachedState.value = cached;
}

// ─── 选择器 (selectors.js 也可访问 resultSignals) ───────
// 把 resultSignals重新导出供 selectors.js 用
export { resultSignals };

// ─── Phase B6c: AI Sessions Settings store ─────────────────────
// renderer-side store for AISettingsModal.走 IPC跟主进程 state.json / safeStorage同步.

//完整 ai_sessions_config (跟 state.json ai_sessions_config 同 shape):
// { enabled, provider, ollama: { host, model }, cloud: { providerId, model, baseUrl? } }
export const aiSessionsConfig = signal(null);

// 每个 provider 的 api key状态: { [providerId]: { hasKey: boolean, available: boolean } }
export const aiKeyStatus = signal({});

// modal open状态 —Settings按钮 toggle, AISettingsModal 受 open.value 控制 mount
export const aiSettingsOpen = signal(false);

// healthcheck 中 (用户在 modal 里点 "测试连接")
export const aiHealthcheckBusy = signal(false);
// 最新 healthcheck 结果: { ok, error?, latencyMs?, providerId } 或 null
export const aiHealthcheckResult = signal(null);

// ─── Setters (测试 + IPC事件回写) ──────────────────────────
export function setAISessionsConfig(cfg) {
 aiSessionsConfig.value = cfg && typeof cfg === 'object' ? cfg : null;
}
export function setAIKeyStatus(providerId, status) {
 const next = { ...aiKeyStatus.value };
 if (status === null || status === undefined) {
 delete next[providerId];
 } else {
 next[providerId] = status;
 }
 aiKeyStatus.value = next;
}
export function setAIKeyStatuses(map) {
 aiKeyStatus.value = (map && typeof map === 'object') ? { ...map } : {};
}
export function openAISettings(open = true) {
 aiSettingsOpen.value = Boolean(open);
}
export function setAIHealthcheckBusy(busy) {
 aiHealthcheckBusy.value = Boolean(busy);
}
export function setAIHealthcheckResult(r) {
 aiHealthcheckResult.value = r && typeof r === 'object' ? r : null;
}

// ─── Actions (走 IPC) ──────────────────────────────────────
/**
 * Bootstrap 时拉 ai_sessions_config. 老/没字段 → null.
 * @returns {Promise<object|null>}
 */
export async function loadAISessionsConfig() {
 const { api } = await import('./api.js');
 try {
 const r = await api.getAiSessionsConfig();
 setAISessionsConfig(r && r.config ? r.config : null);
 return aiSessionsConfig.value;
 } catch {
 return null;
 }
}

/**
 *探测所有4 个 cloud provider 的 key状态 (Modal打开时一次拉).
 * @returns {Promise<object>} { [providerId]: { hasKey, available } }
 */
export async function probeAIKeyStatuses() {
 const { api } = await import('./api.js');
 const providers = ['openai', 'anthropic', 'deepseek', 'minimax'];
 const next = {};
 await Promise.all(providers.map(async (id) => {
 try {
 const r = await api.hasAiKey(id);
 if (r && r.ok) next[id] = { hasKey: Boolean(r.hasKey), available: Boolean(r.available) };
 else next[id] = { hasKey: false, available: false };
 } catch {
 next[id] = { hasKey: false, available: false };
 }
 }));
 setAIKeyStatuses(next);
 return next;
}

/**
 *存 API key 到 safeStorage.成功 → 更新本地 keyStatus cache.
 * @param {string} providerId
 * @param {string} apiKey
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function setAIKey(providerId, apiKey) {
 const { api } = await import('./api.js');
 try {
 const r = await api.setAiKey(providerId, apiKey);
 if (r && r.ok) {
 setAIKeyStatus(providerId, { hasKey: true, available: true });
 return { ok: true };
 }
 return { ok: false, reason: r && r.reason };
 } catch (err) {
 return { ok: false, reason: 'threw', error: err && err.message };
 }
}

/**
 * 清 API key.成功 → 更新本地 cache.
 * @param {string} providerId
 * @returns {Promise<{ok: boolean}>}
 */
export async function clearAIKey(providerId) {
 const { api } = await import('./api.js');
 try {
 const r = await api.clearAiKey(providerId);
 if (r && r.ok) {
 setAIKeyStatus(providerId, { hasKey: false, available: true });
 return { ok: true };
 }
 return { ok: false };
 } catch {
 return { ok: false };
 }
}

/**
 * 测试当前/指定 provider 健康.走 IPC aiHealthcheck.
 * @param {object} opts { providerId, model?, apiKey?, baseUrl? }
 * @returns {Promise<{ok, error?, latencyMs?, status?}>}
 */
export async function runAIHealthcheck(opts) {
 const { api } = await import('./api.js');
 setAIHealthcheckBusy(true);
 try {
 const r = await api.aiHealthcheck(opts);
 setAIHealthcheckResult(r || { ok: false, error: 'no_response' });
 return r || { ok: false };
 } catch (err) {
 const out = { ok: false, error: (err && err.message) || 'unknown' };
 setAIHealthcheckResult(out);
 return out;
 } finally {
 setAIHealthcheckBusy(false);
 }
}

/**
 * 保存完整 ai_sessions_config 到 state.json (走 IPC).
 *成功 → 更新本地 signal + main也会推 ai-sessions-config-updated事件 (subscribeSync 处理).
 * @param {object} cfg
 * @returns {Promise<{ok, config?, reason?}>}
 */
export async function saveAISessionsConfig(cfg) {
 const { api } = await import('./api.js');
 try {
 const r = await api.saveAiSessionsConfig(cfg);
 if (r && r.ok) {
 setAISessionsConfig(r.config || cfg);
 return { ok: true, config: r.config };
 }
 return { ok: false, reason: r && r.reason };
 } catch (err) {
 return { ok: false, reason: 'threw', error: err && err.message };
 }
}

/**
 *订阅 main推的 ai-sessions-config-updated事件 (其它窗口/手工 save 时同步).
 * bootstrap 时调一次.
 */
export function subscribeAISessionsConfigUpdates() {
 import('./api.js').then(({ api }) => {
 if (api && typeof api.onAiSessionsConfigUpdated === 'function') {
 api.onAiSessionsConfigUpdated((data) => {
 if (data && data.config !== undefined) {
 setAISessionsConfig(data.config || null);
 }
 });
 }
 });
}

// ─── Phase B7a: Backfill progress ──────────────────────────────
//订阅 main推的 ai-digest-progress事件 (backfill 中每跑完1 天推1 次)。
//跟 dailyDigest / digestLoading配套:Header 显示 ⏳ N/T。

// backfillProgress: { active: bool, done: number, total: number }
export const backfillProgress = signal({ active: false, done:0, total:0 });

export function setBackfillProgress(progress) {
 if (progress && typeof progress === 'object') {
 backfillProgress.value = {
 active: Boolean(progress.active),
 done: Number(progress.done) ||0,
 total: Number(progress.total) ||0,
 };
 } else {
 backfillProgress.value = { active: false, done:0, total:0 };
 }
}

/**
 *订阅 main推的 ai-digest-progress事件 (B4c已在 main进程实现)。
 * payload: { done, total, source: 'backfill' }
 * bootstrap 时调一次。
 */
export function subscribeBackfillProgress() {
 import('./api.js').then(({ api }) => {
 if (api && typeof api.onDigestProgress === 'function') {
 api.onDigestProgress((data) => {
 if (!data) return;
 if (data.source === 'backfill') {
 const total = Number(data.total) ||0;
 const done = Number(data.done) ||0;
 if (done >= total && total >0) {
 // backfill 完成 →2s 后清 (给用户看到"完成"状态)
 setBackfillProgress({ active: true, done, total });
 setTimeout(() => setBackfillProgress({ active: false, done, total }),2000);
 } else {
 setBackfillProgress({ active: true, done, total });
 }
 }
 });
 }
 });
}

/**
 * 用户在 UI手动触发 backfill (走 IPC)。
 * @param {number} days 默认7
 * @returns {Promise<{ok, done?, total?}>}
 */
export async function triggerBackfill(days =7) {
 const { api } = await import('./api.js');
 try {
 const r = await api.backfillDigest(days);
 if (r && r.ok) {
 return { ok: true, done: r.done, total: r.total };
 }
 return { ok: false, reason: r && r.reason };
 } catch (err) {
 return { ok: false, reason: 'threw', error: err && err.message };
 }
}
