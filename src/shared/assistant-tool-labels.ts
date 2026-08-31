/**
 * AI 助手工具 — 状态文案（主进程推送 + renderer 展示共用）.
 */
import { DIGEST_UI_TITLE } from "./digest-labels";

export const ASSISTANT_TOOL_STATUS: Record<string, string> = {
  query_apps: "应用更新",
  query_funds: "基金持仓",
  query_digest: DIGEST_UI_TITLE,
  query_leaderboard: "AI 榜单",
  query_metals: "贵金属行情",
  query_stocks: "股票搜索",
  query_github: "GitHub 项目",
  query_stock_diagnosis: "个股诊断",
  query_ai_usage: "AI 用量",
  query_reminders: "提醒事项",
  interpret_finance: "财经解读",
  summarize_ithome: "IT 资讯摘要",
  advise_stocks: "选股策略",
  query_movies: "电影片单",
  query_concerts: "演出监控",
  search: "全局搜索",
  list_nav: "导航模块",
};

export function formatToolStatusMessage(tools: string[]): string {
  const labels = tools
    .map((t) => ASSISTANT_TOOL_STATUS[t] || t)
    .filter(Boolean);
  if (labels.length === 0) return "正在查询…";
  if (labels.length === 1) return `正在查询${labels[0]}…`;
  return `正在查询：${labels.join("、")}…`;
}

export const ASSISTANT_TOOL_CARD_LABELS: Record<string, string> = {
  query_apps: "应用更新",
  search: "搜索结果",
  query_funds: "基金持仓",
  query_digest: DIGEST_UI_TITLE,
  query_leaderboard: "AI 榜单",
  query_metals: "贵金属行情",
  query_stocks: "股票搜索",
  query_github: "GitHub 项目",
  query_stock_diagnosis: "个股诊断",
  query_ai_usage: "AI 用量",
  query_reminders: "提醒事项",
  interpret_finance: "财经解读",
  summarize_ithome: "IT 资讯摘要",
  advise_stocks: "选股策略",
  query_movies: "电影片单",
  query_concerts: "演出监控",
  list_nav: "导航模块",
};
