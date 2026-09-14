/**
 * src/renderer/components/Dashboard.tsx
 *
 * v3.3 首页重设计 (Calm Pro 2.0) — 双栏仪表盘.
 *
 * 结构:
 *   1. Header 行 — 问候 + 时钟日期 + 上次访问 pill (排版行, 不占卡片)
 *   2. 双栏 body:
 *      左主栏  — 栏目卡 grid (auto-fill 吃满宽度, 按 section 分组)
 *      右侧栏  — 「关注」聚合卡 (有信号才出现的行动清单, 全空 → 一切就绪)
 *              + 「最近活动」时间线卡
 *
 * 跟旧版 (单列 Hero 卡 + 3 张全宽汇总卡) 的差异:
 *   - 汇总卡升级为「关注」清单: 只列有未读/异常的项, 回答"打开 Pulse 该看什么";
 *     数据全部来自 nav-status ctx (可升级数 / GitHub 新 release / 资讯未读 /
 *     持仓动态 / AI 用量预警), 无新数据源.
 *   - 栏目卡 auto-fill 布局, 修掉右半屏大面积留白.
 *   - Hero 降为排版行, 与各模块 PageHeader 同族 (22px 顶距).
 */
import { useEffect, useState } from "preact/hooks";
import { setActiveNav, goInvest } from "../nav/navStore.ts";
import {
  collectNavStatusCtx,
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

// ── 「关注」清单 — 从 nav-status ctx 派生, 无新数据源 ──
export interface AttentionItem {
  key: string;
  label: string;
  value: string;
  tone: "alert" | "info";
  onClick: () => void;
}

/** ctx → 关注项. 排序: 应用更新 > GitHub release > 资讯 > 持仓 > AI 用量预警. */
export function buildAttentionItems(ctx: any): AttentionItem[] {
  const items: AttentionItem[] = [];

  const results = ctx?.checkResults;
  const total = results instanceof Map ? results.size : 0;
  if (total > 0) {
    const updatable = Array.from(results.values()).filter(
      (r: any) => r && r.has_update,
    ).length;
    if (updatable > 0) {
      items.push({
        key: "versions",
        label: "应用更新",
        value: `${updatable} 个可升级`,
        tone: "alert",
        onClick: () => selectNav("versions"),
      });
    }
  }

  const projects = Array.isArray(ctx?.githubProjects) ? ctx.githubProjects : [];
  const ghNew = projects.filter(
    (p: any) => p && p.latestVersion && p.latestVersion !== p.lastSeenVersion,
  ).length;
  if (ghNew > 0) {
    items.push({
      key: "github",
      label: "GitHub 收录",
      value: `${ghNew} 个新 release`,
      tone: "alert",
      onClick: () => selectNav("github"),
    });
  }

  const newsUnread = (ctx?.ithomeUnread || 0) + (ctx?.wechatHotUnread || 0);
  if (newsUnread > 0) {
    items.push({
      key: "news",
      label: "资讯",
      value: `${newsUnread} 条未读`,
      tone: "info",
      onClick: () => selectNav("news"),
    });
  }

  if ((ctx?.fundUnread || 0) > 0) {
    items.push({
      key: "invest",
      label: "持仓",
      value: `${ctx.fundUnread} 条动态`,
      tone: "info",
      onClick: selectInvest,
    });
  }

  const provider = ctx?.aiUsageActiveProvider;
  const snap = ctx?.aiUsageSnapshot?.[provider];
  const w = snap?.windows?.weekly ?? snap?.windows?.["5h"] ?? null;
  if (w?.usedPercent != null && w.usedPercent >= 80) {
    items.push({
      key: "ai-usage",
      label: "AI 用量",
      value: `已用 ${Math.round(w.usedPercent)}%`,
      tone: "alert",
      onClick: () => selectNav("ai-usage"),
    });
  }

  return items.slice(0, 5);
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

  // ── 关注清单 ──
  const attentionItems = buildAttentionItems(navCtx);

  // ── 栏目摘要卡: 按 section 分组, section 内按 NAV_REGISTRY 顺序 ──
  const tilesBySection = NAV_SECTIONS.map((section) => ({
    section,
    tiles: NAV_REGISTRY.filter((e) => e.section === section.id),
  }));

  // ── 最近活动 (前 5 条) ──
  const recentItems = (recent.value || []).slice(0, 5);

  return (
    <div class="dashboard-root">
      {/* 1. Header 行 — 排版, 不占卡片 */}
      <header class="dashboard-hero">
        <div class="dashboard-hero-text">
          <div class="dashboard-hero-greeting">
            {greeting()}
            <span class="dashboard-hero-time">{fmtTime(now)}</span>
          </div>
          <div class="dashboard-hero-date">{fmtDate(now)}</div>
        </div>
        {lastActiveEntry && (
          <button
            type="button"
            class="dashboard-hero-last"
            onClick={() => selectNav(lastActiveEntry.key)}
          >
            上次: {lastActiveEntry.label}
          </button>
        )}
      </header>

      {/* 2. 双栏 body */}
      <div class="dashboard-body">
        {/* 左主栏: 栏目卡 grid */}
        <div class="dashboard-tiles">
          {tilesBySection.map(({ section, tiles }) => (
            <section class="dashboard-tile-section" key={section.id}>
              <div class="dashboard-tile-section-label">{section.label}</div>
              <div class="dashboard-tile-grid">
                {tiles.map((entry) => {
                  const onClick =
                    entry.key === "invest" ? selectInvest : () => selectNav(entry.key);
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      class={`dashboard-tile dashboard-tile-${entry.section}`}
                      onClick={onClick}
                    >
                      <span class="dashboard-tile-icon" aria-hidden="true">
                        <NavIcon navKey={entry.key} size={22} />
                      </span>
                      <span class="dashboard-tile-title">{entry.label}</span>
                      <span class="dashboard-tile-subtitle">{entry.subtitle}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* 右侧栏: 关注 + 最近活动 */}
        <aside class="dashboard-aside">
          <section class="dashboard-attention" aria-label="需要关注">
            <div class="dashboard-attention-header">
              <span class="dashboard-attention-title">关注</span>
              {attentionItems.length > 0 && (
                <span class="dashboard-attention-count">{attentionItems.length}</span>
              )}
            </div>
            {attentionItems.length === 0 ? (
              <div class="dashboard-attention-empty">
                <span class="dashboard-attention-empty-icon" aria-hidden="true">✓</span>
                <span class="dashboard-attention-empty-text">
                  一切就绪
                  <span class="dashboard-attention-empty-hint">
                    可升级 · 新 release · 未读动态会出现在这里
                  </span>
                </span>
              </div>
            ) : (
              <ul class="dashboard-attention-list">
                {attentionItems.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      class={`dashboard-attention-row tone-${item.tone}`}
                      onClick={item.onClick}
                    >
                      <span class="dashboard-attention-icon" aria-hidden="true">
                        <NavIcon navKey={item.key} size={15} />
                      </span>
                      <span class="dashboard-attention-label">{item.label}</span>
                      <span class="dashboard-attention-value">{item.value}</span>
                      <span class="dashboard-attention-chevron" aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

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
        </aside>
      </div>
    </div>
  );
}

export default Dashboard;

// ── 最近活动 helper (复用 RecentActivityModal 的 kind → nav 映射) ──

function navForRecent(kind: string): string | null {
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
