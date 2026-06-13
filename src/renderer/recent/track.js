/**
 * src/renderer/recent/track.js
 *
 * 最近活动采集 — 各 tab 调 pushRecent, 主进程负责折叠去重.
 */

import { pushRecent } from "./recentStore.js";

export function trackWorldcupMatchView(match) {
  if (!match || match._isTeam) return;
  const t1 = match.team1 || "?";
  const t2 = match.team2 || "?";
  const ref = `${match.date}|${match.time}|${t1}|${t2}`;
  pushRecent({
    kind: "worldcup-match-view",
    ref,
    label: `${t1} vs ${t2}`,
  });
}

export function trackFundView() {
  pushRecent({
    kind: "fund-view",
    ref: "funds",
    label: "查看基金管理",
  });
}

export function trackIthomeView(dateKey) {
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

export function trackIthomeFavorite(article) {
  if (!article || !article.id) return;
  const title = (article.title || "").trim() || "资讯";
  pushRecent({
    kind: "ithome-favorite",
    ref: article.id,
    label: title.length > 80 ? `${title.slice(0, 80)}…` : title,
  });
}

export function trackIthomeSummary(article) {
  if (!article || !article.id) return;
  const title = (article.title || "").trim() || "资讯";
  pushRecent({
    kind: "ithome-summary",
    ref: article.id,
    label: `AI 总结：${title.length > 60 ? title.slice(0, 60) + "…" : title}`,
  });
}

export function trackWorldcupInsight(match, type) {
  if (!match || match._isTeam) return;
  const t1 = match.team1 || "?";
  const t2 = match.team2 || "?";
  const ref = `${match.date}|${match.time}|${t1}|${t2}`;
  const verb = type === "post" ? "赛后总结" : "赛前预测";
  pushRecent({
    kind: "worldcup-insight",
    ref,
    label: `${verb}：${t1} vs ${t2}`,
  });
}

export function trackFundAdd(code, name) {
  if (!code) return;
  pushRecent({
    kind: "fund-add",
    ref: code,
    label: name ? `新增基金 ${code} · ${name}` : `新增基金 ${code}`,
  });
}

export function trackFundUpdate(code, name, patch) {
  if (!code) return;
  let detail = "";
  if (patch && typeof patch === "object") {
    const keys = Object.keys(patch).filter((k) => k !== "id");
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

export function trackFundRemove(code, name) {
  if (!code) return;
  pushRecent({
    kind: "fund-remove",
    ref: code,
    label: name ? `移除基金 ${code} · ${name}` : `移除基金 ${code}`,
  });
}

export function trackFundNavFetch(count) {
  const n = typeof count === "number" ? count : 0;
  pushRecent({
    kind: "fund-nav-fetch",
    ref: "funds-nav-fetch",
    label: n > 0 ? `刷新了 ${n} 只基金净值` : "刷新基金净值",
  });
}

export function trackReminderUpdate(reminder) {
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

export function trackAppUpgrade(appName, detail) {
  const name = (appName || "").trim() || "应用";
  const label = detail ? `${name} · ${detail}` : `${name} 已升级`;
  pushRecent({
    kind: "app-upgrade",
    ref: name,
    label,
  });
}

export function trackAppCheck(appCount) {
  const n = typeof appCount === "number" ? appCount : 0;
  pushRecent({
    kind: "app-check",
    ref: "versions-check",
    label: n > 0 ? `检查了 ${n} 个应用` : "检查了应用更新",
  });
}
