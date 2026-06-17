/**
 * src/renderer/ithome/store.js
 */

import { signal } from "@preact/signals";
import {
  todayShanghaiDateKey,
  articlesForDate,
  favoriteDateKeys,
} from "./news-utils.js";
import {
  trackIthomeView,
  trackIthomeFavorite,
  trackIthomeSummary,
} from "../recent/track.js";
import { requireApiMethod } from "../store-utils.js";

export const ithomeArticles = signal({});
export const ithomeDayStats = signal({});
export const ithomeSummaries = signal({});
export const ithomeFavorites = signal({});
export const ithomeNewsTs = signal(0);
export const ithomeNewsLoaded = signal(false);
export const ithomeNewsLoading = signal(false);
export const ithomeNewsError = signal(null);
export const ithomeSelectedDate = signal(todayShanghaiDateKey());
export const ithomeFavoriteSelectedDate = signal("");
export const ithomeViewMode = signal("news");
export const ithomeReadIds = signal({});
export const ithomeNewIds = signal({});
export const ithomeSharingIds = signal({});

function _applyPayload(data) {
  if (!data) return;
  const articles = data.articles || {};
  ithomeArticles.value = articles;
  ithomeDayStats.value = data.dayStats || {};
  ithomeSummaries.value = data.summaries || {};
  ithomeFavorites.value = data.favorites || {};
  ithomeNewsTs.value = data.ts || 0;
  ithomeNewsLoaded.value = true;
  // 派生 readIds (从 articles 的 readAt 字段)
  const readIds = {};
  for (const a of Object.values(articles)) {
    if (a && a.id && a.readAt) readIds[a.id] = a.readAt;
  }
  ithomeReadIds.value = readIds;
  // diff 找出新文章 — 仅追踪本 session 内首次出现的 id
  // (信号生命周期 = app 一次运行; 启动时 prevIds === {} 所以这次 load 不会
  // 把所有现存文章都标 NEW, 这符合 spec 4.2 "app 重启后 NEW 全部清空" 的语义)
  const prevIds = new Set(Object.keys(ithomeNewIds.value));
  const newMap = { ...ithomeNewIds.value };
  let mutated = false;
  for (const id of Object.keys(articles)) {
    if (!prevIds.has(id) && !readIds[id]) {
      newMap[id] = 1;
      mutated = true;
    }
  }
  if (mutated) ithomeNewIds.value = newMap;
  _syncFavoriteSelectedDate();
}

function _syncFavoriteSelectedDate() {
  const dates = favoriteDateKeys(ithomeFavorites.value);
  if (dates.length === 0) {
    ithomeFavoriteSelectedDate.value = "";
    return;
  }
  if (!dates.includes(ithomeFavoriteSelectedDate.value)) {
    ithomeFavoriteSelectedDate.value = dates[0];
  }
}

export function isArticleFavorited(id) {
  return !!(id && ithomeFavorites.value[id]);
}

