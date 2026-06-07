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
// 把 resultSignals 重新导出供 selectors.js 用
export { resultSignals };
