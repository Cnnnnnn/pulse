/**
 * src/main/tier.js
 *
 * Phase 29: last-opened → tier + 静音推荐.
 *
 * 纯函数, 无 IO. 100% unit-testable.
 *
 * 阈值 (spec §4.2.2):
 *   - hot:     ≤ 7 天  (天天用, 别错过)
 *   - warm:    7-30 天  (中等)
 *   - cold:    > 30 天  (都不怎么开)
 *   - unknown: ms = null  (Spotlight / atime 都没拿到)
 *
 * 推荐映射 (RECOMMENDED):
 *   - hot:     1 天   — 短静音, 不漏重要更新
 *   - warm:    7 天
 *   - cold:    30 天
 *   - unknown: 7 天   (跟 warm 一样)
 *
 * rankMuteOptions:
 *   - 5 个固定选项 (1/7/30/90/永远) 不变 (跟 Phase 27 兼容)
 *   - 按 tier 排: 推荐项置顶 + marked `recommended: true`
 *   - 其它按"短→长"升序, 永远放最后
 */

const HOT_MAX_DAYS = 7;
const WARM_MAX_DAYS = 30;

const TIER = Object.freeze({
  HOT: 'hot',
  WARM: 'warm',
  COLD: 'cold',
  UNKNOWN: 'unknown',
});

const RECOMMENDED = Object.freeze({
  hot: 1 * 86400,
  warm: 7 * 86400,
  cold: 30 * 86400,
  unknown: 7 * 86400,
});

const BASE_OPTIONS = Object.freeze([
  Object.freeze({ seconds: 1 * 86400,  label: '1 天' }),
  Object.freeze({ seconds: 7 * 86400,  label: '7 天' }),
  Object.freeze({ seconds: 30 * 86400, label: '30 天' }),
  Object.freeze({ seconds: 90 * 86400, label: '90 天' }),
  Object.freeze({ seconds: 0,          label: '永远' }),
]);

/**
 * @param {number|null} lastMs  epoch ms
 * @param {number} [now]         注入便于测试, 默认 Date.now()
 * @returns {'hot'|'warm'|'cold'|'unknown'}
 */
function getTier(lastMs, now) {
  if (lastMs == null || typeof lastMs !== 'number') return TIER.UNKNOWN;
  const t = (typeof now === 'number') ? now : Date.now();
  if (t < lastMs) return TIER.UNKNOWN;  // 时钟漂移 / 数据错乱
  const ageDays = (t - lastMs) / 86400_000;
  if (ageDays <= HOT_MAX_DAYS) return TIER.HOT;
  if (ageDays <= WARM_MAX_DAYS) return TIER.WARM;
  return TIER.COLD;
}

/**
 * @param {'hot'|'warm'|'cold'|'unknown'} tier
 * @returns {number} 推荐的静音时长 (秒); 0 = 永远
 */
function recommendedMuteSeconds(tier) {
  return RECOMMENDED[tier] ?? RECOMMENDED.unknown;
}

/**
 * 重排 5 个基础选项, 推荐项置顶, 永远放最后.
 * @param {'hot'|'warm'|'cold'|'unknown'} tier
 * @returns {Array<{seconds:number, label:string, recommended:boolean}>}
 */
function rankMuteOptions(tier) {
  const rec = recommendedMuteSeconds(tier);
  return BASE_OPTIONS.map((o) => ({
    seconds: o.seconds,
    label: o.label,
    recommended: o.seconds === rec,
  })).sort((a, b) => {
    // forever 永远 last
    if (a.seconds === 0) return 1;
    if (b.seconds === 0) return -1;
    // recommended 置顶
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    // 其它按升序
    return a.seconds - b.seconds;
  });
}

module.exports = {
  TIER,
  HOT_MAX_DAYS,
  WARM_MAX_DAYS,
  RECOMMENDED,
  BASE_OPTIONS,
  getTier,
  recommendedMuteSeconds,
  rankMuteOptions,
};