export async function loadIthomeNews() {
  const loadNews = requireApiMethod("ithomeLoadNews");
  if (!loadNews) return false;
  try {
    const r = await loadNews();
    if (r && r.ok !== false) {
      _applyPayload(r);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function fetchDayNews(dateKey) {
  const fetchDay = requireApiMethod("ithomeFetchDay");
  if (!fetchDay) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  if (ithomeNewsLoading.value) {
    return { ok: false, reason: "busy" };
  }
  ithomeNewsLoading.value = true;
  ithomeNewsError.value = null;
  try {
    const r = await fetchDay(dateKey);
    if (!r || !r.ok) {
      const reason = (r && r.reason) || "fetch_failed";
      const map = {
        not_current_month: "只能查看本月内的新闻",
        future_date: "不能选择未来日期",
        invalid_date: "日期无效",
        parse_empty: "该日期暂无新闻数据（可能是太早的日期或网站暂时无法访问）",
        parse_failed: "新闻页面解析失败，可能是网站结构变化，请稍后重试",
        fetch_failed: "拉取失败，请检查网络连接后重试",
        network_failed: "网络连接失败，请检查网络或代理设置",
        busy: "正在加载中，请稍候",
        ipc_unavailable: "系统通信异常，请重启应用",
      };
      ithomeNewsError.value = map[reason] || reason;
      return r || { ok: false, reason: "fetch_failed" };
    }
    await loadIthomeNews();
    return r;
  } catch (err) {
    ithomeNewsError.value = (err && err.message) || "拉取异常";
    return { ok: false, reason: "threw" };
  } finally {
    ithomeNewsLoading.value = false;
  }
}

export async function refreshIthomeNews() {
  return fetchDayNews(ithomeSelectedDate.value);
}

export async function setIthomeSelectedDate(dateKey) {
  const prev = ithomeSelectedDate.value;
  ithomeSelectedDate.value = dateKey;
  ithomeNewsError.value = null;
  ithomeNewIds.value = {};
  if (dateKey && dateKey !== prev) {
    trackIthomeView(dateKey);
  }
  const cached = articlesForDate(ithomeArticles.value, dateKey);
  if (cached.length === 0) {
    await fetchDayNews(dateKey);
  }
}

export async function summarizeIthomeArticle(id, force = false) {
  const summarize = requireApiMethod("ithomeSummarizeArticle");
  if (!summarize) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  const r = await summarize({ id, force });
  if (r && r.ok && r.text) {
    ithomeSummaries.value = {
      ...ithomeSummaries.value,
      [id]: {
        text: r.text,
        abstract: r.abstract || "",
        keywords: Array.isArray(r.keywords) ? r.keywords : [],
        domain: r.domain || "",
        impact: r.impact || "",
        generatedAt: Date.now(),
      },
    };
    const article =
      ithomeArticles.value[id] ||
      (ithomeFavorites.value[id] && ithomeFavorites.value[id].article);
    if (article) trackIthomeSummary(article);
  }
  return r;
}

export async function markIthomeRead(id) {
  if (!id) return { ok: false, reason: "invalid_args" };
  const now = Date.now();
  // 1. 乐观更新 readIds signal
  ithomeReadIds.value = { ...ithomeReadIds.value, [id]: now };
  // 2. 从 newIds 移除
  if (ithomeNewIds.value[id]) {
    const next = { ...ithomeNewIds.value };
    delete next[id];
    ithomeNewIds.value = next;
  }
  // 3. 同步更新 article.readAt in-memory
  if (ithomeArticles.value[id]) {
    ithomeArticles.value = {
      ...ithomeArticles.value,
      [id]: { ...ithomeArticles.value[id], readAt: now },
    };
  }
  // 4. 异步落盘 (fire-and-forget)
  const markRead = requireApiMethod("ithomeMarkRead");
  if (markRead) {
    try {
      await markRead(id);
    } catch {
      /* ignore — signal 已是 source of truth */
    }
  }
  return { ok: true };
}

export async function toggleIthomeFavorite(id) {
  const toggleFavorite = requireApiMethod("ithomeToggleFavorite");
  if (!toggleFavorite) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  const wasFav = isArticleFavorited(id);
  const r = await toggleFavorite({ id });
  if (r && r.ok) {
    await loadIthomeNews();
    if (!wasFav && r.favorited) {
      const article =
        ithomeArticles.value[id] ||
        (ithomeFavorites.value[id] && ithomeFavorites.value[id].article);
      if (article) trackIthomeFavorite(article);
    }
  }
  return r;
}

export function setIthomeViewMode(mode) {
  ithomeViewMode.value = mode === "favorites" ? "favorites" : "news";
  ithomeNewIds.value = {};
  if (ithomeViewMode.value === "favorites") {
    _syncFavoriteSelectedDate();
  }
}

export function setIthomeFavoriteSelectedDate(dateKey) {
  ithomeFavoriteSelectedDate.value = dateKey;
  ithomeNewIds.value = {};
}

export async function bootstrapIthomeTab() {
  const today = todayShanghaiDateKey();
  ithomeSelectedDate.value = today;
  await loadIthomeNews();
  if (articlesForDate(ithomeArticles.value, today).length === 0) {
    await fetchDayNews(today);
  }
}

export async function shareIthomeArticle(id) {
  if (!id) return { ok: false, reason: "invalid_args" };
  // 乐观锁
  ithomeSharingIds.value = { ...ithomeSharingIds.value, [id]: true };
  const shareCard = requireApiMethod("ithomeShareCard");
  if (!shareCard) {
    ithomeSharingIds.value = { ...ithomeSharingIds.value, [id]: false };
    return { ok: false, reason: "ipc_unavailable" };
  }
  try {
    const r = await shareCard(id);
    return r || { ok: false, reason: "unknown" };
  } catch (err) {
    return { ok: false, reason: "threw", error: err && err.message };
  } finally {
    const next = { ...ithomeSharingIds.value };
    delete next[id];
    ithomeSharingIds.value = next;
  }
}
