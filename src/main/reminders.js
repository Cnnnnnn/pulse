/**
 * src/main/reminders.js
 *
 * v2.11 提醒 (Reminders) — store + scheduler
 *
 * 模式跟 src/main/worldcup/bets-store.js 一致:
 *   - 走 state-store.load / writeAtomic (同进程复用, atomic write)
 *   - 顶层 state.json.reminders[] = array of Reminder
 *   - 输入校验, 状态机 (pending → fired → dismissed / 删除)
 *
 * 调度:
 *   - setInterval(30s) sweep: 状态=pending 且 triggerAt <= now → 切 fired, 调 onFire(reminder)
 *   - markFired 后同 reminder 不会重复触发 (status=fired, _sweepOnce 过滤 pending)
 *   - markDone: once → 删; daily/weekdays/weekly → 算下次 triggerAt, 切回 pending
 *   - markDismissed: 切 dismissed, 不再触发
 *
 * 重复规则 (4 种):
 *   - 'once'      → triggerAt 一次性, 触发后 markDone 即删
 *   - 'daily'     → 每天 triggerAt 时辰, markDone 后跳到 next day 同一时辰
 *   - 'weekdays'  → 周一到周五 triggerAt 时辰, markDone 后跳到下个工作日同一时辰
 *   - 'weekly'    → 每周 reminder.weekday (0-6, 0=Sun) triggerAt 时辰, markDone 后跳到下周同一 weekday 同一时辰
 *
 * 4 个重复规则都靠 _computeNextFireTime 纯函数算下次, 单元测覆盖.
 */

const fs = require("fs");
const crypto = require("crypto");
const stateStore = require("./state-store");
const recentActivity = require("./recent-activity");
const { mainLog } = require("./log");

const VALID_REPEATS = ["once", "daily", "weekdays", "weekly"];
const MAX_TITLE_LEN = 100;
const MAX_TRIGGER_AT = 4_102_444_800_000; // 2100-01-01, 防止填未来太远

// 调度: 30s 扫一次
const SWEEP_INTERVAL_MS = 30 * 1000;

let _sweepTimer = null;
let _onFire = null;
let _sweepStatePath = null;

// A3: 搜索索引引用 (setter 注入). create/update/remove 后 upsert/remove.
let _searchIndex = null;
function setSearchIndex(si) {
  _searchIndex = si;
}

function _upsertReminderDoc(r) {
  if (!_searchIndex || !r || !r.id) return;
  try {
    _searchIndex.upsert({
      id: `reminder:${r.id}`,
      source: "reminder",
      nativeId: r.id,
      title: r.title || r.id,
      snippet: "",
      searchText: r.title || "",
      payload: { navTarget: "reminders", dateMs: r.triggerAt || r.createdAt || 0 },
    });
  } catch {
    /* noop */
  }
}

function _removeReminderDoc(id) {
  if (!_searchIndex || !id) return;
  try {
    _searchIndex.remove(`reminder:${id}`);
  } catch {
    /* noop */
  }
}

// ── 内部 helpers ──────────────────────────────────────────

/**
 * 跟 bets-store 同款: state-store.load 要求 apps 字段, 首次写提醒时
 * state.json 还没 apps 会被 load 返 null. 这里直接读 raw, 兜底空对象.
 */
