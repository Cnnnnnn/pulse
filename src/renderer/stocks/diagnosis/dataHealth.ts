/**
 * 股票诊断数据健康度 — 纯函数模块.
 *
 * ponytail 2026-07-18 P0-1: 把 perAngle 状态从 "ok"|"failed" 二态扩成 4 态,
 * 配合 STALE_MS 把"30 天没更新"显式标出, 避免用户把"季度披露窗口"误判成 bug.
 * 单一来源: STALE_MS 同时被 CardFreshness.jsx import, 避免阈值两份.
 */

export const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export const HEALTH_STATUS = {
  OK: "ok",
  PARTIAL: "partial",
  STALE: "stale",
  FAILED: "failed",
};

export const HEALTH_REASON_TEXT = {
  fetch_failed: "数据源请求失败",
  parse_failed: "数据源返回格式异常",
  exception: "数据源调用异常",
  no_industry_data: "该股无行业归属数据, 跳过同业对比",
  missing: "数据尚未拉取",
  unknown: "未知原因",
};

/**
 * 4 态派生:
 *   - failed > partial > stale > ok
 *   - 优先级: 后端 status='failed' 直接 failed, 不看陈旧度 (失败是事实)
 *   - 缺 reason / error 的失败 reason='unknown', 兜底字符串
 *
 * @param {{status: string, fetchedAt?: number, data?: any}} angle
 * @param {number} [now=Date.now()]
 * @returns {"ok"|"partial"|"stale"|"failed"}
 */
export function deriveAngleStatus(angle, now = Date.now()) {
  if (!angle) return HEALTH_STATUS.FAILED;
  if (angle.status === "failed") return HEALTH_STATUS.FAILED;
  if (!angle.data || (typeof angle.data === "object" && Object.keys(angle.data).length === 0)) {
    return HEALTH_STATUS.PARTIAL;
  }
  if (typeof angle.fetchedAt === "number" && now - angle.fetchedAt > STALE_MS) {
    return HEALTH_STATUS.STALE;
  }
  return HEALTH_STATUS.OK;
}

/**
 * 把 perAngle 的 reason + error 翻译成人话.
 * 缺 reason → 'missing'; 缺 error → 不附加冒号.
 * @param {{reason?: string|null, error?: string|null}} angle
 * @returns {string}
 */
export function failureReasonText(angle) {
  const r = (angle && angle.reason) || "unknown";
  const base = HEALTH_REASON_TEXT[r] || r;
  if (angle && angle.error) {
    return `${base}: ${angle.error}`;
  }
  return base;
}
