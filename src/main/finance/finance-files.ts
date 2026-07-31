/**
 * src/main/finance/finance-files.ts
 *
 * 财经独立落盘 — 把 financial_news / market_quotes 从共享 state.json 剥离到专属文件。
 *
 * 动机：finance 的两个 key 不在 state-store 的 PRESERVE_FIELDS 白名单中，
 * 任何其它模块的 patchState 写入都会静默丢弃 state.json 里的 financial_news / market_quotes，
 * 导致财经数据在「其它模块写入 ↔ 财经读取」之间竞态丢失。独立文件彻底解耦该风险，
 * 同时避免反复解析整个 state.json（财经数据可达 ~1k 条）。
 *
 * 文件名：与 state.json 同目录，分别为 finance_news.json / finance_quotes.json。
 *
 * 迁移：首次读取时若专属文件不存在、但 legacy state.json 含对应 key，
 * 则迁移写入专属文件（best-effort 清理 legacy key），保证升级用户不丢已存文章 / 收藏。
 */

import * as fs from "fs";
import * as path from "path";
import * as stateStore from "../state-store";
import { mainLog } from "../log";

/** 专属文件：finance_news.json（与 state.json 同目录）。 */
export function newsFilePath(statePath?: any): string {
  const p = statePath || stateStore.defaultPath();
  return path.join(path.dirname(p), "finance_news.json");
}

/** 专属文件：finance_quotes.json（与 state.json 同目录）。 */
export function quotesFilePath(statePath?: any): string {
  const p = statePath || stateStore.defaultPath();
  return path.join(path.dirname(p), "finance_quotes.json");
}

function _rawReadJson(file: string): any {
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : null;
  } catch (err: any) {
    if (err && err.code === "ENOENT") return null;
    mainLog.warn("[finance-files] read failed", { file, msg: err && err.message });
    return null;
  }
}

function _rawReadLegacyState(statePath: any): any {
  const p = statePath || stateStore.defaultPath();
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

/**
 * 一次性尽力清理 legacy key（保留其它所有字段）。失败则忽略——
 * legacy blob 无害，后续其它模块的 patchState 也会自然 GC 掉它。
 */
function _maybeCleanLegacy(statePath: any, key: string): void {
  try {
    const p = statePath || stateStore.defaultPath();
    const j = _rawReadLegacyState(p);
    if (!(key in j)) return;
    delete j[key];
    stateStore.writeAtomic(p, j);
  } catch (err: any) {
    mainLog.warn("[finance-files] legacy cleanup skipped", {
      key,
      msg: err && err.message,
    });
  }
}

/** 读财经新闻子状态（专属文件优先，缺失时从 legacy state.json 迁移）。 */
export function readNewsState(statePath?: any): any {
  const file = newsFilePath(statePath);
  const existing = _rawReadJson(file);
  if (existing) return existing;
  const legacy = _rawReadLegacyState(statePath).financial_news;
  if (legacy && typeof legacy === "object") {
    stateStore.writeAtomic(file, legacy);
    _maybeCleanLegacy(statePath, "financial_news");
    return legacy;
  }
  return null;
}

export function writeNewsState(state: any, statePath?: any): void {
  stateStore.writeAtomic(newsFilePath(statePath), state);
}

/** 读行情子状态（专属文件优先，缺失时从 legacy state.json 迁移）。 */
export function readQuotesState(statePath?: any): any {
  const file = quotesFilePath(statePath);
  const existing = _rawReadJson(file);
  if (existing) return existing;
  const legacy = _rawReadLegacyState(statePath).market_quotes;
  if (legacy && typeof legacy === "object") {
    stateStore.writeAtomic(file, legacy);
    _maybeCleanLegacy(statePath, "market_quotes");
    return legacy;
  }
  return null;
}

export function writeQuotesState(quotes: any, statePath?: any): void {
  stateStore.writeAtomic(quotesFilePath(statePath), quotes);
}

/**
 * 专属文件：finance_ai.json（与 state.json 同目录），缓存 AI 解读结果。
 * 独立落盘，绝不进入 state.json，彻底避开 PRESERVE_FIELDS 静默丢弃陷阱
 * （与 financial_news / market_quotes 同策略）。
 */
export function aiFilePath(statePath?: any): string {
  const p = statePath || stateStore.defaultPath();
  return path.join(path.dirname(p), "finance_ai.json");
}

/** 读 AI 解读子状态（专属文件优先；不存在/损坏时返回空对象）。 */
export function readAiState(statePath?: any): any {
  const file = aiFilePath(statePath);
  return _rawReadJson(file) || {};
}

export function writeAiState(state: any, statePath?: any): void {
  stateStore.writeAtomic(
    aiFilePath(statePath),
    state && typeof state === "object" ? state : {},
  );
}
