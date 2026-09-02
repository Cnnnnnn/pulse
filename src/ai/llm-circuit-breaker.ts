/**
 * src/ai/llm-circuit-breaker.ts
 *
 * P1-5: LLM provider 熔断 + 非流式指数退避重试.
 *
 * 熔断语义 (一次性简化状态机):
 *   - closed → 连续失败 BREAKER_FAILURE_THRESHOLD 次 → open (记录 openedAt)
 *   - open   → isLlmOpen 返回 true, 调用方短路, 不打 provider
 *   - 满 BREAKER_OPEN_MS 后进入 half-open → 放行一次探测
 *     · 探测成功 → closed (重置)
 *     · 探测失败 → 重新 open (刷新窗口)
 *
 * 纯模块状态 + 无 Node 依赖 (setTimeout 为全局). 供 shared-llm / chat-with-tools /
 * chat-stream 各路径在「有 providerId 的地方」检查 + 按结果记录.
 */

export const BREAKER_FAILURE_THRESHOLD = 3;
export const BREAKER_OPEN_MS = 30_000;

type BreakerState = { failures: number; openedAt: number | null };

const state: Record<string, BreakerState> = {};

function getState(providerId: string): BreakerState {
  if (!state[providerId]) state[providerId] = { failures: 0, openedAt: null };
  return state[providerId];
}

/** 熔断是否打开 (open 期间短路; half-open 放行探测) */
export function isLlmOpen(providerId: string): boolean {
  const s = state[providerId];
  if (!s || s.openedAt == null) return false;
  return Date.now() - s.openedAt < BREAKER_OPEN_MS;
}

export function recordLlmSuccess(providerId: string): void {
  delete state[providerId];
}

export function recordLlmFailure(providerId: string): void {
  const s = getState(providerId);
  if (s.openedAt == null) {
    // closed: 累计连续失败
    s.failures += 1;
    if (s.failures >= BREAKER_FAILURE_THRESHOLD) {
      s.openedAt = Date.now();
    }
  } else if (Date.now() - s.openedAt >= BREAKER_OPEN_MS) {
    // half-open 探测失败 → 重新打开窗口
    s.openedAt = Date.now();
    s.failures = BREAKER_FAILURE_THRESHOLD;
  }
  // 仍 open 期间的额外失败不刷新窗口 (保持原始 openedAt)
}

/** 重置熔断 (测试 / 手动恢复). providerId 省略时全部重置. */
export function resetLlmBreaker(providerId?: string): void {
  if (providerId) {
    delete state[providerId];
    return;
  }
  for (const k of Object.keys(state)) delete state[k];
}

export type RetryableResult = { error?: string; status?: number };

export interface RetryBackoffOpts {
  /** 总尝试次数 (含首次) */
  attempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isRetryable?: (_result: RetryableResult) => boolean;
  onRetry?: (_attempt: number, _delayMs: number) => void;
}

/** 默认 retryable: 网络/超时错误 或 5xx (4xx 不重试 — 参数/鉴权问题重试无益) */
export function defaultRetryable(r: RetryableResult): boolean {
  return (
    r.error === "network" ||
    r.error === "timeout" ||
    (typeof r.status === "number" && r.status >= 500)
  );
}

/**
 * 非流式 LLM 调用的指数退避重试.
 * 【注意】不可用于流式: 已流出的 delta 无法撤回, 重试会重复输出.
 */
export async function withRetryBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryBackoffOpts,
): Promise<T> {
  const base = opts.baseDelayMs ?? 500;
  const maxDelay = opts.maxDelayMs ?? 4000;
  const isRetryable = opts.isRetryable ?? defaultRetryable;
  let last: T;
  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    last = await fn();
    if (attempt === opts.attempts - 1) break;
    if (!isRetryable(last as unknown as RetryableResult)) return last;
    const delay = Math.min(maxDelay, base * 2 ** attempt);
    opts.onRetry?.(attempt + 1, delay);
    await new Promise((r) => setTimeout(r, delay));
  }
  return last!;
}
