/**
 * src/renderer/reminders/RemindersModal.jsx
 *
 * v2.11 提醒 modal —— 列表 + 新建表单 + 状态切换.
 * 模式跟 src/renderer/worldcup/DayBetFooter.jsx (行内表单) 接近, 但整体是 modal.
 */

import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import { createPortal } from "preact/compat";
import {
  reminders,
  remindersOpen,
  remindersLoaded,
  loadReminders,
  createReminder,
  updateReminder,
  removeReminder,
  markReminderDone,
  markReminderDismissed,
  nextDue,
  activeCount,
  firedCount,
  toggleRemindersOpen,
} from "./remindersStore.js";
import { openConfirm } from "../confirmStore.js";

const REPEATS = [
  { id: "once", label: "一次" },
  { id: "daily", label: "每天" },
  { id: "weekdays", label: "工作日" },
  { id: "weekly", label: "每周" },
];
const WEEKDAYS = [
  { id: 0, label: "日" },
  { id: 1, label: "一" },
  { id: 2, label: "二" },
  { id: 3, label: "三" },
  { id: 4, label: "四" },
  { id: 5, label: "五" },
  { id: 6, label: "六" },
];

/** 把 epoch ms 渲染成相对时间: "刚刚" / "3 分钟后" / "明早 9:00" */
function relTime(ts, now) {
  if (typeof ts !== "number") return "";
  const diff = ts - now;
  const absDiff = Math.abs(diff);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (absDiff < min) return diff >= 0 ? "马上" : "刚刚";
  if (absDiff < hour) {
    const m = Math.round(absDiff / min);
    return diff > 0 ? `${m} 分钟后` : `${m} 分钟前`;
  }
  if (absDiff < day) {
    const h = Math.round(absDiff / hour);
    return diff > 0 ? `${h} 小时后` : `${h} 小时前`;
  }
  // 跨天: 用具体时间
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  const today = new Date(now);
  const sameYear = d.getFullYear() === today.getFullYear();
  if (sameYear) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** form 的 triggerAt: datetime-local (YYYY-MM-DDTHH:mm) ↔ epoch ms */
function toLocalInputValue(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(str) {
  if (typeof str !== "string" || str.length === 0) return null;
  const ts = new Date(str).getTime();
  return Number.isFinite(ts) ? ts : null;
}

// ── 单行 ──────────────────────────────────────────────

function ReminderRow({ r, now, onEdit }) {
  const rel = relTime(r.triggerAt, now);
  const isFired = r.status === "fired";
  const isDismissed = r.status === "dismissed";

  let repeatLabel = "";
  if (r.repeat === "once") repeatLabel = "一次";
  else if (r.repeat === "daily") repeatLabel = "每天";
  else if (r.repeat === "weekdays") repeatLabel = "工作日";
  else if (r.repeat === "weekly") {
    const wd = WEEKDAYS.find((w) => w.id === r.weekday);
    repeatLabel = `每周${wd ? wd.label : "?"}`;
  }

  return (
    <div
      class={`reminder-row status-${r.status}`}
      data-id={r.id}
      data-reminder-id={r.id}
    >
      <div class="reminder-row-main">
        <div class="reminder-title">{r.title}</div>
        <div class="reminder-meta">
          {isFired ? (
            <span class="reminder-fired-label">已触发 · {rel}</span>
          ) : isDismissed ? (
            <span class="reminder-dismissed-label">已忽略</span>
          ) : (
            <span class="reminder-when">{rel}</span>
          )}
          <span class="reminder-repeat">· {repeatLabel}</span>
        </div>
      </div>
      <div class="reminder-row-actions">
        {isFired && (
          <>
            <button
              class="btn btn-ghost btn-sm"
              onClick={() => markReminderDone(r.id)}
              title="标记为完成 (重复规则会算下次时间)"
            >
              ✓ 完成
            </button>
            <button
              class="btn btn-ghost btn-sm"
              onClick={() => markReminderDismissed(r.id)}
              title="忽略, 不再触发"
            >
              × 忽略
            </button>
          </>
        )}
        {!isFired && (
          <>
            <button class="btn btn-ghost btn-sm" onClick={() => onEdit(r)}>
              编辑
            </button>
            <button
              class="btn btn-ghost btn-sm"
              onClick={async () => {
                if (
                  await openConfirm({
                    title: "删除提醒",
                    message: `确定删除提醒 "${r.title}"?`,
                    confirmText: "删除",
                    cancelText: "再想想",
                  })
                ) {
                  removeReminder(r.id);
                }
              }}
            >
              删除
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── 新建 / 编辑表单 ──────────────────────────────────

function ReminderForm({ initial, onSave, onCancel, onDelete }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [triggerStr, setTriggerStr] = useState(
    initial?.triggerAt
      ? toLocalInputValue(initial.triggerAt)
      : toLocalInputValue(Date.now() + 5 * 60 * 1000),
  );
  const [repeat, setRepeat] = useState(initial?.repeat || "once");
  const [weekday, setWeekday] = useState(
    typeof initial?.weekday === "number" ? initial.weekday : 1,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current && titleRef.current.focus();
  }, []);

  async function submit(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (submitting) return;
    const t = (title || "").trim();
    if (t.length === 0) {
      setError("标题不能为空");
      return;
    }
    if (t.length > 100) {
      setError("标题不能超过 100 字符");
      return;
    }
    const triggerAt = fromLocalInputValue(triggerStr);
    if (triggerAt == null) {
      setError("请填有效的触发时间");
      return;
    }
    setError(null);
    setSubmitting(true);
    const input = { title: t, triggerAt, repeat };
    if (repeat === "weekly") input.weekday = weekday;
    let r;
    if (initial && initial.id) {
      r = await updateReminder(initial.id, input);
    } else {
      r = await createReminder(input);
    }
    setSubmitting(false);
    if (r && r.ok) {
      onSave && onSave();
    } else {
      setError((r && r.reason) || "保存失败");
    }
  }

  // 快捷键: Esc 取消, Cmd/Ctrl+Enter 保存
  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel && onCancel();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div class="reminder-form" onKeyDown={onKey}>
      <div class="reminder-form-row">
        <label class="reminder-label">标题</label>
        <input
          ref={titleRef}
          type="text"
          maxLength={100}
          value={title}
          onInput={(e) => setTitle(e.currentTarget.value)}
          placeholder="例如: 下午 3 点开会"
        />
      </div>
      <div class="reminder-form-row">
        <label class="reminder-label">触发时间</label>
        <input
          type="datetime-local"
          value={triggerStr}
          onInput={(e) => setTriggerStr(e.currentTarget.value)}
        />
      </div>
      <div class="reminder-form-row">
        <label class="reminder-label">重复</label>
        <div class="reminder-repeat-group">
          {REPEATS.map((rp) => (
            <label key={rp.id} class="reminder-radio">
              <input
                type="radio"
                name="reminder-repeat"
                value={rp.id}
                checked={repeat === rp.id}
                onChange={() => setRepeat(rp.id)}
              />
              <span>{rp.label}</span>
            </label>
          ))}
        </div>
      </div>
      {repeat === "weekly" && (
        <div class="reminder-form-row">
          <label class="reminder-label">周几</label>
          <div class="reminder-weekday-group">
            {WEEKDAYS.map((w) => (
              <label key={w.id} class="reminder-radio">
                <input
                  type="radio"
                  name="reminder-weekday"
                  value={w.id}
                  checked={weekday === w.id}
                  onChange={() => setWeekday(w.id)}
                />
                <span>周{w.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {error && <div class="reminder-form-error">{error}</div>}
      <div class="reminder-form-actions">
        {initial && initial.id && onDelete && (
          <button
            class="btn btn-ghost btn-sm"
            onClick={() => onDelete(initial.id)}
            disabled={submitting}
          >
            删除
          </button>
        )}
        <button class="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          取消
        </button>
        <button class="btn btn-primary" onClick={submit} disabled={submitting}>
          {submitting ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

// ── 主 modal ──────────────────────────────────────────

export function RemindersModal() {
  const open = remindersOpen.value;
  const list = reminders.value;
  const loaded = remindersLoaded.value;
  const now = useNowTick(open);

  const [editing, setEditing] = useState(null); // null = 不在表单; 'new' = 新建; Reminder = 编辑
  const fired = useMemo(
    () => list.filter((r) => r && r.status === "fired"),
    [list],
  );
  const pending = useMemo(
    () =>
      list
        .filter((r) => r && r.status === "pending")
        .slice()
        .sort((a, b) => a.triggerAt - b.triggerAt),
    [list],
  );
  const dismissed = useMemo(
    () => list.filter((r) => r && r.status === "dismissed"),
    [list],
  );

  useEffect(() => {
    if (open && !loaded) loadReminders();
  }, [open, loaded]);

  // 关 modal 时清掉表单态
  useEffect(() => {
    if (!open) setEditing(null);
  }, [open]);

  // Esc 关 modal (form 自己的 Esc 在 form 内部处理)
  function onBackdropKey(e) {
    if (!open) return;
    if (editing) return; // form 内部已处理
    if (e.key === "Escape") {
      e.preventDefault();
      remindersOpen.value = false;
    }
  }
  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", onBackdropKey);
    return () => window.removeEventListener("keydown", onBackdropKey);
  }, [open, editing]);

  if (!open) return null;

  const modal = (
    <div
      class="modal-backdrop reminder-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) remindersOpen.value = false;
      }}
    >
      <div
        class="modal-card reminder-modal"
        role="dialog"
        aria-label="提醒"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="reminder-modal-header">
          <h2>
            <span class="reminder-icon" aria-hidden="true">⏰</span>
            提醒
            <span class="reminder-modal-sub">
              {fired.length > 0 && (
                <span class="reminder-fired-pill">{fired.length} 待打卡</span>
              )}
              {pending.length > 0 && (
                <span class="reminder-pending-pill">{pending.length} 待办</span>
              )}
            </span>
          </h2>
          <div class="reminder-modal-header-actions">
            {editing !== "new" && (
              <button
                class="btn btn-primary btn-sm"
                onClick={() => setEditing("new")}
              >
                + 新建
              </button>
            )}
            <button
              class="btn btn-ghost btn-sm"
              onClick={() => (remindersOpen.value = false)}
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
        </header>

        {editing === "new" && (
          <ReminderForm
            onSave={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
        {editing && editing !== "new" && (
          <ReminderForm
            initial={editing}
            onSave={() => setEditing(null)}
            onCancel={() => setEditing(null)}
            onDelete={(id) => {
              removeReminder(id);
              setEditing(null);
            }}
          />
        )}

        {!editing && (
          <div class="reminder-modal-body">
            {!loaded && <div class="reminder-empty">加载中...</div>}
            {loaded && list.length === 0 && (
              <div class="reminder-empty">
                <div class="reminder-empty-title">还没有提醒</div>
                <div class="reminder-empty-hint">
                  点右上 "+ 新建" 加一个. ⌘⇧R 一键打开新建.
                </div>
              </div>
            )}
            {loaded && fired.length > 0 && (
              <section class="reminder-section">
                <h3 class="reminder-section-title">已触发 (待打卡)</h3>
                {fired.map((r) => (
                  <ReminderRow
                    key={r.id}
                    r={r}
                    now={now}
                    onEdit={() => setEditing(r)}
                  />
                ))}
              </section>
            )}
            {loaded && pending.length > 0 && (
              <section class="reminder-section">
                <h3 class="reminder-section-title">待办</h3>
                {pending.map((r) => (
                  <ReminderRow
                    key={r.id}
                    r={r}
                    now={now}
                    onEdit={() => setEditing(r)}
                  />
                ))}
              </section>
            )}
            {loaded && dismissed.length > 0 && (
              <section class="reminder-section reminder-section-dismissed">
                <h3 class="reminder-section-title">已忽略 ({dismissed.length})</h3>
                {dismissed.slice(0, 5).map((r) => (
                  <ReminderRow
                    key={r.id}
                    r={r}
                    now={now}
                    onEdit={() => setEditing(r)}
                  />
                ))}
                {dismissed.length > 5 && (
                  <div class="reminder-section-more">
                    还有 {dismissed.length - 5} 条已忽略
                  </div>
                )}
              </section>
            )}
            {loaded && nextDue.value && (
              <footer class="reminder-modal-footer">
                下一个: {nextDue.value.title} · {relTime(nextDue.value.triggerAt, now)}
              </footer>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

/** 每分钟 tick 一次, 让相对时间保持新鲜 */
function useNowTick(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

// ── Header 入口按钮 (跟 AITasksButton 同款) ──────────────

export function RemindersButton() {
  const open = remindersOpen.value;
  const fired = firedCount.value;
  const total = activeCount.value;
  return (
    <button
      id="btn-reminders"
      class={`btn btn-ghost btn-icon ${open ? "is-active" : ""} ${fired > 0 ? "has-content" : ""}`}
      onClick={toggleRemindersOpen}
      title={fired > 0 ? `${fired} 个待打卡 · 共 ${total} 条提醒` : total > 0 ? `${total} 条提醒` : "提醒"}
      aria-label="提醒"
      aria-expanded={open}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {fired > 0 && <span class="reminder-badge">{fired}</span>}
    </button>
  );
}
