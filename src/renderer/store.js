/**
 * src/renderer/store.js
 *
 * Preact signals 单例 store —— 整个 renderer 共享一份状态。
 *
 * ── 核心重写 (v2): Session-Based Check Model ──
 *
 * 设计理念:
 *  - 每次检查 = 一个 Session (唯一 sessionId), 解决"会话识别不准确"问题
 *  - Session 状态机: idle → running → done | error, 解决"交互流程不合理"
 *  - 每个 app 有独立 phase 信号 (pending → detecting → done | error),
 *    解决"UI 不能准确显示每个应用任务状态"问题
 *  - per-row signal 隔离: applyProgress(name) 只触发对应 <AppRow> 重渲染
 *  - Session ID 校验: 过期 session 的 progress 事件被丢弃, 防竞态
 *
 * 保留:
 *  - AI digest, mutes, categories, toast 等周边功能不变
 *  - resultSignals per-row 机制不变
 */

import { signal, computed } from '@preact/signals';
import * as category from '../config/category.js';

// ─── Session ID 生成 ──────────────────────────────────
let _sessionCounter = 0;
function generateSessionId() {
  return `s-${Date.now()}-${++_sessionCounter}`;
}

// ─── 公开 signals: Apps + Session ──────────────────────────
export const apps = signal([]);                  // 从 config 加载的 app 列表
export const results = signal(new Map());        // name → latest result (分组真相源)

/**
 * checkSession — 替代旧的 checkStatus / checkStartTime / checkDuration 三个信号。
 * 每次 check = 一个 session, 带唯一 id + 完整生命周期。
 *
 * Shape:
 *   {
 *     id: string | null,           // 当前 session ID
 *     phase: 'idle' | 'running' | 'done' | 'error',
 *     startedAt: number | null,    // epoch ms
 *     finishedAt: number | null,   // epoch ms (完成/出错时设置)
 *     error: string | null,        // phase='error' 时的错误信息
 *     appOrder: string[],          // 本轮检测的 app 名称列表 (startCheck 时设置)
 *   }
 */
export const checkSession = signal({
  id: null,
  phase: 'idle',
  startedAt: null,
  finishedAt: null,
  error: null,
  appOrder: [],
});

/**
 * appPhases — 每个 app 在当前 session 中的检测阶段。
 * Map<name, 'pending' | 'detecting' | 'done' | 'error'>
 *
 *   pending   → 排队等待检测 (startCheck 时所有 app 进入)
 *   detecting → 正在检测中 (收到首个 progress 事件)
 *   done      → 检测完成 (有 result)
 *   error     → 检测出错
 *
 * AppRow 订阅自己的 phase signal 来显示 spinner / 结果 / 错误态。
 */
export const appPhases = signal(new Map());

// ─── 派生信号 (向后兼容) ────────────────────────────────
/** 等价于旧 checkDuration: 检查用时 (ms), 仅在 done/error 后有值 */
export const checkDuration = computed(() => {
  const s = checkSession.value;
  if (s.startedAt == null) return null;
  const end = s.finishedAt || Date.now();
  return end - s.startedAt;
});

/** 等价于旧 lastError */
export const lastError = computed(() => checkSession.value.error);

/** 等价于旧 checkStartTime */
export const checkStartTime = computed(() => checkSession.value.startedAt);

// Phase 19: 完整 cached state (含 changelog_history) — 给 WeeklyBanner 算周报用
export const cachedState = signal(null);

// Phase 23: Search + Filter 状态. FilterBar 写, selectors 读.
// searchQuery: 当前 search 框内容 (string). activeFilter: 'all' | 'update' | 'latest' | 'error'
//   v2.7.0: 加 'starred' | 'unmonitored' — library 视角过滤
export const searchQuery = signal('');
export const activeFilter = signal('all');

// Phase A (App Categorization): 当前选中的顶部 category tab.
//   - 'all'    -> 全部 (默认, 不过滤)
//   - categoryId -> 仅显示该 categoryId 的 app (e.g. 'ai', 'dev')
// 持久化到 state.json.active_category; 还原由 loadActiveCategory() 完成.
export const activeCategory = signal('all');

