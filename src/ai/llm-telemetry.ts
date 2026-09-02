/**
 * src/ai/llm-telemetry.ts
 *
 * P2-10: LLM 调用可观测性 — 内存 ring buffer 记录每次调用的
 * provider/model/延迟/token/结果, 供诊断与成本归因.
 *
 * 纯模块状态 + 无 Node 依赖 (主进程各 LLM 路径埋点, 测试可读).
 */

export type LlmCallRecord = {
  ts: number;
  providerId: string;
  model: string;
  latencyMs: number;
  totalTokens?: number;
  /** "ok" | "llm_failed" | "cancelled" | ... */
  reason: string;
  ok: boolean;
};

export const LLM_TELEMETRY_MAX = 500;

const records: LlmCallRecord[] = [];

export function recordLlmCall(r: LlmCallRecord): void {
  records.push(r);
  if (records.length > LLM_TELEMETRY_MAX) {
    records.splice(0, records.length - LLM_TELEMETRY_MAX);
  }
}

export function getLlmTelemetry(): LlmCallRecord[] {
  return [...records];
}

export function clearLlmTelemetry(): void {
  records.length = 0;
}

/** 埋点便捷入口 — 由各 LLM 路径在出口调用, 自动算 latency */
export function recordLlmOutcome(opts: {
  t0: number;
  providerId: string;
  model: string;
  ok: boolean;
  reason: string;
  totalTokens?: number;
}): void {
  recordLlmCall({
    ts: opts.t0,
    providerId: opts.providerId,
    model: opts.model,
    latencyMs: Date.now() - opts.t0,
    totalTokens: opts.totalTokens,
    reason: opts.reason,
    ok: opts.ok,
  });
}

export type LlmTelemetrySummary = {
  total: number;
  ok: number;
  failed: number;
  avgLatencyMs: number;
  totalTokens: number;
  byProvider: Record<
    string,
    { calls: number; failed: number; avgLatencyMs: number; totalTokens: number }
  >;
};

/** 聚合最近调用 — 供诊断面板 / 成本归因 */
export function summarizeLlmTelemetry(): LlmTelemetrySummary {
  const byProvider: Record<
    string,
    { calls: number; failed: number; latencySum: number; totalTokens: number }
  > = {};
  let ok = 0;
  let failed = 0;
  let totalTokens = 0;
  let latencySum = 0;
  for (const r of records) {
    if (r.ok) ok++;
    else failed++;
    totalTokens += r.totalTokens ?? 0;
    latencySum += r.latencyMs;
    const p =
      byProvider[r.providerId] ||
      (byProvider[r.providerId] = { calls: 0, failed: 0, latencySum: 0, totalTokens: 0 });
    p.calls++;
    if (!r.ok) p.failed++;
    p.latencySum += r.latencyMs;
    p.totalTokens += r.totalTokens ?? 0;
  }
  const byProviderOut: LlmTelemetrySummary["byProvider"] = {};
  for (const [k, p] of Object.entries(byProvider)) {
    byProviderOut[k] = {
      calls: p.calls,
      failed: p.failed,
      avgLatencyMs: p.calls > 0 ? Math.round(p.latencySum / p.calls) : 0,
      totalTokens: p.totalTokens,
    };
  }
  return {
    total: records.length,
    ok,
    failed,
    avgLatencyMs: records.length > 0 ? Math.round(latencySum / records.length) : 0,
    totalTokens,
    byProvider: byProviderOut,
  };
}
