/**
 * IT之家新闻持久化 Repository。
 *
 * 业务层只处理文章合并、收藏和摘要；state.json 的读取、兼容兜底以及
 * 原子写入集中在这里，后续可以在不改 news-store API 的前提下替换底层
 * state-store facade。
 */

import * as fs from "node:fs";
import * as stateStore from "../state-store";
import { mainLog } from "../log";

export type IthomeNewsSnapshot = {
  ts: number;
  articles: Record<string, any>;
  summaries: Record<string, any>;
  favorites: Record<string, any>;
  dayStats: Record<string, any>;
};

function emptyNews(): IthomeNewsSnapshot {
  return { ts: 0, articles: {}, summaries: {}, favorites: {}, dayStats: {} };
}

export function normalizeNews(raw: any): IthomeNewsSnapshot {
  if (!raw || typeof raw !== "object") return emptyNews();
  const asRecord = (value: any): Record<string, any> =>
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    ts: typeof raw.ts === "number" ? raw.ts : 0,
    articles: asRecord(raw.articles),
    summaries: asRecord(raw.summaries),
    favorites: asRecord(raw.favorites),
    dayStats: asRecord(raw.dayStats),
  };
}

export function readState(statePath?: string): Record<string, any> {
  const filePath = statePath || stateStore.defaultPath();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err: any) {
    if (err && err.code === "ENOENT") return {};
    mainLog.warn("[ithome/news-repository] state read failed", {
      msg: err && err.message,
    });
    return {};
  }
}

export function load(statePath?: string): IthomeNewsSnapshot {
  return normalizeNews(readState(statePath).ithome_news);
}

export function save(news: IthomeNewsSnapshot, statePath?: string): void {
  const filePath = statePath || stateStore.defaultPath();
  const existing = readState(filePath);
  const next = {
    ...existing,
    v: existing.v || stateStore.SCHEMA_VERSION,
    apps:
      existing.apps && typeof existing.apps === "object" ? existing.apps : {},
    mutes:
      existing.mutes && typeof existing.mutes === "object"
        ? existing.mutes
        : {},
    ithome_news: news,
  };
  stateStore.writeAtomic(filePath, next);
}

module.exports = {
  normalizeNews,
  readState,
  load,
  save,
};
