/**
 * src/renderer/components/SettingsPage.jsx
 *
 * v2.79 — P13 设置页重做: 4 段卡片化
 *   - 外观: 主题切换 (segmented, 已有)
 *   - 最近活动: 实时时间线, 来自 main process recentActivity
 *   - 提醒: 当前 reminders 列表, 可标完成 / 撤销 / 删除
 *   - 数据: 配置导出 / 导入 (走 config:export / config:import-load + apply)
 *
 * ponytail: 信号 + IPC 同步, 最小化 store 交互. 列表空态直接渲染提示, 不依赖额外 UI.
 */
import { useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import { PageHeader } from "./PageHeader.jsx";
import {
  getThemePreference,
  setThemePreference,
} from "../theme/theme-manager.js";
import { showToast } from "../store.js";

/* ─── theme signal (与 localStorage 同步) ─────────────────────── */
const themeMode = signal(getThemePreference());

const THEME_OPTIONS = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];
const THEME_TOAST = { system: "跟随系统", light: "浅色", dark: "深色" };

/* ─── 最近活动 + 提醒 (异步加载) ──────────────────────────────── */
const recentEntries = signal([]); // RecentActivityEntry[]
const reminders = signal([]); // Reminder[]
const dataBusy = signal(false); // 导出/导入按钮 loading