// v2.7.0 (My Apps Library): library 数据 signals.
//   - libraryConfig: { sortBy, pinned, ignored, tags }  // 整个 config.library 块
//   - unmonitoredApps: 扫到的未监控 app 列表 (每次 IPC library:list-unmonitored 刷)
//   - activeTagFilter: 当前选中的 tag (string | null) — 顶部 chip 过滤
export const libraryConfig = signal({ sortBy: 'starred', pinned: [], ignored: [], tags: {} });
export const unmonitoredApps = signal([]);
export const activeTagFilter = signal(null);

// ── AI 任务总结 (重做版): 任务为中心、按需生成 ──
//   - aiTasksDateKey: 当前查看的日期 ('YYYY-MM-DD', 默认今天)
//   - aiTasks: 当天任务卡列表 (engine.listTasks 返回, 含已缓存的 summary)
//   - summarizingTaskKeys: 正在生成总结的 taskKey 集合 (逐任务粒度)
//   - aiSessionsEnabled: 有 provider 配置即 enabled (syncEnabledFromConfig 派生)
export const aiSessionsEnabled = signal(false);
export const aiTasksDateKey = signal(localDateKey(0));
export const aiTasks = signal([]);
export const aiTasksSourceStats = signal([]);
export const aiTasksLoading = signal(false);
export const aiTasksError = signal(null);
export const summarizingTaskKeys = signal(new Set());
export const aiSummarizeBusy = computed(() => summarizingTaskKeys.value.size > 0);

// 右侧 drawer 打开状态. Header 一个按钮, 点开才显示任务列表.
export const digestDrawerOpen = signal(false);

// drawer 内的 "配置模式" toggle — true 时 drawer body 显示
//   provider + model + baseUrl + API key 表单.
export const digestConfigMode = signal(false);

/**
 * 本地日历日 key (YYYY-MM-DD). offsetDays=0 今天, 1 昨天...
 * @param {number} [offsetDays]
 * @param {number} [now]   注入便于测试
 * @returns {string}
 */
export function localDateKey(offsetDays = 0, now) {
  const t = (typeof now === 'number' ? now : Date.now()) - (offsetDays | 0) * 86400_000;
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t));
}

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

// ─── AI 任务总结 actions (重做版) ──────────────────────────

export function setAISessionsEnabled(enabled) {
  aiSessionsEnabled.value = Boolean(enabled);
}

// Phase B7f: 配置保存后, 根据 cfg 自动判断 enabled.
//规则: 有 provider就算 enabled (实际能不能跑通是 healthcheck验证的事,
// 用户填 key 即视为 "启用了 AI总结"). 不再有显式 toggle.
export function syncEnabledFromConfig(cfg) {
 if (!cfg || typeof cfg !== 'object') {
 aiSessionsEnabled.value = false;
 return;
 }
 // providerId存在即 enabled
 const provider = cfg.provider || (cfg.cloud && cfg.cloud.providerId);
 aiSessionsEnabled.value = Boolean(provider);
}

// Phase B7g: 是否"已配齐到能跑" — cfg 有 provider +至少那个 provider 有 key.
//跟 enabled 不同: enabled 只是 cfg 层 (用户存了 model); needsConfig还要看 key.
// 用于 rerunDigest: 检测到 needsConfig=true → 自动切到 drawer config view.
// @returns {boolean}
export function needsConfig() {
 const cfg = aiSessionsConfig.value;
 if (!cfg) return true;
 const providerId = cfg.provider || (cfg.cloud && cfg.cloud.providerId);
 if (!providerId) return true;
 const st = aiKeyStatus.value[providerId];
 if (!st || !st.hasKey) return true;
 return false;
}

/**
 * 拉某天的任务列表 (不调 LLM). drawer 打开 / 切日期时调.
 * @param {string} [dateKey]  缺省用 aiTasksDateKey.value
 * @returns {Promise<Array>} 任务卡数组
 */
export async function loadAiTasks(dateKey) {
  const key = (typeof dateKey === 'string' && dateKey) ? dateKey : aiTasksDateKey.value;
  const isDateSwitch = key !== aiTasksDateKey.value;
  aiTasksDateKey.value = key;
  aiTasksLoading.value = true;
  aiTasksError.value = null;
  // 切日期时立刻清空旧任务, 让 UI 看到 loading 而不是显示陈旧数据
  if (isDateSwitch) aiTasks.value = [];
  try {
    // eslint-disable-next-line no-undef
    const { api } = await import('./api.js');
    const r = await api.listAiTasks({ dateKey: key });
    if (aiTasksDateKey.value !== key) return []; // 用户已切到别的日期, 丢弃
    if (r && r.ok) {
      aiTasks.value = Array.isArray(r.tasks) ? r.tasks : [];
      aiTasksSourceStats.value = Array.isArray(r.sourceStats) ? r.sourceStats : [];
      return aiTasks.value;
    }
    aiTasksError.value = (r && (r.error || r.reason)) || 'list_failed';
    return [];
  } catch (err) {
    aiTasksError.value = (err && err.message) || 'list_threw';
    return [];
  } finally {
    if (aiTasksDateKey.value === key) aiTasksLoading.value = false;
  }
}

