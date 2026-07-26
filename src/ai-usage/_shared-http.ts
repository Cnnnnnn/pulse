/**
 * src/ai-usage/_shared-http.ts
 *
 * ai-usage client 共享的 HTTP 响应分类 helper.
 *
 * 2026-07-26 (code-simplifier audit A7): 之前 client.ts:_doFetch / _doFetchUsageSummary
 *   + client-glm.ts:_doFetch 三处的 status → reason ladder 字节相同 (只格式微差),
 *   统一抽出避免漂移. auth_401 / auth_403 / rate_limited / http_status_N 是 UI 跟
 *   告警的关键 reason, 不能跑偏.
 *
 * 注: 这里只分类, 不抛错. 调用方拿到 { ok: false, reason, status } 自己决定怎么返.
 */

export interface HttpResponseLike {
  status?: number;
  error?: string;
  body?: string;
}

export interface ClassifyResult {
  ok: false;
  reason:
    | "network_failed"
    | "auth_401"
    | "auth_403"
    | "rate_limited"
    | "http_status_404"
    | `http_status_${number}`
    | "response_not_json";
  status?: number;
  error?: string;
}

/**
 * 把 httpClient 返回的 r 分类:
 *   - r.error 且无 status  → network_failed
 *   - 401 / 403 / 429 / 404 → 对应 reason
 *   - status >= 500 → http_status_N
 *   - status < 200 || status >= 300 → http_status_N
 *   - 否则返 null (调用方继续走 parse JSON / 业务校验分支)
 *
 * ponytail: 跟原 inline 实现完全等价 (status=undefined 不会命中任何 if, 落到
 * parse JSON 分支, 由 JSON.parse 自然 fail 走 response_not_json).
 */
export function classifyHttpResponse(r: HttpResponseLike): ClassifyResult | null {
  if (r.error && !r.status) {
    return { ok: false, reason: "network_failed", error: r.error };
  }
  const status = r.status;
  if (status === 401) return { ok: false, reason: "auth_401", status };
  if (status === 403) return { ok: false, reason: "auth_403", status };
  if (status === 429) return { ok: false, reason: "rate_limited", status };
  if (status === 404) return { ok: false, reason: "http_status_404", status };
  // 此处开始 status 一定是 number (前面 === 401/403/429/404 都没命中,
  // undefined 也不可能走到这里 — 因为 r.error && !r.status 已在前面 short-circuit).
  if (typeof status === "number") {
    if (status >= 500) return { ok: false, reason: `http_status_${status}`, status };
    if (status < 200 || status >= 300) {
      return { ok: false, reason: `http_status_${status}`, status };
    }
  }
  return null;
}