function _humanizeTs(ts) {
  if (!ts || typeof ts !== "number") return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

const RECENT_KIND_LABEL = {
  "app-upgrade": "App 升级",
  "app-check": "检查更新",
  "reminder-create": "新建提醒",
  "reminder-update": "更新提醒",
  "reminder-fire": "提醒触发",
  "reminder-done": "提醒完成",
  "reminder-dismissed": "提醒忽略",
  "fund-view": "查看基金",
  "fund-add": "新增基金",
  "fund-update": "更新基金",
  "fund-remove": "移除基金",
  "ithome-view": "查看新闻",
  "ithome-favorite": "收藏新闻",
  "settings-open": "打开设置",
};

const REPEAT_LABEL = { once: "一次性", daily: "每日", weekdays: "工作日", weekly: "每周" };

async function reloadRecent() {
  try {
    const r = await window.api.recentList();
    if (r && r.ok) recentEntries.value = (r.entries || []).slice(0, 12);
  } catch {
    /* noop */
  }
}

async function reloadReminders() {
  try {
    const r = await window.api.remindersList();
    if (r && r.ok) reminders.value = r.reminders || [];
  } catch {
    /* noop */
  }
}

async function handleMarkDone(id) {
  const r = await window.api.remindersMarkDone(id);
  if (r && r.ok) {
    showToast("已标记完成", "success", 1500);
    reloadReminders();
  } else {
    showToast("操作失败", "error", 2000);
  }
}

async function handleRemove(id) {
  const r = await window.api.remindersRemove(id);
  if (r && r.ok) {
    showToast("已删除", "success", 1500);
    reloadReminders();
  } else {
    showToast("删除失败", "error", 2000);
  }
}

async function handleExport() {
  dataBusy.value = true;
  try {
    const r = await window.api.configExport();
    if (r && r.ok) {
      showToast(`配置已导出到 ${r.path.split("/").pop()}`, "success", 3000);
    } else {
      showToast(`导出失败: ${r && r.reason}`, "error", 3000);
    }
  } finally {
    dataBusy.value = false;
  }
}

async function handleImport() {
  dataBusy.value = true;
  try {
    const load = await window.api.configImportLoad();
    if (!load || !load.ok) {
      if (load && load.reason !== "cancelled") {
        showToast(`导入失败: ${load.reason || "未知"}`, "error", 3000);
      }
      return;
    }
    const applied = await window.api.configImportApply({ fields: load.fields });
    if (applied && applied.ok) {
      const fields = applied.applied.join(" / ");
      showToast(`已导入: ${fields}`, "success", 3000);
      reloadReminders();
      reloadRecent();
    } else {
      showToast(`应用失败: ${applied && applied.reason}`, "error", 3000);
    }
  } finally {
    dataBusy.value = false;
  }
}

export function SettingsPage() {
  // 进入页面时拉数据, 监听主进程推送
  useEffect(() => {
    reloadRecent();
    reloadReminders();
    const offRecent =
      typeof window.api.onRecentUpdated === "function"
        ? window.api.onRecentUpdated(({ entries }) => {
            recentEntries.value = (entries || []).slice(0, 12);
          })
        : null;
    const offReminder =
      typeof window.api.onRemindersFired === "function"
        ? window.api.onRemindersFired(() => reloadReminders())
        : null;
    return () => {
      if (typeof offRecent === "function") offRecent();
      if (typeof offReminder === "function") offReminder();
    };
  }, []);

  const recent = recentEntries.value;
  const activeReminders = reminders.value.filter((r) => r.status !== "dismissed");

  return (
    <div class="settings-page">
      <PageHeader title="设置" subtitle="外观 / 最近活动 / 提醒 / 数据" />
      <div class="settings-content">
        {/* ── 外观 ── */}
        <section class="settings-card">
          <h3 class="settings-card__title">外观</h3>
          <div class="settings-row">
            <div class="settings-row__label-block">
              <span class="settings-row__label">主题</span>
              <span class="settings-row__hint">选择「跟随系统」自动匹配 macOS / Windows 外观。</span>
            </div>
            <div class="theme-segmented" role="radiogroup" aria-label="主题模式">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={themeMode.value === opt.value}
                  class={"theme-segmented-item" + (themeMode.value === opt.value ? " is-active" : "")}
                  onClick={() => {
                    themeMode.value = opt.value;
                    setThemePreference(opt.value);
                    showToast(`主题已切换为「${THEME_TOAST[opt.value] || opt.value}」`, "success", 1800);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── 最近活动 ── */}
        <section class="settings-card">
          <h3 class="settings-card__title">最近活动</h3>
          {recent.length === 0 ? (
            <p class="settings-empty">暂无最近活动。检查更新或操作基金 / 提醒后将自动记录。</p>
          ) : (
            <ul class="settings-list">
              {recent.map((e, i) => (
                <li key={`${e.ts}-${i}`} class="settings-list__item">
                  <span class="settings-list__kind">{RECENT_KIND_LABEL[e.kind] || e.kind}</span>
                  <span class="settings-list__label">{e.label}</span>
                  {typeof e.count === "number" && e.count > 1 && (
                    <span class="settings-list__count">×{e.count}</span>
                  )}
                  <span class="settings-list__time">{_humanizeTs(e.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── 提醒 ── */}
        <section class="settings-card">
          <h3 class="settings-card__title">
            提醒
            <span class="settings-card__count">{activeReminders.length}</span>
          </h3>
          {activeReminders.length === 0 ? (
            <p class="settings-empty">当前无活动提醒。在主面板添加提醒后会在此显示。</p>
          ) : (
            <ul class="settings-list">
              {activeReminders.map((r) => (
                <li key={r.id} class="settings-list__item">
                  <span class={`settings-list__badge settings-list__badge--${r.status}`}>
                    {r.status === "fired" ? "已触发" : REPEAT_LABEL[r.repeat] || r.repeat}
                  </span>
                  <span class="settings-list__label">{r.title || "(无标题)"}</span>
                  <span class="settings-list__time">
                    {new Date(r.triggerAt).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <div class="settings-list__actions">
                    {r.status === "fired" && (
                      <button
                        type="button"
                        class="settings-btn settings-btn--ghost"
                        onClick={() => handleMarkDone(r.id)}
                      >
                        完成
                      </button>
                    )}
                    <button
                      type="button"
                      class="settings-btn settings-btn--danger-ghost"
                      onClick={() => handleRemove(r.id)}
                      aria-label={`删除提醒 ${r.title}`}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── 数据 ── */}
        <section class="settings-card">
          <h3 class="settings-card__title">数据</h3>
          <div class="settings-row">
            <div class="settings-row__label-block">
              <span class="settings-row__label">配置导出 / 导入</span>
              <span class="settings-row__hint">
                导出含监控列表、提醒、基金、AI 提示词 → 桌面
                <code>pulse-config-{`{时间戳}`}.json</code>。
              </span>
            </div>
            <div class="settings-row__buttons">
              <button
                type="button"
                class="settings-btn settings-btn--primary"
                onClick={handleExport}
                disabled={dataBusy.value}
              >
                导出配置
              </button>
              <button
                type="button"
                class="settings-btn settings-btn--ghost"
                onClick={handleImport}
                disabled={dataBusy.value}
              >
                导入配置…
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default SettingsPage;