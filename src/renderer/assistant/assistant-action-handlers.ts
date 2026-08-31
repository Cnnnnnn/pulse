/**
 * Renderer 助手 action handler 注册表.
 * 加新跳转：pulse-href parse + 在此 register 一条 handler.
 */

import { setActiveNav, goInvest } from "../nav/navStore.ts";
import { navigateTo } from "../store/route-store.ts";
import { openSearch } from "../search/searchStore.ts";
import { navigateToResult } from "../search/search-nav.ts";
import { digestDrawerOpen } from "../digest/digest-store.ts";
import { DIGEST_UI_TITLE } from "../../shared/digest-labels.ts";
import { remindersOpen } from "../reminders/remindersStore.ts";
import { showToast } from "../store/toast-store.ts";
import {
  requestUpgrade,
  requestBulkUpgradeAll,
  collectUpgradableItems,
} from "../upgrade-actions.ts";
import {
  parseReminderTriggerAt,
  formatReminderWhen,
} from "./reminder-parse.ts";
import {
  addConcertWatch,
  removeConcertWatch,
  concertsWatches,
  concertsSnapshots,
  refreshConcerts,
} from "../concerts/store.ts";
import { openMovieDetail, resolveMovieIdByQuery } from "../movies/store.ts";
import { setNewsSubTab } from "../news/newsStore.ts";
import { openFinanceArticle } from "../finance/financeStore.ts";
import { openIthomeArticle } from "../ithome/store.ts";
import { openDiagnosis } from "../stocks/diagnosisStore.ts";
import { api } from "../api.ts";
import { normalizeNavKey } from "../../shared/nav-normalize.ts";
import { NAV_REGISTRY } from "../../shared/nav-keys.ts";
import type { ReminderCreateInput } from "../../shared/ipc-contracts";

export type RendererActionParams = Record<string, unknown>;

export type RendererActionHandler = (
  params: RendererActionParams,
) => void | Promise<void>;

export type ConfirmMessage = {
  title: string;
  message: string;
  confirmText: string;
};

export type ConfirmMessageBuilder = (
  params: RendererActionParams,
) => ConfirmMessage | null;

function strParam(params: RendererActionParams, key: string): string {
  const v = params[key];
  return typeof v === "string" ? v.trim() : "";
}

function titleOrQuery(params: RendererActionParams): string {
  return strParam(params, "title") || strParam(params, "q");
}

const handleNavigate: RendererActionHandler = (params) => {
  const nav = normalizeNavKey(strParam(params, "nav"));
  if (!nav) return;
  if (nav === "invest" && typeof params.tab === "string") {
    goInvest(params.tab);
    showToast(
      `已切换到投资 · ${params.tab === "stocks" ? "股票" : params.tab === "metals" ? "贵金属" : "基金"}`,
      "info",
      2200,
    );
    return;
  }
  setActiveNav(nav);
  if (nav === "news" && typeof params.subTab === "string") {
    setNewsSubTab(params.subTab);
  }
  if (nav === "versions" && typeof params.route === "string") {
    navigateTo(params.route);
  }
  const label =
    nav === "home"
      ? "首页"
      : NAV_REGISTRY.find((e) => e.key === nav)?.label || nav;
  showToast(`已切换到${label}`, "info", 2200);
};

const handleOpenSearch: RendererActionHandler = () => {
  openSearch();
  showToast("已打开全局搜索", "info", 2000);
};

const handleOpenDigest: RendererActionHandler = () => {
  digestDrawerOpen.value = true;
  showToast(`已打开${DIGEST_UI_TITLE}`, "info", 2000);
};

const handleOpenReminders: RendererActionHandler = () => {
  remindersOpen.value = true;
  showToast("已打开提醒事项", "info", 2000);
};

const handleOpenSearchResult: RendererActionHandler = (params) => {
  const source = strParam(params, "source");
  const nativeId = strParam(params, "nativeId");
  if (!source || !nativeId) return;
  navigateToResult({
    source,
    nativeId,
    payload: params.payload || {},
  });
};

