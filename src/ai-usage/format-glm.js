/**
 * src/ai-usage/format-glm.js
 *
 * GLM 用量展示专用纯函数格式化.
 * 跟 derive.js 同级, 都是 provider 无关数学派生 / GLM 特化展示之间的一层.
 *
 * 为什么单独抽:
 * - GLM 的 token 配额动辄亿级 (5h 总额 8 亿), 渲染裸数字 "672305536" 不可读.
 * - GLM 的 MCP 窗口是"时长" (秒), 跟 token 数共用 _buildWindow 同一 schema,
 *   展示层必须按 windowKey === 'mcp' 切到时长格式.
 * - minimax normalize 从不设 level; 只有 GLM 有套餐档 (lite/pro/max), 给个中文映射.
 *
 * 纯函数, 可直接测, 不依赖 Electron / renderer runtime.
 */

/**
 * Token 数 → 中文紧凑单位.
 *   672305536 → "6.72 亿"
 *   127694464 → "1.28 亿"
 *   56789     → "5.7 万"
 *   800       → "800"
 * 规则:
 *   ≥ 1e8  → "X.XX 亿" (向下截断 2 位, 不四舍五入 — 避免展示 "7.00 亿" 这种)
 *   ≥ 1e4  → "X.X 万" (1 位)
 *   < 1e4  → 原样
 * @param {number|null|undefined} n
 * @returns {string|null}
 */
function formatTokens(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  if (n < 1e4) return String(n);
  if (n < 1e8) {
    // 万: 1 位小数, 向下截断避免进位到下一档
    const wan = Math.floor((n / 1e4) * 10) / 10;
    return `${wan} 万`;
  }
  const yi = Math.floor((n / 1e8) * 100) / 100;
  return `${yi} 亿`;
}

/**
 * 秒 → 中文时长 (用于 GLM MCP 时长窗口).
 *   2172 → "36 分"
 *   4000 → "1 小时 6 分"
 *   90   → "1 分"   (秒级向下取整到分)
 *   45   → "45 秒"
 * 规则:
 *   ≥ 3600 → "X 小时 Y 分" (Y=0 省略 → "1 小时")
 *   ≥ 60   → "X 分" (向下取整)
 *   < 60   → "X 秒"
 * @param {number|null|undefined} seconds
 * @returns {string|null}
 */
function formatDuration(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const total = Math.round(seconds);
  if (total < 60) return `${total} 秒`;
  if (total < 3600) {
    const m = Math.floor(total / 60);
    return `${m} 分`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

/**
 * GLM 套餐档中文映射. normalize-glm.js 的 data.level 取值: lite/pro/max.
 * 未知值 fallback 到原值 (不丢信息).
 */
const LEVEL_LABELS = {
  lite: "轻量版",
  pro: "专业版",
  max: "旗舰版",
};

/**
 * 取 level 的中文标签 (glm 专用). 未知 level 返原值.
 * @param {string|null|undefined} level
 * @returns {string|null}
 */
function levelLabel(level) {
  if (typeof level !== "string" || level.length === 0) return null;
  return LEVEL_LABELS[level] || level;
}

module.exports = {
  formatTokens,
  formatDuration,
  LEVEL_LABELS,
  levelLabel,
};
