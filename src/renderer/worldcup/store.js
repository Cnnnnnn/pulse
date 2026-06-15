/**
 * src/renderer/worldcup/store.js
 *
 * v2.9.0 世界杯专栏 — renderer store (0 跟 v2.6 主体共享)
 * v2.9.8 加比分缓存 + 按需刷新 (开赛后 / 未完赛才请求)
 * v2.10.0 加体彩记账 (loadWorldcupBets 在 bootstrapWorldcupTab 并发)
 *
 * 拍准 6.6: 跟版本检查 主体 完全独立, 不共享 store / signal
 */

import { signal } from "@preact/signals";
import {
  isScoreRefreshEligible,
  matchKey,
  mergeScoresIntoMatches,
} from "./match-utils.js";
import { loadWorldcupBets } from "./betsStore.js";

// worldcupMatches: { name, groups, matches }  (parsed data) | null (未拉取)
// worldcupLoading: boolean
// worldcupError:   string | null
export const worldcupMatches = signal(null);
export const worldcupLoading = signal(false);
export const worldcupError = signal(null);
export const worldcupScores = signal({});
export const worldcupScoresLoading = signal(false);
export const worldcupScoresLastRefresh = signal(null);
export const worldcupScoresError = signal(null);
export const worldcupMatchInsights = signal({});

/**
 * 把 worldcupScores 合并进 worldcupMatches.matches (写到 signal).
 * 每次 score 变化 (load / refresh) 都要 sync 一次, UI 跟得上.
 */
function syncMatchesWithScores() {
  const data = worldcupMatches.value;
  if (!data || !Array.isArray(data.matches)) return;
  worldcupMatches.value = {
    ...data,
    matches: mergeScoresIntoMatches(data.matches, worldcupScores.value),
  };
}

/**
 * 拉取 + 解析 + 写 store. 失败置 error.
 * @returns {Promise<boolean>} true=成功
 */
export async function loadWorldcupFixtures(force = false) {
  if (worldcupLoading.value) return false; // 并发守卫
  worldcupLoading.value = true;
  worldcupError.value = null;
  try {
    if (
      typeof window === "undefined" ||
      !window.api ||
      typeof window.api.worldcupFetchFixtures !== "function"
    ) {
      worldcupError.value = "worldcup IPC 不可用";
      return false;
    }
    const r = await window.api.worldcupFetchFixtures(
      force ? { force: true } : {},
    );
    if (!r || !r.ok) {
      worldcupError.value = (r && r.reason) || "加载失败";
      return false;
    }
    worldcupMatches.value = r.data || null;
    await loadWorldcupScoresCache();
    syncMatchesWithScores();
    return true;
  } catch (err) {
    worldcupError.value = (err && err.message) || "加载异常";
    return false;
  } finally {
    worldcupLoading.value = false;
  }
}

export function clearWorldcupError() {
  worldcupError.value = null;
}

/**
 * 拉 stateStore 缓存的 scores (不调网络). 启动 / 切回 tab 时用.
 * @returns {Promise<boolean>}
 */
export async function loadWorldcupScoresCache() {
  try {
    if (
      typeof window === "undefined" ||
      !window.api ||
      typeof window.api.worldcupLoadScores !== "function"
    ) {
      return false;
    }
    const r = await window.api.worldcupLoadScores();
    if (!r || !r.ok) return false;
    worldcupScores.value = r.scores || {};
    worldcupScoresLastRefresh.value = r.ts || null;
    syncMatchesWithScores();
    return true;
  } catch {
    return false;
  }
}

/**
 * 拉最新比分: 仅请求已开球且本地未标记完赛的场次
 * @returns {Promise<boolean>}
 */
