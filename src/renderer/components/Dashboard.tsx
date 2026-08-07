/**
 * src/renderer/components/Dashboard.tsx
 *
 * Phase 9 外壳重构 — 首页仪表盘 (替代 HomeGrid 磁贴网格).
 *
 * 四区结构:
 *   1. Hero 问候条 — 时段问候 + 实时时钟 + 日期 + 上次访问 nav
 *   2. 未读汇总卡 row — news 总未读 / invest 净值更新 / ai-usage 用量, 横排小卡, 点击跳转
 *   3. 栏目摘要卡 grid — 每个 nav 一张卡, 副标题用 getStatus 实时状态, 点击跳转
 *   4. 最近活动 — recentStore 的 recent signal 前 N 条, 点击跳转对应 nav
 *
 * 跟 HomeGrid 的差异:
 *   - 去掉 macOS 玻璃磁贴的拖拽/收藏/键盘焦点网格 (这些交互迁到 NavDrawer).
 *   - 仪表盘聚焦"信息聚合 + 快速跳转", 更轻量.
 *   - Hero 保留问候 (nav-status 单一真源), 去掉磁贴 cascade 动画.
 */
import { useEffect, useState } from "preact/hooks";
import { setActiveNav, goInvest } from "../nav/navStore.ts";
import {
  collectNavStatusCtx,
  getBadge,
  getStatus,
  greeting,
  fmtTime,
  fmtDate,
} from "./nav-status.ts";
import { NAV_REGISTRY, NAV_SECTIONS } from "../../shared/nav-keys.ts";
import { recent, recentLoaded, loadRecent } from "../recent/recentStore.ts";
import { NavIcon } from "./icons.tsx";
import "./Dashboard.css";

// 栏目摘要卡点击跳转 (invest 系走 goInvest).
function selectNav(key: string) {
  setActiveNav(key);
}
function selectInvest() {
  goInvest(undefined);
}

// 未读汇总卡: news / invest / ai-usage 三路 (横排).
interface SummaryCard {
  key: string;
  label: string;
  value: string;
  hasUnread: boolean;
  onClick: () => void;
}

