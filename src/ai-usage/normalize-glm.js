/**
 * src/ai-usage/normalize-glm.js
 *
 * Pure functions: z.ai /api/monitor/usage/quota/limit response → standardized snapshot.
 *
 * z.ai monitor API 响应 schema:
 *   {
 *     "code": 200, "msg": "操作成功", "success": true,
 *     "data": {
 *       "level": "pro",  // 套餐档: lite/pro/max
 *       "limits": [
 *         { "type": "TOKENS_LIMIT", "unit": 3, "number": 5, "usage": 800000000,
 *           "currentValue": 127694464, "remaining": 672305536, "percentage": 15,
 *           "nextResetTime": 1770648402389 },                                  // 5h 窗口
 *         { "type": "TOKENS_LIMIT", "unit": 6, "number": 7, "usage": ..., ... },  // 周窗口
 *         { "type": "TIME_LIMIT", "usage": 4000, "currentValue": 1828,
 *           "remaining": 2172, "percentage": 45, "usageDetails": [...] }          // MCP 时长
 *       ]
 *     }
 *   }
 *
 * 区分 5h/weekly/MCP:
 * - TOKENS_LIMIT + unit:3, number:5 → 5 小时滚动窗口
 * - TOKENS_LIMIT + unit:6, number:7 → 7 天周窗口
 * - TIME_LIMIT → MCP 时长窗口 (按月)
 */

const TOKENS_LIMIT_5H = { type: "TOKENS_LIMIT", unit: 3, number: 5 };
// weekly: 真实 API 返回 unit:6 + number:N (N 会变: 文档示例 number:7, 实际 pro 套餐 number:1).
// 只按 unit:6 匹配, 不卡 number — 否则套餐/版本一变就取不到 weekly.
const TOKENS_LIMIT_WEEKLY = { type: "TOKENS_LIMIT", unit: 6 };
const TIME_LIMIT_MCP = { type: "TIME_LIMIT" };

/**
 * 找出符合 type + unit + number 标识的 limit 块.
 * @param {object[]} limits
 * @param {object} expect { type, unit?, number? }
 * @returns {object|null}
 */
function _findLimit(limits, expect) {
  if (!Array.isArray(limits)) return null;
  return (
    limits.find((l) => {
      if (!l || typeof l !== "object") return false;
      if (l.type !== expect.type) return false;
      if (expect.unit !== undefined && l.unit !== expect.unit) return false;
      if (expect.number !== undefined && l.number !== expect.number)
        return false;
      return true;
    }) || null
  );
}

/**
 * 组装单个窗口数据. GLM 直接有 usage / usage(总) / currentValue / remaining / percentage / nextResetTime,
 * 比 minimax schema 更直接.
 * @param {object} opts
 * @returns {object|null}
 */
function _buildWindow({
  total,
  remaining,
  usedPercent,
  resetAt,
  label,
  fetchedAt,
}) {
  if (
    total === null &&
    remaining === null &&
    usedPercent === null &&
    resetAt === null
  )
    return null;
  const used =
    typeof total === "number" && typeof remaining === "number"
      ? Math.max(0, total - remaining)
      : null;
  const usedPct =
    typeof usedPercent === "number"
      ? Math.max(0, Math.min(100, usedPercent))
      : null;
  const resetAtMs = typeof resetAt === "number" ? resetAt : null;
  const resetInSec =
    typeof resetAtMs === "number" && typeof fetchedAt === "number"
      ? Math.max(0, Math.round((resetAtMs - fetchedAt) / 1000))
      : null;
  return {
    total: typeof total === "number" ? total : null,
    remaining: typeof remaining === "number" ? remaining : null,
    used,
    usedPercent: usedPct,
    resetAt: resetAtMs,
    resetInSec,
    label: label || "",
    modelName: null,
    status: null,
    startTime: null,
    endTime: null,
  };
}

/**
 * 主入口: 解析 z.ai raw API response → 标准化 snapshot.
 * @param {object|null} rawResponse
 * @param {object} [opts] { fetchedAt, endpoint, provider, region }
 * @returns {{ok: boolean, snapshot?: object, reason?: string, error?: string}}
 */
