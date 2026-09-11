/**
 * src/ai/assistant-query-cache.ts
 *
 * 只读查询工具短 TTL 进程内缓存 — 多轮 agent 中同一 query_* 不重复算。
 * 与 assistant-interpret-cache 分开：那边缓存 LLM 解读（分钟级），
 * 这边缓存 state 快照（秒级，状态变了很快过期）。
 */
import type { ToolResult } from "./assistant-tools";

export const QUERY_CACHE_TTL_MS = 30_000;
const MAX_ENTRIES = 16;

type Entry = { result: ToolResult; ts: number };
const cache = new Map<string, Entry>();

export function queryCacheKey(tool: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return tool;
  const body = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
  return `${tool}:${body}`;
}

export function getQueryCache(key: string): ToolResult | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > QUERY_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return e.result;
}

export function setQueryCache(key: string, result: ToolResult): void {
  if (!result || !result.ok) return;
  cache.set(key, { result, ts: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    // 删最旧
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of cache) {
      if (v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
}

/** @internal tests */
export function __resetQueryCacheForTest(): void {
  cache.clear();
}
