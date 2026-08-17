/**
 * src/main/ipc/register-leaderboard.js
 *
 * AI 榜单 — IPC 注册。
 *   leaderboard:get            → 聚合 (命中请求级缓存则直接返回)
 *   leaderboard:refresh        → 强制重拉 (force:true)，清缓存后回写
 *   leaderboard:export-csv     → 用户选保存路径 → fs.writeFile
 *
 * 渲染层只通过这几个通道交互（白名单）。请求级缓存 (Map + TTL 5min)
 * 使用请求级缓存，避免重复打外部 API（Arena/AA 有 rate limit）。
 */


// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type { IpcMainInvokeEvent } from "electron";
import type { AiLeaderboardOptions, IpcChannelMap } from "../../shared/ipc-contracts";


// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import { promises as fs } from "fs";
import * as path from "path";
import { getLeaderboard } from "../ai-leaderboard/index";
import { CATEGORY_META, DIMENSION_META, VENDOR_META } from "../ai-leaderboard/types";
import { budget } from "../ai-leaderboard/rate-limiter";

// ── 请求级缓存（Map + TTL）────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟
const CACHE_MAX = 32;
const LEADERBOARD_SOURCE_KEYS = ["arena", "aa", "openrouter", "livebench", "modelsdev", "huggingface"];
/** @type {Map<string, {result:object, fetchedAt:number}>} */
const _cache = new Map();

/**
 * 缓存键：仅含影响数据内容的维度（category/dimension/vendor/sortDir/search）。
 * force 不进 key —— 刷新走「跳过读取 + 回写」语义。
 * @param {object} opts
 * @returns {string}
 */
export function boardCacheKey(opts: AiLeaderboardOptions) {
  return JSON.stringify({
    category: opts.category,
    dimension: opts.dimension,
    vendor: opts.vendor,
    sortDir: opts.sortDir,
    search: opts.search || "",
    // ponytail: sources 必须进 key — 否则 arena/aa 等视角互相污染 IPC 5min 缓存
    sources: opts.sources || null,
  });
}

export function cacheGet(key: any) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.fetchedAt > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return e.result;
}

export function cacheSet(key: any, result: any) {
  if (_cache.size > CACHE_MAX) {
    const drop = [..._cache.keys()].slice(0, CACHE_MAX >> 1);
    for (const k of drop) _cache.delete(k);
  }
  _cache.set(key, { result, fetchedAt: Date.now() });
}

/** 测试 / 手动刷新用：清请求级缓存。 */
export function resetLeaderboardCache() {
  _cache.clear();
}

/**
 * 白名单 sanitize：仅允许已知 category / dimension / vendor 等。
 * @param {unknown} payload
 * @returns {object}
 */
export function sanitize(payload: unknown): AiLeaderboardOptions {
  const p =
    payload && typeof payload === "object"
      ? (payload as Record<string, any>)
      : {};
  const category = CATEGORY_META[p.category] ? p.category : "llm";
  const dimension = DIMENSION_META[p.dimension] ? p.dimension : "elo";
  const vendorValid =
    p.vendor && typeof p.vendor === "string" && (p.vendor === "all" || VENDOR_META[p.vendor]);
  const vendor = vendorValid ? p.vendor : "all";
  const sortDir = p.sortDir === "asc" ? "asc" : "desc";
  const search = typeof p.search === "string" ? p.search : "";
  const force = Boolean(p.force);
  // ponytail: sources 是严格白名单 — renderer 按 view 决定拉哪些源。
  // 只接受已知 key + boolean true，避免旧的「缺省即 true」语义把一次视角请求
  // 扩大成全源请求。未传 sources 的老调用仍然保持全源兼容。
  const sources = p.sources && typeof p.sources === "object"
    ? Object.fromEntries(LEADERBOARD_SOURCE_KEYS.map((key) => [key, p.sources[key] === true]))
    : Object.fromEntries(LEADERBOARD_SOURCE_KEYS.map((key) => [key, true]));
  return { category, dimension, vendor, sortDir, search, force, sources };
}

function aggregateFailure(err: unknown) {
  const message = errMsg(err);
  return {
    ok: false,
    reason: "aggregate_failed",
    error: message,
    items: [],
    sources: Object.fromEntries(LEADERBOARD_SOURCE_KEYS.map((key) => [key, "none"])),
    sourceCoverage: Object.fromEntries(LEADERBOARD_SOURCE_KEYS.map((key) => [key, 0])),
    attribution: [],
    count: 0,
    stale: false,
    fromCache: false,
    isSample: false,
    fetchedAt: new Date().toISOString(),
    lastUpdated: null,
    errors: [{ source: "aggregator", message, ts: new Date().toISOString() }],
    rateBudget: { aa: budget("artificial-analysis") },
  };
}

