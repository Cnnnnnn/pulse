/**
 * src/ai-usage/normalize-usage-summary.js
 *
 * Pure functions: usage_summary raw response → standardized usageStats.
 *
 * Endpoint: GET /backend/account/token_plan/usage_summary
 * Spec: 真实数据 schema (无 spec, 直接看 raw response).
 *
 * 返回字段:
 *   - totalDays, totalTokenConsumed, usageRankingPercent
 *   - mostActiveDay: { date, tokenCount, imageCount, videoCount, musicCount, voiceCharacterCount }
 *   - activeDays, currentConsecutiveDays
 *   - dailyTokenUsage: number[]  近 90 天每天的 token (升序: 90 天前→今天)
 *   - dateModelUsage: [{ date, models:[{model, input, cacheRead, cacheCreate, output, total, cacheHitPercent}], totals: {...} }]
 *   - lastUpdateTime
 */

/**
 * 解析带单位 token 字符串 ("7.45B" / "452.78M" / "1234" / null) → 数字.
 * @param {string|number|null|undefined} v
 * @returns {number|null}
 */
function _parseTokenStr(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v !== "string") return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*([KkMmBb])?\s*$/.exec(v.trim());
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base) || base < 0) return null;
  const unit = m[2];
  if (!unit) return Math.round(base);
  const lower = unit.toLowerCase();
  if (lower === "k") return Math.round(base * 1_000);
  if (lower === "m") return Math.round(base * 1_000_000);
  if (lower === "b") return Math.round(base * 1_000_000_000);
  return Math.round(base);
}

/**
 * 解析 "57.11%" 格式的命中率百分比 → 数字 0-100.
 * @param {string|number|null|undefined} v
 * @returns {number|null}
 */
function _parsePctStr(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
  if (typeof v !== "string") return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(v.trim());
  if (!m) return null;
  return Math.max(0, Math.min(100, Number(m[1])));
}

