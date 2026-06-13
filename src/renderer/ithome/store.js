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

function _applyPayload(data) {
  if (!data) return;
  ithomeArticles.value = data.articles || {};
  ithomeDayStats.value = data.dayStats || {};
  ithomeSummaries.value = data.summaries || {};
  ithomeFavorites.value = data.favorites || {};
  ithomeNewsTs.value = data.ts || 0;
  ithomeNewsLoaded.value = true;
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
  if (ithomeViewMode.value === "favorites") {
    _syncFavoriteSelectedDate();
  }
}

export function setIthomeFavoriteSelectedDate(dateKey) {
  ithomeFavoriteSelectedDate.value = dateKey;
}

export async function bootstrapIthomeTab() {
  const today = todayShanghaiDateKey();
  ithomeSelectedDate.value = today;
  await loadIthomeNews();
  if (articlesForDate(ithomeArticles.value, today).length === 0) {
    await fetchDayNews(today);
  }
}