/**
 * 为选中任务生成总结 (走 IPC, 逐任务). 进度走 ai-task-summary-updated 事件
 * (subscribeAiTaskUpdates 处理), 这里只管发起 + 维护 summarizingTaskKeys.
 * @param {string[]} taskKeys
 * @returns {Promise<object|null>} 最终结果 { ok, results, failures } 或 null
 */
export async function summarizeAiTasks(taskKeys) {
  if (needsConfig()) return null;
  const keys = Array.isArray(taskKeys) ? taskKeys.filter((k) => typeof k === 'string' && k.length > 0) : [];
  if (keys.length === 0) return null;
  const dateKey = aiTasksDateKey.value;
  summarizingTaskKeys.value = new Set([...summarizingTaskKeys.value, ...keys]);
  try {
    // eslint-disable-next-line no-undef
    const { api } = await import('./api.js');
    const r = await api.summarizeAiTasks({ dateKey, taskKeys: keys });
    if (r && !r.ok && typeof r.error === 'string' && /^auth_/.test(r.error)) {
      showToast('API key 无效,请在设置里更新', 'warn', 5000);
    }
    const authFail = r && Array.isArray(r.failures)
      && r.failures.some((f) => f && typeof f.message === 'string' && /^auth_/.test(f.message));
    if (authFail) {
      showToast('API key 无效,请在设置里更新', 'warn', 5000);
    }
    return r || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[store] summarizeAiTasks threw:', err && err.message);
    return null;
  } finally {
    const next = new Set(summarizingTaskKeys.value);
    for (const k of keys) next.delete(k);
    summarizingTaskKeys.value = next;
  }
}

/**
 * 应用单任务总结事件 (main 推的 ai-task-summary-updated).
 * 成功 → 替换 aiTasks 里对应任务卡; 无论成败 → 移出 summarizing 集合.
 * @param {object} data  { dateKey, taskKey, ok, task?, error? }
 */
export function applyTaskSummaryEvent(data) {
  if (!data || typeof data.taskKey !== 'string') return;
  if (summarizingTaskKeys.value.has(data.taskKey)) {
    const next = new Set(summarizingTaskKeys.value);
    next.delete(data.taskKey);
    summarizingTaskKeys.value = next;
  }
  if (data.ok && data.task && data.dateKey === aiTasksDateKey.value) {
    aiTasks.value = aiTasks.value.map((t) => (
      t && t.taskKey === data.taskKey ? data.task : t
    ));
  }
}

/**
 * 订阅 main 推的 ai-task-summary-updated 事件. bootstrap 时调一次.
 */