function _pickNumber(obj, keys) {
  if (!obj || typeof obj !== "object" || !Array.isArray(keys) || keys.length === 0) return null;
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/**
 * 主入口: 解析 raw usage_summary response → 标准化 usageStats.
 * @param {object|null} rawResponse
 * @param {object} [opts] { fetchedAt, endpoint }
 * @returns {{ok: boolean, usageStats?: object, reason?: string, error?: string}}
 */
function normalizeUsageSummary(rawResponse, opts = {}) {
  if (!rawResponse || typeof rawResponse !== "object") {
    return { ok: false, reason: "api_error", error: "response_not_object" };
  }

  // base_resp 校验
  const baseResp = rawResponse.base_resp;
  if (baseResp && typeof baseResp === "object" && typeof baseResp.status_code === "number"
      && baseResp.status_code !== 0) {
    return { ok: false, reason: "api_error", error: baseResp.status_msg || "unknown" };
  }

  const totalDays = _pickNumber(rawResponse, ["total_days"]);
  const totalTokenConsumed = _parseTokenStr(rawResponse.total_token_consumed);
  const usageRankingPercent = _pickNumber(rawResponse, ["usage_ranking_percent"]);
  const activeDays = _pickNumber(rawResponse, ["active_days"]);
  const currentConsecutiveDays = _pickNumber(rawResponse, ["current_consecutive_days"]);
  const lastUpdateTime = typeof rawResponse.last_update_time === "string"
    ? rawResponse.last_update_time
    : null;

  // most_active_day
  const mad = rawResponse.most_active_day;
  const mostActiveDay = (mad && typeof mad === "object") ? {
    date: typeof mad.date === "string" ? mad.date : null,
    tokenCount: _parseTokenStr(mad.token_count),
    imageCount: _pickNumber(mad, ["image_count"]),
    videoCount: _pickNumber(mad, ["video_count"]),
    musicCount: _pickNumber(mad, ["music_count"]),
    voiceCharacterCount: _pickNumber(mad, ["voice_character_count"]),
  } : null;

  // daily_token_usage: 90 个 number (可能为 0)
  const dailyTokenUsage = Array.isArray(rawResponse.daily_token_usage)
    ? rawResponse.daily_token_usage.map((v) => (typeof v === "number" && Number.isFinite(v) && v >= 0) ? v : 0)
    : [];

  // date_model_usage: 90 项, 每项含 models[] + totals
  let dateModelUsage = [];
  let modelTotals = {}; // 按 model 聚合 90 天总 token (排序用)
  let grandTotal = 0;
  if (Array.isArray(rawResponse.date_model_usage)) {
    dateModelUsage = rawResponse.date_model_usage.map((d) => {
      if (!d || typeof d !== "object") return null;
      const dayTotal = _pickNumber(d, ["total_token"]) || 0;
      grandTotal += dayTotal;
      const models = Array.isArray(d.models)
        ? d.models.map((m) => {
            if (!m || typeof m !== "object") return null;
            const total = _pickNumber(m, ["total_token"]) || 0;
            const name = typeof m.model === "string" ? m.model : null;
            if (name) {
              modelTotals[name] = (modelTotals[name] || 0) + total;
            }
            return {
              model: name,
              inputToken: _pickNumber(m, ["input_token"]),
              cacheReadToken: _pickNumber(m, ["cache_read_token"]),
              cacheCreateToken: _pickNumber(m, ["cache_create_token"]),
              outputToken: _pickNumber(m, ["output_token"]),
              totalToken: total,
              cacheHitPercent: _parsePctStr(m.cache_hit_percent),
            };
          }).filter(Boolean)
        : [];
      return {
        date: typeof d.date === "string" ? d.date : null,
        models,
        totals: {
          inputToken: _pickNumber(d, ["total_input_token"]),
          cacheReadToken: _pickNumber(d, ["total_cache_read_token"]),
          cacheCreateToken: _pickNumber(d, ["total_cache_create_token"]),
          outputToken: _pickNumber(d, ["total_output_token"]),
          totalToken: dayTotal,
          cacheHitPercent: _parsePctStr(d.cache_hit_percent),
        },
      };
    }).filter(Boolean);
  }

  // model breakdown: 按 90 天累计 token 降序
  // 分母用 modelsTotals 之和 (跟分子一致), 不是 grandTotal (后者去重了一天内的 input/cache, 跟 model 维度不可比)
  const modelsTotals = Object.values(modelTotals).reduce((s, v) => s + v, 0);
  const modelBreakdown = Object.entries(modelTotals)
    .map(([name, total]) => ({
      model: name,
      totalToken: total,
      sharePercent: modelsTotals > 0 ? Math.round((total / modelsTotals) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalToken - a.totalToken);

  // 7 天平均 (daily_token_usage 末尾 7 个 = 最近 7 天, 假设顺序是 [旧 → 新])
  const recent7 = dailyTokenUsage.slice(-7);
  const recent7Avg = recent7.length > 0
    ? Math.round(recent7.reduce((s, v) => s + v, 0) / recent7.length)
    : null;

  // 30 天平均
  const recent30 = dailyTokenUsage.slice(-30);
  const recent30Avg = recent30.length > 0
    ? Math.round(recent30.reduce((s, v) => s + v, 0) / recent30.length)
    : null;

  return {
    ok: true,
    usageStats: {
      fetchedAt: typeof opts.fetchedAt === "number" ? opts.fetchedAt : Date.now(),
      endpoint: typeof opts.endpoint === "string" ? opts.endpoint : null,
      totalDays,
      totalTokenConsumed,
      usageRankingPercent,
      activeDays,
      currentConsecutiveDays,
      lastUpdateTime,
      mostActiveDay,
      dailyTokenUsage,
      dateModelUsage,
      modelBreakdown,
      grandTotal,
      recent7Avg,
      recent30Avg,
    },
  };
}

module.exports = { normalizeUsageSummary, _parseTokenStr, _parsePctStr };