/**
 * src/ai-usage/client-codex.ts
 *
 * CodexQuotaClient: 读本机 codex CLI 的 OAuth 凭据, 直连 OpenAI 内部用量端点.
 *
 * 机制来源 (2026-09-16 对照 CodexBar / steipete 的 CodexOAuthUsageFetcher.swift):
 *   1) 读 `$CODEX_HOME/auth.json`, 无则 `~/.codex/auth.json`
 *      → tokens.access_token + tokens.account_id
 *   2) GET https://chatgpt.com/backend-api/wham/usage
 *        Authorization: Bearer <access_token>
 *        ChatGPT-Account-Id: <account_id>
 *   3) 响应关键字段:
 *      - rate_limit.primary_window / secondary_window
 *          { used_percent, reset_at(秒), reset_after_seconds, limit_window_seconds }
 *          limit_window_seconds 18000 = 5h 窗口, 604800 = 周窗口 (CodexBar 同款判定)
 *      - spend_control.individual_limit → 月度 credit 池
 *          { limit, used, remaining, used_percent, reset_at } (数值是字符串)
 *      - account_id / email / plan_type 身份信息
 *
 * 刻意不做的事:
 *   - **不刷新 token**: access_token 过期时 CodexBar 也是委托 `codex` CLI 自己刷
 *     (auth.json 的 owner 是 CLI). 这里只读不写, 过期前直接返 token_expired.
 *   - 不做 `codex app-server` JSON-RPC fallback (CodexBar 的 CLI 路径): 实测 OAuth
 *     直连可用, 只有直连被挡时才需要补.
 *   - 不解析 additional_rate_limits / credits.balance: 前者是模型专属窗口
 *     (Codex Spark), 后者对订阅账号常为 null, 都不影响"还剩多少额度"这个主问题.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { classifyHttpResponse } from "./_shared-http";

export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

/** token 剩余寿命低于这个值就当过期, 不发请求 (省一次必然 401 的往返). */
const EXPIRY_GUARD_MS = 60_000;

/** limit_window_seconds → windows key. 跟 CodexBar CodexRateWindowNormalizer 同判定. */
const WINDOW_BY_SECONDS: Record<number, string> = {
  18000: "5h",
  604800: "weekly",
};

const WINDOW_LABELS: Record<string, string> = {
  "5h": "5 小时窗口",
  weekly: "周窗口",
  monthly: "月度 credit 池",
};

/**
 * auth.json 路径. $CODEX_HOME 优先 (跟 codex CLI / CodexBar 一致).
 * @param {object} [env]
 * @returns {string}
 */
export function resolveCodexAuthPath(env: any = process.env) {
  const home =
    env && typeof env.CODEX_HOME === "string" && env.CODEX_HOME.length > 0
      ? env.CODEX_HOME
      : path.join(os.homedir(), ".codex");
  return path.join(home, "auth.json");
}

/**
 * 解 access_token (JWT) 的 exp → 毫秒. 解不开返 null (不阻断, 让 API 自己拒).
 * @param {string} token
 * @returns {number|null}
 */