function _readStateRaw(statePath) {
  const p = statePath || stateStore.defaultPath();
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return {};
    return j;
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    mainLog.warn("[reminders] state read failed, treating as empty", {
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

function _validateCreateInput(input) {
  if (!input || typeof input !== "object") {
    const err = new Error("invalid_input");
    err.code = "invalid_input";
    throw err;
  }
  const { title, triggerAt, repeat } = input;
  if (typeof title !== "string" || title.length === 0) {
    const err = new Error("invalid_title");
    err.code = "invalid_title";
    throw err;
  }
  if (title.length > MAX_TITLE_LEN) {
    const err = new Error("title_too_long");
    err.code = "title_too_long";
    throw err;
  }
  if (
    typeof triggerAt !== "number" ||
    !Number.isFinite(triggerAt) ||
    triggerAt <= 0 ||
    triggerAt > MAX_TRIGGER_AT
  ) {
    const err = new Error("invalid_triggerAt");
    err.code = "invalid_triggerAt";
    throw err;
  }
  if (!VALID_REPEATS.includes(repeat)) {
    const err = new Error("invalid_repeat");
    err.code = "invalid_repeat";
    throw err;
  }
  if (repeat === "weekly") {
    const w = input.weekday;
    if (typeof w !== "number" || !Number.isInteger(w) || w < 0 || w > 6) {
      const err = new Error("invalid_weekday");
      err.code = "invalid_weekday";
      throw err;
    }
  }
}

function _validatePatch(patch) {
  if (!patch || typeof patch !== "object") {
    const err = new Error("invalid_patch");
    err.code = "invalid_patch";
    throw err;
  }
  if ("title" in patch) {
    if (typeof patch.title !== "string" || patch.title.length === 0) {
      const err = new Error("invalid_title");
      err.code = "invalid_title";
      throw err;
    }
    if (patch.title.length > MAX_TITLE_LEN) {
      const err = new Error("title_too_long");
      err.code = "title_too_long";
      throw err;
    }
  }
  if ("triggerAt" in patch) {
    if (
      typeof patch.triggerAt !== "number" ||
      !Number.isFinite(patch.triggerAt) ||
      patch.triggerAt <= 0 ||
      patch.triggerAt > MAX_TRIGGER_AT
    ) {
      const err = new Error("invalid_triggerAt");
      err.code = "invalid_triggerAt";
      throw err;
    }
  }
  if ("repeat" in patch) {
    if (!VALID_REPEATS.includes(patch.repeat)) {
      const err = new Error("invalid_repeat");
      err.code = "invalid_repeat";
      throw err;
    }
  }
  // weekday 合法 (跟 repeat 配套)
  if ("weekday" in patch && patch.weekday != null) {
    const w = patch.weekday;
    if (typeof w !== "number" || !Number.isInteger(w) || w < 0 || w > 6) {
      const err = new Error("invalid_weekday");
      err.code = "invalid_weekday";
      throw err;
    }
  }
}

function _normalizeReminder(r) {
  if (!r || typeof r !== "object") return null;
  if (
    typeof r.id !== "string" ||
    typeof r.title !== "string" ||
    typeof r.triggerAt !== "number" ||
    !VALID_REPEATS.includes(r.repeat) ||
    !["pending", "fired", "dismissed"].includes(r.status)
  ) {
    return null;
  }
  if (r.repeat === "weekly") {
    if (typeof r.weekday !== "number" || r.weekday < 0 || r.weekday > 6) {
      return null;
    }
  }
  return {
    id: r.id,
    title: r.title,
    triggerAt: r.triggerAt,
    repeat: r.repeat,
    weekday: r.repeat === "weekly" ? r.weekday : undefined,
    status: r.status,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    firedAt: typeof r.firedAt === "number" ? r.firedAt : undefined,
    lastNotifiedAt:
      typeof r.lastNotifiedAt === "number" ? r.lastNotifiedAt : undefined,
  };
}

function _normalizeAll(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(_normalizeReminder).filter(Boolean);
}

/** 读 state + 规范化 reminders 列表 — update/remove/mark* 共用 */
function _remindersCtx(statePath) {
  const path = statePath || stateStore.defaultPath();
  const existing = _withStateShell(_readStateRaw(path));
  const reminders = Array.isArray(existing.reminders)
    ? _normalizeAll(existing.reminders)
    : [];
  return { path, existing, reminders };
}

function _invalidIdResult(id) {
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, reason: "invalid_id" };
  }
  return null;
}

function _findReminderIndex(reminders, id) {
  return reminders.findIndex((r) => r && r.id === id);
}

function _saveReminders(ctx, reminders) {
  stateStore.writeAtomic(ctx.path, { ...ctx.existing, reminders });
}

// ── 公开 API: CRUD ────────────────────────────────────────

/**
 * 读所有 reminders. 兼容老 state.json (无 reminders 字段) → [].
 * @param {string} [statePath]
 * @returns {Reminder[]}
 */
function list(statePath) {
  const raw = _readStateRaw(statePath);
  return _normalizeAll(raw.reminders);
}

/**
 * 新建一条提醒.
 * @param {{title: string, triggerAt: number, repeat: 'once'|'daily'|'weekdays'|'weekly', weekday?: number}} input
 * @param {string} [statePath]
 * @returns {{ ok: true, reminder: Reminder } | { ok: false, reason: string }}
 */
function create(input, statePath) {
  try {
    _validateCreateInput(input);
  } catch (err) {
    return { ok: false, reason: err.code || "invalid_input" };
  }
  const path = statePath || stateStore.defaultPath();
  const { existing, reminders } = _remindersCtx(path);
  const reminder = {
    id: genId(),
    title: input.title,
    triggerAt: input.triggerAt,
    repeat: input.repeat,
    weekday: input.repeat === "weekly" ? input.weekday : undefined,
    status: "pending",
    createdAt: Date.now(),
  };
  reminders.push(reminder);
  const next = { ...existing, reminders };
  stateStore.writeAtomic(path, next);
  recentActivity.push({
    kind: "reminder-create",
    ref: reminder.id,
    label: reminder.title,
  });
  _upsertReminderDoc(reminder);
  return { ok: true, reminder };
}

/**
 * 更新一条提醒. patch 字段: title / triggerAt / repeat / weekday / status (一般不该 UI 调 status).
 * @param {string} id
 * @param {Partial<Reminder>} patch
 * @param {string} [statePath]
 * @returns {{ ok: true, reminder: Reminder } | { ok: false, reason: string }}
 */
function update(id, patch, statePath) {
  const badId = _invalidIdResult(id);
  if (badId) return badId;
  try {
    _validatePatch(patch || {});
  } catch (err) {
    return { ok: false, reason: err.code || "invalid_patch" };
  }
  const ctx = _remindersCtx(statePath);
  const idx = _findReminderIndex(ctx.reminders, id);
  if (idx === -1) return { ok: false, reason: "not_found" };
  const prev = ctx.reminders[idx];
  // 合并: 优先 patch 字段, repeat 切换时 weekday 一并切
  const next = {
    ...prev,
    ...patch,
  };
  if (next.repeat === "weekly") {
    if (next.weekday == null && prev.weekday != null)
      next.weekday = prev.weekday;
  } else {
    next.weekday = undefined;
  }
  // 重新规范化
  const normalized = _normalizeReminder(next);
  if (!normalized) return { ok: false, reason: "invalid_after_patch" };
  ctx.reminders[idx] = normalized;
  _saveReminders(ctx, ctx.reminders);
  _upsertReminderDoc(normalized);
  return { ok: true, reminder: normalized };
}

/**
 * 删一条提醒.
 * @param {string} id
 * @param {string} [statePath]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function remove(id, statePath) {
  const badId = _invalidIdResult(id);
  if (badId) return badId;
  const ctx = _remindersCtx(statePath);
  const idx = _findReminderIndex(ctx.reminders, id);
  if (idx === -1) return { ok: false, reason: "not_found" };
  ctx.reminders.splice(idx, 1);
  _saveReminders(ctx, ctx.reminders);
  _removeReminderDoc(id);
  return { ok: true };
}

/**
 * 标记 fired. 内部用 — scheduler 触发后调, 不暴露 IPC.
 * @param {string} id
 * @param {string} [statePath]
 * @returns {{ ok: true, reminder: Reminder } | { ok: false, reason: string }}
 */
function markFired(id, statePath) {
  const badId = _invalidIdResult(id);
  if (badId) return badId;
  const ctx = _remindersCtx(statePath);
  const idx = _findReminderIndex(ctx.reminders, id);
  if (idx === -1) return { ok: false, reason: "not_found" };
  const now = Date.now();
  ctx.reminders[idx] = {
    ...ctx.reminders[idx],
    status: "fired",
    firedAt: now,
    lastNotifiedAt: now,
  };
  const fired = ctx.reminders[idx];
  _saveReminders(ctx, ctx.reminders);
  recentActivity.push({
    kind: "reminder-fire",
    ref: id,
    label: fired.title,
  });
  return { ok: true, reminder: fired };
}

/**
 * 用户 ✓ 完成. once → 删; daily/weekdays/weekly → 算下次 triggerAt, 切回 pending.
 * @param {string} id
 * @param {string} [statePath]
 * @returns {{ ok: true, reminder: Reminder | null } | { ok: false, reason: string }}
 *   - reminder=null 表示已删除 (once 完成)
 */
function markDone(id, statePath) {
  const badId = _invalidIdResult(id);
  if (badId) return badId;
  const ctx = _remindersCtx(statePath);
  const idx = _findReminderIndex(ctx.reminders, id);
  if (idx === -1) return { ok: false, reason: "not_found" };
  const r = ctx.reminders[idx];
  if (r.repeat === "once") {
    ctx.reminders.splice(idx, 1);
    _saveReminders(ctx, ctx.reminders);
    recentActivity.push({
      kind: "reminder-done",
      ref: id,
      label: r.title,
    });
    return { ok: true, reminder: null };
  }
  const nextTriggerAt = _computeNextFireTime(r, Date.now());
  ctx.reminders[idx] = {
    ...r,
    status: "pending",
    triggerAt: nextTriggerAt,
    firedAt: undefined,
    lastNotifiedAt: undefined,
  };
  _saveReminders(ctx, ctx.reminders);
  recentActivity.push({
    kind: "reminder-done",
    ref: id,
    label: r.title,
  });
  return { ok: true, reminder: ctx.reminders[idx] };
}

/**
 * 用户 × 关闭. 切 dismissed, 不再触发.
 * @param {string} id
 * @param {string} [statePath]
 * @returns {{ ok: true, reminder: Reminder } | { ok: false, reason: string }}
 */
function markDismissed(id, statePath) {
  const badId = _invalidIdResult(id);
  if (badId) return badId;
  const ctx = _remindersCtx(statePath);
  const idx = _findReminderIndex(ctx.reminders, id);
  if (idx === -1) return { ok: false, reason: "not_found" };
  ctx.reminders[idx] = { ...ctx.reminders[idx], status: "dismissed" };
  const dismissed = ctx.reminders[idx];
  _saveReminders(ctx, ctx.reminders);
  recentActivity.push({
    kind: "reminder-dismissed",
    ref: id,
    label: dismissed.title,
  });
  return { ok: true, reminder: dismissed };
}

// ── 调度器 ────────────────────────────────────────────────

/**
 * 启动定时扫描. 启动时先 sweep 一次 (避免错过启动前到期的).
 * 重复调 → 先 stop 老的, 再起新的.
 * @param {{ onFire: (reminder: Reminder) => void }} opts
 */
function startScheduler({ onFire, statePath } = {}) {
  if (typeof onFire !== "function") {
    throw new TypeError("startScheduler: onFire must be function");
  }
  stopScheduler();
  _onFire = onFire;
  _sweepStatePath = statePath || null;
  // 启动时 sweep 一次
  try {
    _sweepOnce(Date.now(), _sweepStatePath || undefined);
  } catch (err) {
    mainLog.warn("[reminders] initial sweep failed", {
      msg: err && err.message,
    });
  }
  _sweepTimer = setInterval(() => {
    try {
      _sweepOnce(Date.now(), _sweepStatePath || undefined);
    } catch (err) {
      mainLog.warn("[reminders] sweep failed", { msg: err && err.message });
    }
  }, SWEEP_INTERVAL_MS);
  // unref 防止阻塞 process exit
  if (_sweepTimer && typeof _sweepTimer.unref === "function") {
    _sweepTimer.unref();
  }
}

function stopScheduler() {
  if (_sweepTimer) {
    clearInterval(_sweepTimer);
    _sweepTimer = null;
  }
  _onFire = null;
  _sweepStatePath = null;
}

function isSchedulerRunning() {
  return _sweepTimer !== null;
}

/**
 * 纯函数: 扫一遍 reminders, 找出所有需要触发的 (status=pending 且 triggerAt<=now),
 * 把它们切到 fired, 调 onFire(reminder). 内部供 setInterval 调, 单测也直接调.
 * @param {number} now  epoch ms, 注入便于测试
 * @param {string} [statePath]  注入便于测试
 * @returns {Reminder[]} 已触发 + 通知的 reminder 列表 (供 onFire 调, 给单测断言)
 */
function _sweepOnce(now, statePath) {
  const path = statePath || stateStore.defaultPath();
  const existing = _withStateShell(_readStateRaw(path));
  const reminders = Array.isArray(existing.reminders)
    ? _normalizeAll(existing.reminders)
    : [];
  const fired = [];
  const next = [];
  let mutated = false;
  for (const r of reminders) {
    if (r.status === "pending" && r.triggerAt <= now) {
      const updated = {
        ...r,
        status: "fired",
        firedAt: now,
        lastNotifiedAt: now,
      };
      next.push(updated);
      fired.push(updated);
      mutated = true;
    } else {
      next.push(r);
    }
  }
  if (mutated) {
    stateStore.writeAtomic(path, { ...existing, reminders: next });
  }
  // 触发通知 (在写盘后调, 失败不影响下次 sweep)
  if (_onFire && fired.length > 0) {
    for (const r of fired) {
      try {
        _onFire(r);
      } catch (err) {
        mainLog.warn("[reminders] onFire callback failed", {
          id: r.id,
          msg: err && err.message,
        });
      }
    }
  }
  return fired;
}

// ── 纯函数: _computeNextFireTime ───────────────────────────

/**
 * 给定 reminder 和当前时间, 算下次该触发的时间 (epoch ms).
 * - 'once'      → 直接返 r.triggerAt (一次性, 跟 markDone 删逻辑配套, 此函数只用于重复)
 * - 'daily'     → 今天还没到 triggerAt 时辰 → 今天的 triggerAt; 否则明天的 triggerAt
 * - 'weekdays'  → 下个 Mon-Fri 的 triggerAt 时辰
 * - 'weekly'    → 下个 weekday === r.weekday 的 triggerAt 时辰
 *
 * "triggerAt 时辰" 含义: 取 r.triggerAt 当时的 hour:minute, 落到目标日期.
 *
 * @param {Reminder} r
 * @param {number} now  epoch ms
 * @returns {number} epoch ms
 */
function _computeNextFireTime(r, now) {
  const d = new Date(r.triggerAt);
  const hour = d.getHours();
  const minute = d.getMinutes();
  const second = d.getSeconds();
  const ms = d.getMilliseconds();

  if (r.repeat === "once") {
    return r.triggerAt;
  }

  if (r.repeat === "daily") {
    const today = new Date(now);
    const candidate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      hour,
      minute,
      second,
      ms,
    );
    if (candidate.getTime() <= now) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.getTime();
  }

  if (r.repeat === "weekdays") {
    // Mon-Fri (1-5); 跳过周末
    let candidate = new Date(
      new Date(now).getFullYear(),
      new Date(now).getMonth(),
      new Date(now).getDate(),
      hour,
      minute,
      second,
      ms,
    );
    if (candidate.getTime() <= now) {
      candidate.setDate(candidate.getDate() + 1);
    }
    // 最多往前推 7 天, 必有解 (一周只有 7 天)
    let safety = 0;
    while (candidate.getDay() === 0 || candidate.getDay() === 6) {
      candidate.setDate(candidate.getDate() + 1);
      safety += 1;
      if (safety > 7) break; // 防御, 实际上不会
    }
    return candidate.getTime();
  }

  if (r.repeat === "weekly") {
    const targetWd = r.weekday; // 0=Sun..6=Sat
    let candidate = new Date(
      new Date(now).getFullYear(),
      new Date(now).getMonth(),
      new Date(now).getDate(),
      hour,
      minute,
      second,
      ms,
    );
    if (candidate.getTime() <= now) {
      candidate.setDate(candidate.getDate() + 1);
    }
    // 最多往前推 7 天, 必有解
    let safety = 0;
    while (candidate.getDay() !== targetWd) {
      candidate.setDate(candidate.getDate() + 1);
      safety += 1;
      if (safety > 7) break;
    }
    return candidate.getTime();
  }

  // 未知 repeat → 兜底, 不变
  return r.triggerAt;
}

// ── 内部 helpers ──────────────────────────────────────────

function genId() {
  return crypto.randomBytes(8).toString("hex");
}

module.exports = {
  // CRUD
  list,
  create,
  update,
  remove,
  markFired,
  markDone,
  markDismissed,
  // 调度
  startScheduler,
  stopScheduler,
  isSchedulerRunning,
  _sweepOnce,
  // 常量
  SWEEP_INTERVAL_MS,
  VALID_REPEATS,
  MAX_TITLE_LEN,
  MAX_TRIGGER_AT,
  // test-only
  setSearchIndex,
  _validateCreateInput,
  _validatePatch,
  _normalizeReminder,
  _normalizeAll,
  _computeNextFireTime,
  _readStateRaw,
};
