/**
 * src/renderer/components/modelColor.js
 *
 * 模型名 → 颜色索引的共享映射.
 * 颜色槽位对应 .ai-usage-dashboard 内定义的 --model-color-1..6
 * (Apple 蓝 / Cursor 紫 / 系统蓝 / 系统绿 / MiniMax 琥珀 / 系统红),
 * 全部引用主站 token, 跨主题一致.
 *
 * 被 UsageDashboard 与 UsageDetailList 共用, 避免重复实现.
 */

/** 已知模型 → 固定颜色槽位 (1-based, 对应 --model-color-N). */
export const MODEL_COLOR_HINTS = {
  "MiniMax-M3-512k": 1,
  "MiniMax-M2.7": 2,
  "MiniMax-M2.7-highspeed": 3,
  "MiniMax-M2.5": 4,
  "coding-plan-vlm": 5,
};

/**
 * 模型名 → 颜色索引 (0-5).
 * 已知模型走固定色, 未知模型用 hash 取模, 保证不重复且稳定.
 * @param {string} modelName
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function modelColorIndex(modelName, fallback = 0) {
  if (typeof modelName !== "string") return fallback;
  if (Object.prototype.hasOwnProperty.call(MODEL_COLOR_HINTS, modelName)) {
    return MODEL_COLOR_HINTS[modelName];
  }
  // 未知模型: 简单 hash 取模
  let h = 0;
  for (let i = 0; i < modelName.length; i++) h = (h * 31 + modelName.charCodeAt(i)) | 0;
  return Math.abs(h) % 6;
}