export function Dashboard() {
  const [now, setNow] = useState(() => new Date());
  const [lastActive, setLastActive] = useState<string | null>(null);

  // 时钟 30s 刷新.
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  // 上次访问 nav (IPC 持久化).
  useEffect(() => {
    let alive = true;
    if (typeof window !== "undefined" && window.api?.getLastActiveNav) {
      window.api
        .getLastActiveNav()
        .then(({ lastActiveNav }) => {
          if (alive && lastActiveNav) setLastActive(lastActiveNav);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, []);

  // 最近活动 (懒加载一次).
  useEffect(() => {
    if (!recentLoaded.value) loadRecent();
  }, []);

  const navCtx = collectNavStatusCtx();
  const lastActiveEntry = lastActive
    ? NAV_REGISTRY.find((e) => e.key === lastActive)
    : null;

  // ── 未读汇总卡数据 ──
  const newsUnread = (getBadge("news", navCtx) ?? 0) as number;
  const investUnread = (getBadge("invest", navCtx) ?? 0) as number;
  const aiUsageBadge = getBadge("ai-usage", navCtx) ?? 0;
  const aiUsageStatus = getStatus("ai-usage", navCtx);
  const summaryCards: SummaryCard[] = [
    {
      key: "news",
      label: "资讯未读",
      value: newsUnread > 0 ? String(newsUnread) : "无",
      hasUnread: newsUnread > 0,
      onClick: () => selectNav("news"),
    },
    {
      key: "invest",
      label: "持仓动态",
      value: investUnread > 0 ? `${investUnread} 更新` : getStatus("invest", navCtx) || "—",
      hasUnread: investUnread > 0,
      onClick: selectInvest,
    },
    {
      key: "ai-usage",
      label: "AI 用量",
      value: aiUsageStatus || "—",
      hasUnread: aiUsageBadge > 0,
      onClick: () => selectNav("ai-usage"),
    },
  ];

  // ── 栏目摘要卡: 按 section 分组, section 内按 NAV_REGISTRY 顺序 ──
  const tilesBySection = NAV_SECTIONS.map((section) => ({
    section,
    tiles: NAV_REGISTRY.filter((e) => e.section === section.id),
  }));

  // ── 最近活动 (前 6 条) ──
  const recentItems = (recent.value || []).slice(0, 6);

  return (
    <div class="dashboard-root">
      {/* 1. Hero 问候条 */}
      <header class="dashboard-hero">
        <div class="dashboard-hero-mark" aria-hidden="true">P</div>
        <div class="dashboard-hero-text">
          <div class="dashboard-hero-greeting">
            {greeting()}
            <span class="dashboard-hero-time">{fmtTime(now)}</span>
          </div>
          <div class="dashboard-hero-date">{fmtDate(now)}</div>
        </div>
        {lastActiveEntry && (
          <div class="dashboard-hero-last">
            上次: {lastActiveEntry.label}
          </div>
        )}
      </header>

      {/* 2. 未读汇总卡 row */}
      <div class="dashboard-summary-row">
        {summaryCards.map((card) => (
          <button
            key={card.key}
            type="button"
            class={`dashboard-summary-card${card.hasUnread ? " has-unread" : ""}`}
            onClick={card.onClick}
          >
            <span class="dashboard-summary-label">{card.label}</span>
            <span class="dashboard-summary-value">{card.value}</span>
          </button>
        ))}
      </div>

      {/* 3. 栏目摘要卡 grid (按 section 分组) */}
      <div class="dashboard-tiles">
        {tilesBySection.map(({ section, tiles }) => (
          <section class="dashboard-tile-section" key={section.id}>
            <div class="dashboard-tile-section-label">{section.label}</div>
            <div class="dashboard-tile-grid">
              {tiles.map((entry) => {
                const badge = getBadge(entry.key, navCtx) ?? 0;
                const status = getStatus(entry.key, navCtx);
                const onClick =
                  entry.key === "invest" ? selectInvest : () => selectNav(entry.key);
                return (
                  <button
                    key={entry.key}
                    type="button"
                    class={`dashboard-tile dashboard-tile-${entry.accent}`}
                    onClick={onClick}
                  >
                    <span class="dashboard-tile-icon" aria-hidden="true">
                      <NavIcon navKey={entry.key} size={22} />
                    </span>
                    <span class="dashboard-tile-title">{entry.label}</span>
                    <span class="dashboard-tile-subtitle">{status || "—"}</span>
                    {badge > 0 && (
                      <span class="dashboard-tile-badge" aria-label={`${badge} 条未读`}>
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* 4. 最近活动 */}
      {recentItems.length > 0 && (
        <section class="dashboard-recent">
          <div class="dashboard-recent-header">
            <span class="dashboard-recent-title">最近活动</span>
          </div>
          <ul class="dashboard-recent-list">
            {recentItems.map((item: any, idx: number) => (
              <li key={idx} class="dashboard-recent-item">
                <button
                  type="button"
                  class="dashboard-recent-btn"
                  onClick={() => {
                    const nav = navForRecent(item.kind);
                    if (nav) {
                      if (nav === "invest" || nav === "funds") selectInvest();
                      else selectNav(nav);
                    }
                  }}
                >
                  <span class="dashboard-recent-kind" aria-hidden="true">
                    {recentKindLabel(item.kind)}
                  </span>
                  <span class="dashboard-recent-text">{item.title || item.kind}</span>
                  <span class="dashboard-recent-time">{relTime(item.ts, now)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default Dashboard;

// ── 最近活动 helper (复用 RecentActivityModal 的 kind → nav 映射) ──

function navForRecent(kind: string): string | null {
  if (kind === "worldcup-match-view" || kind === "worldcup-insight") return "worldcup";
  if (
    kind === "fund-view" ||
    kind === "fund-add" ||
    kind === "fund-update" ||
    kind === "fund-remove" ||
    kind === "fund-nav-fetch"
  )
    return "invest";
  if (kind === "ithome-view" || kind === "ithome-favorite" || kind === "ithome-summary")
    return "news";
  if (kind === "settings-open") return null;
  return null;
}

function recentKindLabel(kind: string): string {
  if (kind?.startsWith("fund")) return "💰";
  if (kind?.startsWith("ithome")) return "📰";
  if (kind?.startsWith("worldcup")) return "🏆";
  if (kind === "app-upgrade" || kind === "app-check") return "🔄";
  if (kind === "settings-open") return "⚙";
  return "·";
}

function relTime(ts: number, now: Date): string {
  if (typeof ts !== "number") return "";
  const diff = now.getTime() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}