const handleTriggerCheck: RendererActionHandler = () => {
  window.dispatchEvent(new CustomEvent("app:trigger-check"));
  showToast("已开始检查更新", "info", 2500);
};

const handleOpenSettings: RendererActionHandler = (params) => {
  setActiveNav("versions");
  const tab = params.tab === "ai" ? "ai" : "general";
  navigateTo("settings", tab);
  showToast(tab === "ai" ? "已打开 AI 设置" : "已打开设置", "info", 2200);
};

const handleUpgradeApp: RendererActionHandler = async (params) => {
  const appName = strParam(params, "appName");
  if (!appName) return;
  await requestUpgrade(appName);
};

const handleBulkUpgradeAll: RendererActionHandler = async () => {
  const n = await requestBulkUpgradeAll();
  if (n > 0) {
    showToast(`已开始升级 ${n} 个应用`, "info", 3000);
  } else {
    showToast("没有可升级的应用", "info", 2500);
  }
};

const handleCreateReminder: RendererActionHandler = async (params) => {
  const title = strParam(params, "title");
  const triggerAt = parseReminderTriggerAt(params.triggerAt);
  if (!title || triggerAt == null) {
    showToast("提醒标题或时间无效", "error", 3000);
    return;
  }
  const repeatRaw = params.repeat;
  const repeat: ReminderCreateInput["repeat"] =
    repeatRaw === "daily" ||
    repeatRaw === "weekdays" ||
    repeatRaw === "weekly" ||
    repeatRaw === "once"
      ? repeatRaw
      : "once";
  const input: ReminderCreateInput = { title, triggerAt, repeat };
  if (repeat === "weekly" && typeof params.weekday === "number") {
    input.weekday = params.weekday;
  }
  const r = await api.remindersCreate(input);
  if (r?.ok) {
    showToast(`已创建提醒：${title}`, "info", 3000);
  } else {
    showToast(`创建失败：${r?.reason || "unknown"}`, "error", 4000);
  }
};

const handleOpenConcerts: RendererActionHandler = () => {
  setActiveNav("concerts");
  showToast("已切换到演出票价", "info", 2200);
};

const handleOpenMovieDetail: RendererActionHandler = (params) => {
  setActiveNav("movies");
  const movieId = strParam(params, "movieId");
  const title = titleOrQuery(params);
  const ok = openMovieDetail({
    movieId: movieId || undefined,
    title: title || undefined,
    q: title || undefined,
  });
  if (!ok) {
    showToast(`未找到电影：${title || movieId || "?"}`, "error", 3000);
    return;
  }
  const label = movieId
    ? title || movieId
    : resolveMovieIdByQuery(title)?.title || title;
  showToast(`已打开《${label}》详情`, "info", 2200);
};

const handleOpenFinanceArticle: RendererActionHandler = (params) => {
  setActiveNav("news");
  setNewsSubTab("finance");
  const articleId = strParam(params, "id");
  const title = titleOrQuery(params);
  const ok = openFinanceArticle({
    id: articleId || undefined,
    title: title || undefined,
  });
  if (!ok) {
    showToast(`未找到财经文章：${title || articleId || "?"}`, "error", 3000);
    return;
  }
  showToast(`已打开财经文章${title ? `：${title}` : ""}`, "info", 2200);
};

const handleOpenIthomeArticle: RendererActionHandler = (params) => {
  setActiveNav("news");
  setNewsSubTab("ithome");
  const articleId = strParam(params, "id");
  const title = titleOrQuery(params);
  const ok = openIthomeArticle({
    id: articleId || undefined,
    title: title || undefined,
  });
  if (!ok) {
    showToast(`未找到 IT 资讯：${title || articleId || "?"}`, "error", 3000);
    return;
  }
  showToast(`已打开 IT 资讯${title ? `：${title}` : ""}`, "info", 2200);
};