function normalizeGlm(rawResponse, opts = {}) {
  if (!rawResponse || typeof rawResponse !== "object") {
    return { ok: false, reason: "api_error", error: "response_not_object" };
  }

  // 1) z.ai 用 { code, msg, success, data } 包裹
  //    success=false 或 code != 200 当 API error
  const success = rawResponse.success;
  const code = rawResponse.code;
  if (success === false || (typeof code === "number" && code !== 200)) {
    return {
      ok: false,
      reason: "api_error",
      error: rawResponse.msg || `code_${code}`,
    };
  }

  const data = rawResponse.data;
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "api_error", error: "data_missing" };
  }

  const limits = Array.isArray(data.limits) ? data.limits : [];

  const snapshot = {
    provider: opts.provider || "glm",
    region: opts.region || "global",
    fetchedAt: typeof opts.fetchedAt === "number" ? opts.fetchedAt : Date.now(),
    endpoint: typeof opts.endpoint === "string" ? opts.endpoint : null,
    level: typeof data.level === "string" ? data.level : null,
    windows: {},
    credits: null,
    toolUsageDetails: [],
    _rawLimits: limits,
  };

  // 2) 5h 窗口: TOKENS_LIMIT + unit:3,number:5
  const limit5h = _findLimit(limits, TOKENS_LIMIT_5H);
  if (limit5h) {
    snapshot.windows["5h"] = _buildWindow({
      total: typeof limit5h.usage === "number" ? limit5h.usage : null,
      remaining:
        typeof limit5h.remaining === "number" ? limit5h.remaining : null,
      usedPercent:
        typeof limit5h.percentage === "number" ? limit5h.percentage : null,
      resetAt:
        typeof limit5h.nextResetTime === "number"
          ? limit5h.nextResetTime
          : null,
      label: "5 小时滚动窗口",
      fetchedAt: snapshot.fetchedAt,
    });
  } else {
    snapshot.windows["5h"] = null;
  }

  // 3) 周窗口: TOKENS_LIMIT + unit:6,number:7
  const limitWeekly = _findLimit(limits, TOKENS_LIMIT_WEEKLY);
  if (limitWeekly) {
    snapshot.windows.weekly = _buildWindow({
      total: typeof limitWeekly.usage === "number" ? limitWeekly.usage : null,
      remaining:
        typeof limitWeekly.remaining === "number"
          ? limitWeekly.remaining
          : null,
      usedPercent:
        typeof limitWeekly.percentage === "number"
          ? limitWeekly.percentage
          : null,
      resetAt:
        typeof limitWeekly.nextResetTime === "number"
          ? limitWeekly.nextResetTime
          : null,
      label: "周窗口",
      fetchedAt: snapshot.fetchedAt,
    });
  } else {
    snapshot.windows.weekly = null;
  }

  // 4) MCP 时长窗口: TIME_LIMIT (按月)
  const limitMcp = _findLimit(limits, TIME_LIMIT_MCP);
  if (limitMcp) {
    snapshot.windows.mcp = _buildWindow({
      total: typeof limitMcp.usage === "number" ? limitMcp.usage : null,
      remaining:
        typeof limitMcp.remaining === "number" ? limitMcp.remaining : null,
      usedPercent:
        typeof limitMcp.percentage === "number" ? limitMcp.percentage : null,
      resetAt:
        typeof limitMcp.nextResetTime === "number"
          ? limitMcp.nextResetTime
          : null,
      label: "MCP 时长",
      fetchedAt: snapshot.fetchedAt,
    });
    // 4a) 工具调用细分 — search-prime / web-reader / zread 各自 usage
    // 仅当 API 真正给了 usageDetails 才挂载, 缺数据时保持空数组
    if (Array.isArray(limitMcp.usageDetails)) {
      snapshot.toolUsageDetails = limitMcp.usageDetails
        .filter((d) => d && typeof d === "object")
        .map((d) => ({
          modelCode: typeof d.modelCode === "string" ? d.modelCode : "",
          usage: typeof d.usage === "number" ? d.usage : 0,
        }))
        .filter((d) => d.modelCode.length > 0);
    }
  }

  return { ok: true, snapshot };
}

module.exports = {
  normalizeGlm,
  _findLimit,
  _buildWindow,
};