export async function refreshWorldcupScores() {
  if (worldcupScoresLoading.value) return false;
  worldcupScoresLoading.value = true;
  worldcupScoresError.value = null;
  try {
    const curCount = worldcupMatches.value?.matches?.length || 0;
    if (curCount < 70) {
      const ok = await loadWorldcupFixtures(true);
      if (!ok) return false;
    } else if (!worldcupMatches.value?.matches) {
      const ok = await loadWorldcupFixtures();
      if (!ok) return false;
    }

    await loadWorldcupScoresCache();

    const matches = worldcupMatches.value?.matches;
    if (!matches || matches.length === 0) return true;

    const eligibleKeys = matches
      .filter((m) =>
        isScoreRefreshEligible(m, worldcupScores.value[matchKey(m)]),
      )
      .map((m) => matchKey(m));

    if (eligibleKeys.length === 0) return true;

    if (
      typeof window === "undefined" ||
      !window.api ||
      typeof window.api.worldcupRefreshScores !== "function"
    ) {
      worldcupScoresError.value = "比分 IPC 不可用";
      return false;
    }
    const r = await window.api.worldcupRefreshScores({ eligibleKeys });
    if (!r || !r.ok) {
      worldcupScoresError.value = (r && r.reason) || "刷新失败";
      if (r && r.scores) {
        worldcupScores.value = r.scores;
        syncMatchesWithScores();
      }
      return false;
    }
    worldcupScores.value = r.scores || worldcupScores.value;
    worldcupScoresLastRefresh.value = Date.now();
    syncMatchesWithScores();
    return true;
  } catch (err) {
    worldcupScoresError.value = (err && err.message) || "刷新异常";
    return false;
  } finally {
    worldcupScoresLoading.value = false;
  }
}

/**
 * 拉 stateStore 缓存的 AI insights (不调 LLM).
 * @returns {Promise<boolean>}
 */
export async function loadWorldcupInsightsCache() {
  try {
    if (
      typeof window === "undefined" ||
      !window.api ||
      typeof window.api.worldcupLoadInsights !== "function"
    ) {
      return false;
    }
    const r = await window.api.worldcupLoadInsights();
    if (!r || !r.ok) return false;
    worldcupMatchInsights.value = r.insights || {};
    return true;
  } catch {
    return false;
  }
}

/**
 * 调 LLM 生成赛前 / 赛后 AI 分析. 写入 worldcupMatchInsights.
 * @param {object} match
 * @param {'pre'|'post'} type
 * @param {{ force?: boolean, scoreEntry?: object }} [opts]
 * @returns {Promise<object>}
 */
export async function generateWorldcupInsight(match, type, opts = {}) {
  if (
    typeof window === "undefined" ||
    !window.api ||
    typeof window.api.worldcupGenerateInsight !== "function"
  ) {
    return { ok: false, reason: "ipc_unavailable" };
  }
  const key = matchKey(match);
  const scoreEntry =
    opts.scoreEntry ||
    worldcupScores.value[key] ||
    (match.score && match.score.ft ? match.score : null);

  const r = await window.api.worldcupGenerateInsight({
    match,
    type,
    force: !!opts.force,
    scoreEntry: scoreEntry && scoreEntry.ft ? scoreEntry : match.score,
  });

  if (r && r.ok) {
    const prev = worldcupMatchInsights.value[key] || {};
    worldcupMatchInsights.value = {
      ...worldcupMatchInsights.value,
      [key]: {
        ...prev,
        [type]: {
          text: r.text,
          generatedAt: Date.now(),
        },
      },
    };
  }
  return r;
}

/** 进入世界杯 tab: 拉赛程 + 读缓存 (insights/bets 并发) + 按需刷新比分 */
export async function bootstrapWorldcupTab() {
  await loadWorldcupFixtures();
  if ((worldcupMatches.value?.matches?.length || 0) < 70) {
    await loadWorldcupFixtures(true);
  }
  // insights + bets 独立 IPC, 并发
  await Promise.all([loadWorldcupInsightsCache(), loadWorldcupBets()]);
  await refreshWorldcupScores();
}