export function registerLeaderboardHandlers(ctx: any) {
  const { safeHandle } = ctx;
  // ponytail: 2026-07-22 CSV 导出 — dialog / BrowserWindow / app 从 ctx 注入
  // (与 register-stock-export 同构), 让测试可 mock.
  const { dialog, BrowserWindow, electronApp } = ctx;

  async function handleGet(
    _event: unknown,
    payload: IpcChannelMap["leaderboard:get"]["args"][0],
  ) {
    const opts = sanitize(payload);
    const key = boardCacheKey(opts);

    // 非强制请求命中缓存直接返回（附 fromCache 标记）
    if (!opts.force) {
      const cached = cacheGet(key);
      if (cached) {
        return { ...cached, fromCache: true };
      }
    }

    try {
      const result = await getLeaderboard(opts);
      cacheSet(key, result);
      return opts.force ? { ...result, fromCache: false } : result;
    } catch (err: any) {
      return aggregateFailure(err);
    }
  }

  safeHandle("leaderboard:get", handleGet, {
    logMeta: (
      _evt: unknown,
      payload: IpcChannelMap["leaderboard:get"]["args"][0],
    ) => ({
      category: payload && payload.category,
      dimension: payload && payload.dimension,
    }),
  });

  safeHandle("leaderboard:rate-budget", async () => budget("artificial-analysis"));

  // refresh = get + force:true；聚合内部绕过磁盘缓存重拉，回写请求级缓存。
  safeHandle(
    "leaderboard:refresh",
    async (
      _event: unknown,
      payload: IpcChannelMap["leaderboard:refresh"]["args"][0],
    ) => {
    const opts = sanitize(payload);
    opts.force = true;
    const key = boardCacheKey(opts);
    _cache.delete(key); // 强制清旧缓存，保证下次 get 拿到新结果
    try {
      const result = await getLeaderboard(opts);
      cacheSet(key, result);
      return { ...result, fromCache: false };
    } catch (err: unknown) {
      return aggregateFailure(err);
    }
    },
  );

  // 2026-07-22: CSV 导出 — renderer 把已序列化好的 CSV 字符串发过来, 主进程
  // 只负责弹保存对话框 + 写盘. 失败返 {ok:false, error}, 不抛 (safeHandle 兜底).
  safeHandle(
    "leaderboard:export-csv",
    async (
      event: IpcMainInvokeEvent,
      payload: IpcChannelMap["leaderboard:export-csv"]["args"][0],
    ) => {
    const csv = typeof payload?.csv === "string" ? payload.csv : "";
    const suggested =
      typeof payload?.filenameSuggestion === "string"
        ? payload.filenameSuggestion
        : "ai-leaderboard.csv";
    if (!csv) return { ok: false, error: "empty_csv" };
    if (!dialog || !BrowserWindow) return { ok: false, error: "main_not_ready" };
    let win;
    try {
      win = BrowserWindow.fromWebContents(event.sender);
    } catch {
      win = undefined;
    }
    let defaultPath;
    try {
      const downloads = electronApp && typeof electronApp.getPath === "function"
        ? electronApp.getPath("downloads")
        : "";
      defaultPath = downloads ? path.join(downloads, suggested) : suggested;
    } catch {
      defaultPath = suggested;
    }
    let result;
    try {
      result = await dialog.showSaveDialog(win || undefined, {
        defaultPath,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
    } catch (err: unknown) {
      return { ok: false, error: errMsg(err) };
    }
    if (result.canceled || !result.filePath) {
      return { ok: true, cancelled: true };
    }
    try {
      await fs.writeFile(result.filePath, csv, "utf8");
      return { ok: true, path: result.filePath };
    } catch (err: unknown) {
      return { ok: false, error: errMsg(err) };
    }
    },
    {
    logMeta: (
      _evt: unknown,
      payload: IpcChannelMap["leaderboard:export-csv"]["args"][0],
    ) => ({
      suggested: payload && payload.filenameSuggestion,
      size: typeof payload?.csv === "string" ? payload.csv.length : 0,
    }),
    },
  );
}

module.exports = {
  registerLeaderboardHandlers,
  boardCacheKey,
  cacheGet,
  cacheSet,
  resetLeaderboardCache,
  sanitize,
};
