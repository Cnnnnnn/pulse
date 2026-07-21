/**
 * src/renderer/ai-leaderboard/EloPerDollar.jsx
 *
 * ELO per $（性价比排名）：横向条形排行。
 * 把厂商「最佳 Arena ELO」除以「最低 AA 输出价」，越高代表花一美元能买到的竞技水平越多（越划算）。
 *
 * 纯渲染层：仅依赖 props（rows 已排名数组 + focusSet 选中厂商集合），
 * 与 CrossSourceRadar 共用同一套 VENDOR_COLORS 色板与 focus 高亮范式。
 * 颜色仅 oklch / var / color-mix，数字统一 tabular-nums。
 */

import { fmtVendor, fmtScore, fmtPricePer1M } from "./format.js";

// 厂商 → 颜色（与 CrossSourceRadar / ValueScatter / ArenaBubbleChart 同一套色板）
const VENDOR_COLORS = {
  openai: "oklch(60% 0.18 150)",
  anthropic: "oklch(60% 0.16 25)",
  google: "oklch(60% 0.16 245)",
  meta: "oklch(60% 0.16 270)",
  mistral: "oklch(60% 0.16 200)",
  xai: "oklch(60% 0.16 320)",
  deepseek: "oklch(60% 0.16 195)",
  qwen: "oklch(60% 0.16 130)",
  zhipu: "oklch(60% 0.16 160)",
  bytedance: "oklch(60% 0.16 50)",
  minimax: "oklch(60% 0.16 290)",
  xiaomi: "oklch(60% 0.16 80)",
  moonshot: "oklch(60% 0.16 220)",
};
const DEFAULT_COLOR = "oklch(55% 0.05 250)";

const vendorColor = (vendor) => VENDOR_COLORS[vendor] || DEFAULT_COLOR;

function fmtEpd(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("en-US");
}

/**
 * @param {Array<{vendor:string, eloPerDollar:number, arena:number, priceOut:number}>} rows 降序排名
 * @param {Set<string>} focusSet 选中模型所属厂商（高亮）
 */
export function EloPerDollar({ rows = [], focusSet = new Set() }) {
  if (!rows.length) {
    return (
      <p class="ai-lb-drawer__hint">
        暂无可用数据：需要厂商同时具备 Arena ELO 与 AA 输出价。
      </p>
    );
  }
  const max = rows[0].eloPerDollar; // 已降序，rows[0] 最大
  return (
    <div class="ai-lb-epd">
      <ol class="ai-lb-epd__list">
        {rows.map((r, i) => {
          const isFocus = focusSet.has(r.vendor);
          const pct = max > 0 ? Math.max(2, (r.eloPerDollar / max) * 100) : 0;
          const color = vendorColor(r.vendor);
          return (
            <li key={r.vendor} class={`ai-lb-epd__row${isFocus ? " is-focus" : ""}`}>
              <div class="ai-lb-epd__head">
                <span class="ai-lb-epd__rank">{i + 1}</span>
                <span class="ai-lb-epd__name">{fmtVendor(r.vendor)}</span>
                <span class="ai-lb-epd__val">{fmtEpd(r.eloPerDollar)}</span>
              </div>
              <div class="ai-lb-epd__track">
                <div
                  class="ai-lb-epd__bar"
                  style={`--epd-color:${color};width:${pct}%;`}
                />
              </div>
              <div class="ai-lb-epd__meta">
                ELO {fmtScore(r.arena)} · 输出价 {fmtPricePer1M(r.priceOut)}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default EloPerDollar;