export function _jwtExpMs(token: any) {
  try {
    const seg = String(token).split(".")[1];
    if (!seg) return null;
    const payload = JSON.parse(
      Buffer.from(seg, "base64url").toString("utf8"),
    );
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * 读 codex 凭据. 只读, 不写回 auth.json.
 * @param {object} [opts] { env, authPath }
 * @returns {{ok:true, accessToken, accountId, expiresAtMs, authMode, authPath}|{ok:false, reason, error?}}
 */
export function readCodexCredentials(opts: any = {}) {
  const env = opts.env || process.env;
  const authPath = opts.authPath || resolveCodexAuthPath(env);

  let raw;
  try {
    raw = fs.readFileSync(authPath, "utf8");
  } catch {
    return { ok: false, reason: "codex_auth_missing", error: authPath };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "codex_auth_unreadable", error: authPath };
  }

  const tokens = parsed && parsed.tokens;
  const accessToken =
    tokens && typeof tokens.access_token === "string" && tokens.access_token.length > 0
      ? tokens.access_token
      : null;
  if (!accessToken) {
    // auth.json 存在但只有 OPENAI_API_KEY (API key 模式) — wham/usage 要 OAuth, 用不了
    return { ok: false, reason: "codex_auth_missing", error: "no_oauth_tokens" };
  }

  return {
    ok: true,
    accessToken,
    accountId:
      tokens && typeof tokens.account_id === "string" ? tokens.account_id : null,
    expiresAtMs: _jwtExpMs(accessToken),
    authMode: typeof parsed.auth_mode === "string" ? parsed.auth_mode : null,
    authPath,
  };
}

/** "15000" / 15000 / 15000.4 → number; 其它 → null. */
function _num(v: any) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * 组装单个额度窗口, 形状跟 normalize.ts / normalize-glm.ts 的 window 完全一致.
 * 任一维度都没有值 → null (调用方跳过, 不塞空窗口).
 */
export function _buildWindow({
  usedPercent = null,
  resetAtMs = null,
  resetInSec = null,
  total = null,
  used = null,
  remaining = null,
  label = "",
}: any = {}) {
  if (
    usedPercent === null &&
    resetAtMs === null &&
    total === null
  ) {
    return null;
  }
  return {
    total,
    remaining,
    used,
    usedPercent:
      typeof usedPercent === "number"
        ? Math.max(0, Math.min(100, Math.round(usedPercent)))
        : null,
    resetAt: resetAtMs,
    resetInSec,
    label,
    modelName: null,
    status: null,
    startTime: null,
    endTime: null,
  };
}

/** rate_limit 里的一个 raw window → 标准 window. */
function _fromRateWindow(w: any, label: string, fetchedAt: number) {
  if (!w || typeof w !== "object") return null;
  const resetAtSec = _num(w.reset_at);
  const resetInSec = _num(w.reset_after_seconds);
  return _buildWindow({
    usedPercent: _num(w.used_percent),
    resetAtMs: resetAtSec !== null ? resetAtSec * 1000 : null,
    resetInSec:
      resetInSec !== null
        ? Math.max(0, Math.round(resetInSec))
        : resetAtSec !== null
          ? Math.max(0, Math.round(resetAtSec - fetchedAt / 1000))
          : null,
    label,
  });
}

/**
 * wham/usage 原始响应 → 标准化 snapshot.
 *
 * windows key 分配:
 *   - rate_limit.primary_window / secondary_window → 按 limit_window_seconds 命中
 *     "5h" / "weekly"; 认不出的窗口退化成 `win<N>m` (不丢数据)
 *   - spend_control.individual_limit → "monthly" (business/enterprise 账号走这条,
 *     此时 rate_limit 是 null, 月度 credit 池才是真正的约束)
 *
 * @param {object|null} rawResponse
 * @param {object} [opts] { fetchedAt, endpoint }
 * @returns {{ok:true, snapshot:object}|{ok:false, reason:string, error?:string}}
 */
export function normalizeCodex(rawResponse: any, opts: any = {}) {
  if (!rawResponse || typeof rawResponse !== "object") {
    return { ok: false, reason: "response_not_json", error: "response_not_object" };
  }

  const fetchedAt =
    typeof opts.fetchedAt === "number" ? opts.fetchedAt : Date.now();
  const windows: Record<string, any> = {};

  // 1) rate_limit 的 5h / 周窗口 (消费级 plus/pro 账号走这条)
  const rl = rawResponse.rate_limit;
  if (rl && typeof rl === "object") {
    for (const key of ["primary_window", "secondary_window"]) {
      const raw = rl[key];
      if (!raw || typeof raw !== "object") continue;
      const seconds = _num(raw.limit_window_seconds);
      const winKey =
        seconds !== null
          ? (WINDOW_BY_SECONDS[seconds] ?? `win${Math.round(seconds / 60)}m`)
          : "unknown";
      const w = _fromRateWindow(
        raw,
        WINDOW_LABELS[winKey] || `${winKey} 窗口`,
        fetchedAt,
      );
      if (w) windows[winKey] = w;
    }
  }

  // 2) 月度 credit 池 (business / enterprise)
  const spend = rawResponse.spend_control;
  const limit =
    spend && typeof spend === "object" ? spend.individual_limit : null;
  if (limit && typeof limit === "object") {
    const total = _num(limit.limit);
    const used = _num(limit.used);
    const remaining = _num(limit.remaining);
    const resetAtSec = _num(limit.reset_at);
    const resetAfterSec = _num(limit.reset_after_seconds);
    const w = _buildWindow({
      usedPercent:
        _num(limit.used_percent) ??
        (total !== null && total > 0 && used !== null
          ? Math.round((used / total) * 100)
          : null),
      total,
      used,
      remaining,
      resetAtMs: resetAtSec !== null ? resetAtSec * 1000 : null,
      resetInSec:
        resetAfterSec !== null
          ? Math.max(0, Math.round(resetAfterSec))
          : resetAtSec !== null
            ? Math.max(0, Math.round(resetAtSec - fetchedAt / 1000))
            : null,
      label: WINDOW_LABELS.monthly,
    });
    if (w) windows.monthly = w;
  }

  return {
    ok: true,
    snapshot: {
      provider: "codex",
      region: null,
      fetchedAt,
      endpoint: typeof opts.endpoint === "string" ? opts.endpoint : null,
      level:
        typeof rawResponse.plan_type === "string" ? rawResponse.plan_type : null,
      planType:
        typeof rawResponse.plan_type === "string" ? rawResponse.plan_type : null,
      accountEmail:
        typeof rawResponse.email === "string" ? rawResponse.email : null,
      windows,
      credits: null,
      toolUsageDetails: [],
    },
  };
}

export class CodexQuotaClient {
  authPath: any;
  env: any;
  httpClient: any;
  log: any;
  _inFlight: any;

  /**
   * @param {object} [opts]
   * @param {string} [opts.authPath]  auth.json 全路径 override (测试用)
   * @param {object} [opts.env]       环境变量 override (测试用)
   * @param {object} [opts.httpClient] 注入的 HttpClient (测试用)
   * @param {object} [opts.log]
   */
  constructor(opts: any = {}) {
    this.authPath = opts.authPath || null;
    this.env = opts.env || process.env;
    this.httpClient = opts.httpClient || null;
    this.log = opts.log || { info: () => {}, warn: () => {}, error: () => {} };
    this._inFlight = null;
  }

  /**
   * 拉一次. _inFlight 单例: 并发调用共享同一次 HTTP.
   * @returns {Promise<{ok, snapshot?, reason?, error?, status?}>}
   */
  async fetchOnce(opts: any = {}) {
    if (this._inFlight) return this._inFlight;
    this._inFlight = (async () => {
      try {
        return await this._doFetch(opts);
      } finally {
        this._inFlight = null;
      }
    })();
    return this._inFlight;
  }

  async _doFetch(_opts: any = {}) {
    // 1) 凭据 — 不走 safeStorage apiKey, 直接读 codex CLI 自己维护的 auth.json
    const cred = readCodexCredentials({
      env: this.env,
      authPath: this.authPath,
    });
    if (!cred.ok) return cred;

    // 2) 本地判过期 — 省一次必然 401 的请求; 刷新交给 codex CLI (它 owns auth.json)
    if (
      typeof cred.expiresAtMs === "number" &&
      cred.expiresAtMs - Date.now() <= EXPIRY_GUARD_MS
    ) {
      return {
        ok: false,
        reason: "token_expired",
        error: "run `codex login` to refresh",
      };
    }

    // 3) 发请求
    const { HttpClient: HttpClientCtor } = require("../main/http-client.js");
    const http =
      this.httpClient || new HttpClientCtor({ timeout: 15_000, maxRetries: 0 });
    const headers: Record<string, string> = {
      Authorization: `Bearer ${cred.accessToken}`,
      Accept: "application/json",
      "User-Agent": "Pulse",
    };
    if (cred.accountId) headers["ChatGPT-Account-Id"] = cred.accountId;

    let r;
    try {
      r = await http.get(CODEX_USAGE_URL, { headers, timeout: 15_000 });
    } catch (err: any) {
      return {
        ok: false,
        reason: "network_failed",
        error: (err && err.message) || "unknown",
      };
    }

    // 4) status ladder
    const httpErr = classifyHttpResponse(r);
    if (httpErr) return httpErr;

    // 5) parse + normalize
    let parsed;
    try {
      parsed = JSON.parse(r.body);
    } catch (err: any) {
      return {
        ok: false,
        reason: "response_not_json",
        error: err.message,
        status: r.status,
      };
    }

    const n = normalizeCodex(parsed, {
      fetchedAt: Date.now(),
      endpoint: CODEX_USAGE_URL,
    });
    if (!n.ok) {
      return { ok: false, reason: n.reason, error: n.error, status: r.status };
    }
    return { ok: true, snapshot: n.snapshot };
  }
}
