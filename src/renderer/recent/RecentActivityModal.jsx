/**
 * src/renderer/recent/RecentActivityModal.jsx
 *
 * v2.11 时间线 modal — 倒序 list + 过滤 + 点条目跳 tab.
 */

import { useState, useEffect, useMemo } from "preact/hooks";
import { createPortal } from "preact/compat";
import {
  recent,
  recentOpen,
  recentLoaded,
  recentFilter,
  loadRecent,
  toggleRecentOpen,
} from "./recentStore.js";
import { activeNav, setActiveNav } from "../worldcup/navStore.js";

const KIND_META = {
  "app-upgrade": { icon: "⬆", label: "升级" },
  "app-check": { icon: "🔄", label: "检查" },
  "reminder-create": { icon: "⏰+", label: "新建提醒" },
  "reminder-update": { icon: "✏", label: "编辑提醒" },
  "reminder-fire": { icon: "🔔", label: "提醒触发" },
  "reminder-done": { icon: "✓", label: "提醒完成" },
  "reminder-dismissed": { icon: "✕", label: "忽略提醒" },
  "worldcup-match-view": { icon: "⚽", label: "比赛" },
  "worldcup-insight": { icon: "🔮", label: "AI 分析" },
  "fund-view": { icon: "💰", label: "基金" },
  "fund-add": { icon: "💰+", label: "新增基金" },
  "fund-update": { icon: "✏", label: "编辑基金" },
  "fund-remove": { icon: "✕", label: "移除基金" },
  "fund-nav-fetch": { icon: "🔄", label: "刷新净值" },
  "ithome-view": { icon: "📰", label: "新闻" },
  "ithome-favorite": { icon: "★", label: "收藏" },
  "ithome-summary": { icon: "✨", label: "AI 总结" },
  "settings-open": { icon: "⚙", label: "设置" },
};

const FILTERS = [
  { id: "all", label: "全部" },
  { id: "app", label: "升级", kinds: ["app-upgrade", "app-check"] },
  {
    id: "reminder",
    label: "提醒",
    kinds: [
      "reminder-create",
      "reminder-update",
      "reminder-fire",
      "reminder-done",
      "reminder-dismissed",
    ],
  },
  {
    id: "worldcup",
    label: "比赛",
    kinds: ["worldcup-match-view", "worldcup-insight"],
  },
  {
    id: "fund",
    label: "基金",
    kinds: [
      "fund-view",
      "fund-add",
      "fund-update",
      "fund-remove",
      "fund-nav-fetch",
    ],
  },
  {
    id: "ithome",
    label: "新闻",
    kinds: ["ithome-view", "ithome-favorite", "ithome-summary"],
  },
  { id: "settings", label: "设置", kinds: ["settings-open"] },
];

/** 找 kind 对应的 nav 目标 (点跳过去) */
function navForKind(kind) {
  if (kind === "worldcup-match-view" || kind === "worldcup-insight")
    return "worldcup";
  if (
    kind === "fund-view" ||
    kind === "fund-add" ||
    kind === "fund-update" ||
    kind === "fund-remove" ||
    kind === "fund-nav-fetch"
  )
    return "funds";
  if (
    kind === "ithome-view" ||
    kind === "ithome-favorite" ||
    kind === "ithome-summary"
  )
    return "ithome";
  if (kind === "settings-open") return null; // 留在当前
  return null;
}

function relTime(ts, now) {
  if (typeof ts !== "number") return "";
  const diff = now - ts;
  const abs = Math.abs(diff);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) return "刚刚";
  if (abs < hour) return `${Math.round(abs / min)} 分钟前`;
  if (abs < day) return `${Math.round(abs / hour)} 小时前`;
  if (abs < 7 * day) return `${Math.round(abs / day)} 天前`;
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function RecentRow({ e, now, onClick }) {
  const meta = KIND_META[e.kind] || { icon: "·", label: e.kind };
  const count = typeof e.count === "number" && e.count > 1 ? e.count : null;
  return (
    <div
      class={`recent-row kind-${e.kind}`}
      onClick={() => onClick && onClick(e)}
    >
      <span class="recent-icon" aria-hidden="true">{meta.icon}</span>
      <div class="recent-main">
        <div class="recent-label">{e.label}</div>
        <div class="recent-meta">
          {meta.label}
          {count && <span class="recent-count"> · {count} 次</span>}
        </div>
      </div>
      <div class="recent-time">{relTime(e.ts, now)}</div>
    </div>
  );
}

export function RecentActivityModal() {
  const open = recentOpen.value;
  const list = recent.value;
  const loaded = recentLoaded.value;
  const filter = recentFilter.value;
  const now = useNowTick(open);

  const filtered = useMemo(() => {
    const arr = Array.isArray(list) ? list : [];
    const sorted = arr.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (filter === "all") return sorted;
    const f = FILTERS.find((x) => x.id === filter);
    if (!f || !Array.isArray(f.kinds)) return sorted;
    const allow = new Set(f.kinds);
    return sorted.filter((e) => e && allow.has(e.kind));
  }, [list, filter]);

  useEffect(() => {
    if (open && !loaded) loadRecent();
  }, [open, loaded]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        recentOpen.value = false;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  function onRowClick(e) {
    const target = navForKind(e.kind);
    if (target) {
      setActiveNav(target);
      recentOpen.value = false;
    }
  }

  const modal = (
    <div
      class="modal-backdrop recent-modal-backdrop"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) recentOpen.value = false;
      }}
    >
      <div
        class="modal-card recent-modal"
        role="dialog"
        aria-label="最近活动"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="recent-modal-header">
          <h2>
            <span aria-hidden="true">🕒</span>
            最近活动
            <span class="recent-modal-sub">
              {loaded && list.length > 0 && (
                <span class="recent-count-pill">{list.length} 条</span>
              )}
            </span>
          </h2>
          <div class="recent-modal-header-actions">
            <button
              class="btn btn-ghost btn-sm"
              onClick={() => (recentOpen.value = false)}
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
        </header>

        <div class="recent-modal-filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              class={`recent-filter-pill ${filter === f.id ? "is-active" : ""}`}
              onClick={() => (recentFilter.value = f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div class="recent-modal-body">
          {!loaded && <div class="recent-empty">加载中...</div>}
          {loaded && list.length === 0 && (
            <div class="recent-empty">
              <div class="recent-empty-title">还没有活动记录</div>
              <div class="recent-empty-hint">
                去点点 Pulse 各功能试试 — 升级 / 提醒 / 比赛 / 基金 / 新闻都会记录.
              </div>
            </div>
          )}
          {loaded && filtered.length === 0 && list.length > 0 && (
            <div class="recent-empty">当前过滤下没活动</div>
          )}
          {loaded && filtered.map((e) => (
            <RecentRow key={`${e.kind}-${e.ref}-${e.ts}`} e={e} now={now} onClick={onRowClick} />
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
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

export function RecentButton() {
  const open = recentOpen.value;
  const count = recent.value.length;
  return (
    <button
      id="btn-recent"
      class={`btn btn-ghost btn-icon ${open ? "is-active" : ""}`}
      onClick={toggleRecentOpen}
      title={count > 0 ? `最近 ${count} 条活动` : "最近活动"}
      aria-label="最近活动"
      aria-expanded={open}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    </button>
  );
}
