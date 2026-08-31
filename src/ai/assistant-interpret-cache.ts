/**
 * 助手解读类工具 — 进程内短 TTL 缓存（同会话重复问不二次打 LLM）.
 */
import type { ToolResult } from "./assistant-tools";

export const ASSISTANT_INTERPRET_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 32;
const CACHE_HIT_SUFFIX = "（助手会话缓存）";

type CacheEntry = {
  result: ToolResult;
  ts: number;
};

const cache = new Map<string, CacheEntry>();

export function interpretCacheKey(
  tool: string,
  parts: Record<string, string>,
): string {
  const body = Object.keys(parts)
    .sort()
    .map((k) => `${k}=${parts[k]}`)
    .join("&");
  return `${tool}:${body}`;
}

export function getInterpretCache(key: string): ToolResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ASSISTANT_INTERPRET_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

export function setInterpretCache(key: string, result: ToolResult): void {
  if (!result.ok) return;
  cache.set(key, { result, ts: Date.now() });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}

export function markInterpretCacheHit(result: ToolResult): ToolResult {
  if (result.summary.includes(CACHE_HIT_SUFFIX)) return result;
  return {
    ...result,
    summary: `${result.summary}\n${CACHE_HIT_SUFFIX}`,
  };
}

export async function withInterpretCache(
  key: string,
  run: () => Promise<ToolResult>,
): Promise<ToolResult> {
  const hit = getInterpretCache(key);
  if (hit) return markInterpretCacheHit(hit);
  const result = await run();
  if (result.ok) setInterpretCache(key, result);
  return result;
}

export function clearInterpretCache(): void {
  cache.clear();
}

export function interpretCacheSize(): number {
  return cache.size;
}
