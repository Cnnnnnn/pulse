/**
 * src/renderer/recent/track.ts
 *
 * 最近活动采集 — 各 tab 调 pushRecent, 主进程负责折叠去重.
 * 2026-08: Worldcup 模块整体下线, 删 trackWorldcupMatchView / trackWorldcupInsight.
 */

import { pushRecent } from "./recentStore.ts";

export function trackFundView() {
  pushRecent({
    kind: "fund-view",
    ref: "funds",
    label: "查看基金管理",
  });
}

export function trackIthomeView(dateKey: any) {
  if (!dateKey) return;
  const parts = dateKey.split("-");
  const label =
    parts.length >= 3
      ? `查看 IT 新闻 · ${Number(parts[1])}月${Number(parts[2])}日`
      : "查看 IT 新闻";
  pushRecent({
    kind: "ithome-view",
    ref: dateKey || "ithome",
    label,
  });
}

export function trackIthomeFavorite(article: any) {
  if (!article || !article.id) return;
  const title = (article.title || "").trim() || "资讯";
  pushRecent({
    kind: "ithome-favorite",
    ref: article.id,
    label: title.length > 80 ? `${title.slice(0, 80)}…` : title,
  });
}

export function trackIthomeSummary(article: any) {
  if (!article || !article.id) return;
  const title = (article.title || "").trim() || "资讯";
  pushRecent({
    kind: "ithome-summary",
    ref: article.id,
    label: `AI 总结：${title.length > 60 ? title.slice(0, 60) + "…" : title}`,
  });
}

export function trackFundAdd(code: any, name: any) {
  if (!code) return;
  pushRecent({
    kind: "fund-add",
    ref: code,
    label: name ? `新增基金 ${code} · ${name}` : `新增基金 ${code}`,
  });
}

export function trackFundUpdate(code: any, name: any, patch: any) {
  if (!code) return;
  let detail = "";
  if (patch && typeof patch === "object") {
    const keys = Object.keys(patch).filter((k: any) => k !== "id");
    if (keys.length) detail = keys.join("/");
  }
  pushRecent({
    kind: "fund-update",
    ref: code,
    label: name
      ? `编辑基金 ${code} · ${name}${detail ? ` (${detail})` : ""}`
      : `编辑基金 ${code}${detail ? ` (${detail})` : ""}`,
  });
}

export function trackFundRemove(code: any, name: any) {
  if (!code) return;
  pushRecent({
    kind: "fund-remove",
    ref: code,
    label: name ? `移除基金 ${code} · ${name}` : `移除基金 ${code}`,
  });
}

export function trackFundNavFetch(count: any) {
  const n = typeof count === "number" ? count : 0;
  pushRecent({
    kind: "fund-nav-fetch",
    ref: "funds-nav-fetch",
    label: n > 0 ? `刷新了 ${n} 只基金净值` : "刷新基金净值",
  });
}

export function trackReminderUpdate(reminder: any) {
  if (!reminder || !reminder.id) return;
  pushRecent({
    kind: "reminder-update",
    ref: reminder.id,
    label: reminder.title || "编辑提醒",
  });
}

export function trackSettingsOpen() {
  pushRecent({
    kind: "settings-open",
    ref: "ai-settings",
    label: "打开 AI 配置",
  });
}

export function trackAppUpgrade(appName: string, detail?: string): void {
  const name = (appName || "").trim() || "应用";
  const label = detail ? `${name} · ${detail}` : `${name} 已升级`;
  pushRecent({
    kind: "app-upgrade",
    ref: name,
    label,
  });
}

export function trackAppCheck(appCount: any) {
  const n = typeof appCount === "number" ? appCount : 0;
  pushRecent({
    kind: "app-check",
    ref: "versions-check",
    label: n > 0 ? `检查了 ${n} 个应用` : "检查了应用更新",
  });
}
