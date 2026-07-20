/**
 * src/renderer/reminders/RemindersModal.jsx
 *
 * v2.11 提醒 modal — Phase 33 重设计.
 *
 * 设计变更:
 *   - 顶栏: title + KPI pills (待打卡/待办) + 新建按钮 + 关闭
 *   - 新建/编辑 表单 改"顶部弹出式": 抽屉 + 滑入动画, 不挤列表
 *   - 列表行: 主操作(完成/忽略) 大按钮, 次要操作(编辑/删除) 收到 row overflow 菜单 `…`
 *   - 已触发/待办/已忽略 3 个 section 保留, 状态视觉区分
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "preact/hooks";
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
import { openConfirm } from "../store/confirmStore.js";
import { Badge } from "../components/Badge.jsx";
import { ModalShell, ModalHeader } from "../components/ModalShell.jsx";
import { PanelEmpty } from "../components/EmptyState.jsx";
import { IconBell, IconCheck, IconX, IconMoreHorizontal } from "../components/icons.jsx";

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
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  const today = new Date(now);
  const sameYear = d.getFullYear() === today.getFullYear();
  if (sameYear) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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

function repeatLabel(r) {
  if (r.repeat === "once") return "一次";
  if (r.repeat === "daily") return "每天";
  if (r.repeat === "weekdays") return "工作日";
  if (r.repeat === "weekly") {
    const wd = WEEKDAYS.find((w) => w.id === r.weekday);
    return `每周${wd ? wd.label : "?"}`;
  }
  return "";
}

// ── 行内的 `…` overflow menu ────────────────────────
function RowOverflowMenu({ onEdit, onDelete, testid }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <span class="reminder-overflow" ref={wrapRef}>
      <button
        type="button"
        class="btn btn-ghost btn-icon"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="更多操作"
        aria-expanded={open}
        data-testid={testid}
      >
        <IconMoreHorizontal size={14} />
      </button>
      {open && (
        <ul class="reminder-overflow-menu" role="menu">
          <li>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              编辑
            </button>
          </li>
          <li>
            <button
              type="button"
              role="menuitem"
              class="danger"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              删除
            </button>
          </li>
        </ul>
      )}
    </span>
  );
}

// ── 单行 ──────────────────────────────────────────────
function ReminderRow({ r, now, onEdit }) {
  const rel = relTime(r.triggerAt, now);
  const isFired = r.status === "fired";
  const isDismissed = r.status === "dismissed";

  async function onDelete() {
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
          <span class="reminder-repeat">· {repeatLabel(r)}</span>
        </div>
      </div>
      <div class="reminder-row-actions">
        {isFired ? (
          <>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              onClick={() => markReminderDone(r.id)}
              data-testid="reminder-done"
            >
              <IconCheck size={12} /> 完成
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              onClick={() => markReminderDismissed(r.id)}
              data-testid="reminder-dismiss"
            >
              忽略
            </button>
          </>
        ) : (
          <RowOverflowMenu
            onEdit={() => onEdit(r)}
            onDelete={onDelete}
            testid={`reminder-overflow-${r.id}`}
          />
        )}
      </div>
    </div>
  );
}

// ── 表单 (topbar 弹出抽屉) ──────────────────────────
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

  const submit = useCallback(async (e) => {
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
  }, [title, triggerStr, repeat, weekday, initial, submitting, onSave]);

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
    <form class="reminder-form" onKeyDown={onKey} onSubmit={submit}>
      <div class="reminder-form-header">
        <span class="reminder-form-header__title">
          {initial && initial.id ? "编辑提醒" : "新建提醒"}
        </span>
        <button
          type="button"
          class="btn btn-ghost btn-icon"
          onClick={onCancel}
          aria-label="关闭表单"
        >
          <IconX size={14} />
        </button>
      </div>
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
            type="button"
            class="btn btn-ghost"
            onClick={() => onDelete(initial.id)}
            disabled={submitting}
          >
            删除
          </button>
        )}
        <button
          type="button"
          class="btn btn-ghost"
          onClick={onCancel}
          disabled={submitting}
        >
          取消
        </button>
        <button
          type="submit"
          class="btn btn-primary"
          disabled={submitting}
        >
          {submitting ? "保存中..." : "保存"}
        </button>
      </div>
    </form>
  );
}

// ── 主 modal ──────────────────────────────────────────
export function RemindersModal() {
  const open = remindersOpen.value;
  const list = reminders.value;
  const loaded = remindersLoaded.value;
  const now = useNowTick(open);

  const [editing, setEditing] = useState(null); // null | 'new' | Reminder
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

  useEffect(() => {
    if (!open) setEditing(null);
  }, [open]);

  function close() {
    remindersOpen.value = false;
  }

  const header = (
    <ModalHeader className="reminder-modal-header">
      <h2>
        <span class="reminder-icon" aria-hidden="true"><IconBell size={18} /></span>
        提醒
        <span class="reminder-modal-sub">
          {fired.length > 0 && (
            <span class="reminder-pill reminder-pill--fired">{fired.length} 待打卡</span>
          )}
          {pending.length > 0 && (
            <span class="reminder-pill reminder-pill--pending">{pending.length} 待办</span>
          )}
        </span>
      </h2>
      <div class="reminder-modal-header-actions">
        {editing === null && (
          <button
            type="button"
            class="btn btn-primary btn-sm"
            onClick={() => setEditing("new")}
            data-testid="reminder-new"
          >
            + 新建
          </button>
        )}
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          onClick={close}
          aria-label="关闭"
          data-testid="reminder-close"
        >
          <IconX size={14} />
        </button>
      </div>
    </ModalHeader>
  );

  return (
    <ModalShell
      open={open}
      onClose={close}
      usePortal
      backdropClass="modal-backdrop reminder-modal-backdrop"
      cardClass="reminder-modal"
      ariaLabel="提醒"
      header={header}
      bodyClass="reminder-modal-body"
    >
      {/* Phase 33: 表单以顶部抽屉式弹出, 不与列表互挤 */}
      {editing !== null && (
        <ReminderForm
          initial={editing === "new" ? null : editing}
          onSave={() => setEditing(null)}
          onCancel={() => setEditing(null)}
          onDelete={(id) => {
            removeReminder(id);
            setEditing(null);
          }}
        />
      )}

      {!loaded && <PanelEmpty className="reminder-empty">加载中...</PanelEmpty>}
      {loaded && list.length === 0 && editing === null && (
        <PanelEmpty className="reminder-empty">
          <div class="reminder-empty-title">还没有提醒</div>
          <div class="reminder-empty-hint">
            点右上 "+ 新建" 加一个. ⌘⇧R 一键打开新建.
          </div>
        </PanelEmpty>
      )}

      {loaded && editing === null && fired.length > 0 && (
        <section class="reminder-section">
          <h3 class="reminder-section-title">
            <span class="reminder-section__dot reminder-section__dot--fired" aria-hidden="true" />
            已触发 (待打卡)
          </h3>
          {fired.map((r) => (
            <ReminderRow
              key={r.id}
              r={r}
              now={now}
              onEdit={(it) => setEditing(it)}
            />
          ))}
        </section>
      )}

      {loaded && editing === null && pending.length > 0 && (
        <section class="reminder-section">
          <h3 class="reminder-section-title">
            <span class="reminder-section__dot reminder-section__dot--pending" aria-hidden="true" />
            待办
          </h3>
          {pending.map((r) => (
            <ReminderRow
              key={r.id}
              r={r}
              now={now}
              onEdit={(it) => setEditing(it)}
            />
          ))}
        </section>
      )}

      {loaded && editing === null && dismissed.length > 0 && (
        <section class="reminder-section reminder-section-dismissed">
          <h3 class="reminder-section-title">
            <span class="reminder-section__dot reminder-section__dot--dismissed" aria-hidden="true" />
            已忽略 ({dismissed.length})
          </h3>
          {dismissed.slice(0, 5).map((r) => (
            <ReminderRow
              key={r.id}
              r={r}
              now={now}
              onEdit={(it) => setEditing(it)}
            />
          ))}
          {dismissed.length > 5 && (
            <div class="reminder-section-more">
              还有 {dismissed.length - 5} 条已忽略
            </div>
          )}
        </section>
      )}

      {loaded && editing === null && nextDue.value && (
        <footer class="reminder-modal-footer">
          下一个: {nextDue.value.title} · {relTime(nextDue.value.triggerAt, now)}
        </footer>
      )}
    </ModalShell>
  );
}

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
      {fired > 0 && <Badge type="reminder">{fired}</Badge>}
    </button>
  );
}