export function subscribeAiTaskUpdates() {
  // eslint-disable-next-line no-undef
  import('./api.js').then(({ api }) => {
    if (api && typeof api.onAiTaskSummaryUpdated === 'function') {
      api.onAiTaskSummaryUpdated(applyTaskSummaryEvent);
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
 */
export function getResultSignal(name) {
  let sig = resultSignals.get(name);
  if (!sig) {
    sig = signal(undefined);
    resultSignals.set(name, sig);
  }
  return sig;
}

// ─── Per-app phase signal 注册表 ──────────────────────────────
/**
 * name → signal<Phase>。每个 app 的 phase 单独一个 signal，
 * AppRow 通过 getAppPhaseSignal(name) 订阅 → 只显示自己的进度态。
 */
const appPhaseSignals = new Map();

/**
 * 取出（或惰性创建）app 对应的 phase signal。
 */
export function getAppPhaseSignal(name) {
  let sig = appPhaseSignals.get(name);
  if (!sig) {
    sig = signal('idle');
    appPhaseSignals.set(name, sig);
  }
  return sig;
}

/**
 * 读某个 app 当前的 phase (便捷方法)。
 * @param {string} name
 * @returns {'pending'|'detecting'|'done'|'error'|'idle'}
 */
export function getAppPhase(name) {
  return appPhases.value.get(name) || 'idle';
}

// ─── 变更 API (Session-based) ──────────────────────────────────

/**
 * 从 result.status 派生 app phase。
 * @param {object} result
 * @returns {'done'|'error'}
 */
function resultToPhase(result) {
  if (result.status === 'error') return 'error';
  return 'done';  // 其他所有状态 (up_to_date, update_available, etc.) 都算 done
}

/**
 * 启动新一轮检查 session。
 *
 * 替代旧的 resetCheck():
 *   - 生成唯一 sessionId
 *   - 所有 app 进入 'pending' phase
 *   - 清空 results Map 和 per-row signals
 *   - session phase → 'running'
 *
 * @param {string[]} [appNames]  本轮要检测的 app 名称列表
 * @returns {string} 新 session ID
 */
export function startCheck(appNames = []) {
  const sessionId = generateSessionId();

  // 1. 清空 results Map + per-row result signals
  results.value = new Map();
  for (const sig of resultSignals.values()) {
    sig.value = undefined;
  }

  // 2. 所有 app 进入 'pending' phase
  const phases = new Map();
  for (const sig of appPhaseSignals.values()) {
    sig.value = 'pending';
  }
  for (const name of appNames) {
    phases.set(name, 'pending');
    getAppPhaseSignal(name).value = 'pending';
  }
  appPhases.value = phases;

  // 3. 创建新 session
  checkSession.value = {
    id: sessionId,
    phase: 'running',
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
    appOrder: [...appNames],
  };

  return sessionId;
}

/**
 * 兼容旧 API — index.jsx 里之前调 resetCheck(), 现在等价于 startCheck()。
 * @deprecated 使用 startCheck() 代替
 */
export function resetCheck() {
  return startCheck(apps.value.map(a => a.name));
}

/**
 * 单个 app 完成一次检测（progress 事件回调）。
 *
 * Session-aware: 校验 sessionId (如有), 丢弃过期 session 的事件。
 * 行为：
 *   1. 更新 app phase: pending → detecting → done/error
 *   2. 更新 results Map signal（驱动 resultsBySection 重算）
 *   3. 更新该 app 自己的 result signal（驱动 <AppRow> 局部更新）
 *   4. 更新 appPhases Map + per-app phase signal
 *
 * @param {object} result  检测结果
 * @param {string} [sessionId]  事件所属的 session ID (可选, 用于校验)
 */
export function applyProgress(result, sessionId) {
  if (!result || !result.name) return;

  // Session 校验: 如果提供了 sessionId 且与当前 session 不匹配 → 丢弃
  const currentSession = checkSession.value;
  if (sessionId && currentSession.id && sessionId !== currentSession.id) {
    // eslint-disable-next-line no-console
    console.warn(`[store] applyProgress: stale session ${sessionId}, current=${currentSession.id}, discarding`);
    return;
  }

  const name = result.name;

  // 1. 更新 app phase → done / error
  const phase = resultToPhase(result);
  const nextPhases = new Map(appPhases.value);
  nextPhases.set(name, phase);
  appPhases.value = nextPhases;
  getAppPhaseSignal(name).value = phase;

  // 2. 更新 results Map (驱动 selectors)
  const next = new Map(results.value);
  next.set(name, result);
  results.value = next;

  // 3. 更新 per-row result signal (驱动 AppRow 局部更新)
  const sig = getResultSignal(name);
  sig.value = result;
}

/**
 * 标记某个 app 进入 "detecting" 阶段 (可选, 主进程推 detecting 事件时调)。
 * 这让 UI 能在收到最终结果之前先显示 spinner。
 *
 * @param {string} name
 * @param {string} [sessionId]
 */
export function markAppDetecting(name, sessionId) {
  if (!name) return;
  const currentSession = checkSession.value;
  if (sessionId && currentSession.id && sessionId !== currentSession.id) return;

  const nextPhases = new Map(appPhases.value);
  // 只有从 pending 才能切到 detecting (已 done/error 的不回退)
  if (nextPhases.get(name) === 'pending' || !nextPhases.has(name)) {
    nextPhases.set(name, 'detecting');
    appPhases.value = nextPhases;
    getAppPhaseSignal(name).value = 'detecting';
  }
}

/**
 * 当前 session 正常完成。
 * phase: running → done, 设置 finishedAt。
 */
export function finishCheck() {
  const s = checkSession.value;
  if (s.phase !== 'running') return; // 防止重复 finish
  checkSession.value = {
    ...s,
    phase: 'done',
    finishedAt: Date.now(),
  };
}

/**
 * 当前 session 出错。
 * phase: running → error, 设置 finishedAt + error message。
 * 带 phase 守卫: 只有 running 态才能切到 error (防重复调用覆盖 done)。
 * @param {string} message
 */
export function setError(message) {
  const s = checkSession.value;
  if (s.phase !== 'running') return;
  checkSession.value = {
    ...s,
    phase: 'error',
    finishedAt: Date.now(),
    error: message || '未知错误',
  };
}

/**
 * 便捷 getter: 当前 session 是否正在运行。
 * @returns {boolean}
 */
export function isCheckRunning() {
  return checkSession.value.phase === 'running';
}

/**
 * 从主进程 last-known state 应用缓存结果.
 * 用法: bootstrap 时调用, 用户进 UI 立即看到上次的检测状态.
 * 不会触发新一轮 check; session 仍保持 idle.
 *
 * v2: 同时设置 per-app phase = 'done', 这样 AppRow 显示结果而非 pending.
 */
export function applyCachedResults(cached) {
  if (!cached || !cached.apps) return;
  const nextResults = new Map(results.value);
  const nextPhases = new Map(appPhases.value);

  for (const [name, r] of Object.entries(cached.apps)) {
    if (!r || !r.name) continue;
    nextResults.set(name, r);
    getResultSignal(name).value = r;

    // 缓存结果 → phase 设为 done (AppRow 直接显示结果)
    nextPhases.set(name, 'done');
    getAppPhaseSignal(name).value = 'done';
  }

  results.value = nextResults;
  appPhases.value = nextPhases;
  // 缓存 state 整体也保留给 WeeklyBanner 用 (含 changelog_history)
  cachedState.value = cached;
}

// ─── 选择器可访问的注册表 ────────────────────────────
export { resultSignals, appPhaseSignals };

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
  // Phase B7f: enabled 状态从 cfg 派生 — 有 provider 即启用
  syncEnabledFromConfig(aiSessionsConfig.value);
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
export function openDigestDrawer(open = true) {
  digestDrawerOpen.value = Boolean(open);
}
export function toggleDigestDrawer() {
  digestDrawerOpen.value = !digestDrawerOpen.value;
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
 // B7b.1: auth_401/403 →一次性 toast提示用户更新 key (不弹 modal)
 if (r && !r.ok && typeof r.error === 'string' && /^auth_/.test(r.error)) {
 showToast('API key 无效,请在设置里更新', 'warn',5000);
 }
 return r || { ok: false };
 } catch (err) {
 const out = { ok: false, error: (err && err.message) || 'unknown' };
 setAIHealthcheckResult(out);
 if (/^auth_/.test(out.error || '')) {
 showToast('API key 无效,请在设置里更新', 'warn',5000);
 }
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

// ─── Phase B7b.1: Toast notifications ─────────────────────────────
// store-side toast queue. Toast.jsx订阅 .value渲染。
// 用 array (不是单个对象) —支持多 toast 同时显示 (queue)。

// toast: Array<{ id: string, message: string, type: 'info'|'warn'|'error'|'success', ts: number }>
export const toast = signal([]);

let _toastIdCounter =0;
function _nextToastId() {
 _toastIdCounter +=1;
 return `toast-${Date.now()}-${_toastIdCounter}`;
}

/**
 * 显示一个 toast。默认5s 自动消失。
 * @param {string} message
 * @param {'info'|'warn'|'error'|'success'} [type='info']
 * @param {number} [ms=5000] 0 = 不自动消失
 * @returns {string} toast id
 */
export function showToast(message, type = 'info', ms =5000) {
 if (typeof message !== 'string' || message.length ===0) return null;
 const id = _nextToastId();
 const t = { id, message, type, ts: Date.now() };
 const next = [...toast.value, t];
 toast.value = next;
 if (ms >0) {
 setTimeout(() => dismissToast(id), ms);
 }
 return id;
}

/**
 *手动 dismiss toast (Toast组件的 ×按钮调)。
 * @param {string} id
 */
export function dismissToast(id) {
 toast.value = toast.value.filter((t) => t.id !== id);
}

/**
 * 清所有 toast。
 */
export function clearToasts() {
 toast.value = [];
}