const handleOpenStockDiagnosis: RendererActionHandler = async (params) => {
  goInvest("stocks");
  let code = strParam(params, "code");
  const name = titleOrQuery(params) || strParam(params, "name");
  if (!code && name && typeof api.stocksSearch === "function") {
    const resp = await api.stocksSearch(name);
    const hit = resp?.results?.[0];
    if (hit?.code) code = String(hit.code);
  }
  if (!code) {
    showToast(`未找到股票：${name || "?"}`, "error", 3000);
    return;
  }
  openDiagnosis(api, { code, name: name || code });
  showToast(`已打开 ${name || code} 诊断`, "info", 2200);
};

const handleRefreshConcerts: RendererActionHandler = async () => {
  const ok = await refreshConcerts();
  showToast(ok ? "演出票价已刷新" : "刷新失败", ok ? "info" : "error", 3000);
};

const handleAddConcertWatch: RendererActionHandler = async (params) => {
  const url = strParam(params, "url");
  if (!url || !/^https?:\/\//i.test(url)) {
    showToast("请提供有效的演出链接（http/https）", "error", 3000);
    return;
  }
  const ok = await addConcertWatch(url);
  if (ok) {
    showToast("已添加演出监控", "info", 3000);
    setActiveNav("concerts");
  } else {
    showToast("添加失败，请检查链接是否为票牛/摩天轮/更多票", "error", 4000);
  }
};

const handleRemoveConcertWatch: RendererActionHandler = async (params) => {
  let id = strParam(params, "id");
  if (!id) {
    const q = titleOrQuery(params);
    if (q) {
      const hit = (concertsWatches.value || []).find((w: { id?: string }) => {
        const snap = w?.id ? concertsSnapshots.value?.[w.id] : null;
        const title = snap?.title || w?.id || "";
        return title.includes(q) || String(w?.id).includes(q);
      });
      id = hit?.id ? String(hit.id) : "";
    }
  }
  if (!id) {
    showToast("请提供演出 id 或标题关键词", "error", 3000);
    return;
  }
  const ok = await removeConcertWatch(id);
  showToast(ok ? "已移除演出监控" : "移除失败", ok ? "info" : "error", 3000);
};

/** tool name → handler（pulse_open 在 execute 前 normalize，不在此注册） */
export const RENDERER_ACTION_HANDLERS: Record<string, RendererActionHandler> = {
  navigate: handleNavigate,
  open_search: handleOpenSearch,
  open_digest: handleOpenDigest,
  open_reminders: handleOpenReminders,
  open_search_result: handleOpenSearchResult,
  trigger_check: handleTriggerCheck,
  open_settings: handleOpenSettings,
  upgrade_app: handleUpgradeApp,
  bulk_upgrade_all: handleBulkUpgradeAll,
  create_reminder: handleCreateReminder,
  open_concerts: handleOpenConcerts,
  open_movie_detail: handleOpenMovieDetail,
  open_finance_article: handleOpenFinanceArticle,
  open_ithome_article: handleOpenIthomeArticle,
  open_stock_diagnosis: handleOpenStockDiagnosis,
  refresh_concerts: handleRefreshConcerts,
  add_concert_watch: handleAddConcertWatch,
  remove_concert_watch: handleRemoveConcertWatch,
};

export const CONFIRM_MESSAGE_BUILDERS: Record<string, ConfirmMessageBuilder> = {
  upgrade_app: (params) => {
    const appName = strParam(params, "appName") || "该应用";
    return {
      title: "确认升级",
      message: `确定要升级「${appName}」到最新版本吗？`,
      confirmText: "升级",
    };
  },
  trigger_check: () => ({
    title: "确认检查",
    message: "确定要立即检查所有应用的更新吗？",
    confirmText: "开始检查",
  }),
  bulk_upgrade_all: () => ({
    title: "确认批量升级",
    message: `确定要升级 ${collectUpgradableItems().length} 个有更新的应用吗？`,
    confirmText: "全部升级",
  }),
  create_reminder: (params) => {
    const title = strParam(params, "title") || "提醒";
    const when = parseReminderTriggerAt(params.triggerAt);
    return {
      title: "确认创建提醒",
      message: `创建提醒「${title}」\n时间：${when ? formatReminderWhen(when) : "未指定"}`,
      confirmText: "创建",
    };
  },
};
