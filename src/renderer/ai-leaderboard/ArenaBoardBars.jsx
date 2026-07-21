/**
 * src/renderer/ai-leaderboard/ArenaBoardBars.jsx
 *
 * 跨 board ELO 迷你条（纯展示，无副作用）。
 * 展示模型参与的所有 Arena board 的 ELO 成绩，宽度按固定域 [ELO_MIN, ELO_MAX]
 * 归一，使不同 board / 不同模型之间可横向比较（回应「Arena 单 board 数据稀疏」）。
 */

import { ARENA_BOARDS, ARENA_BOARD_KEYS } from "./types.js";
import { fmtScore } from "./format.js";

// ELO 经验域：Arena 各 board 大致落在 1000~1700，用固定域保证跨 board 可比。
const ELO_MIN = 1000;
const ELO_MAX = 1700;

/**
 * @param {{model?: object}} props
 */
export function ArenaBoardBars({ model }) {
  const m = model || {};
  const present = ARENA_BOARD_KEYS.map((k) => {
    const meta = ARENA_BOARDS[k];
    const slice = m.arena && m.arena[meta.key];
    return slice && typeof slice.score === "number" ? { k, meta, slice } : null;
  }).filter(Boolean);

  if (present.length === 0) return null;

  return (
    <div class="ai-lb-boardbars">
      {present.map(({ k, meta, slice }) => {
        const pct = Math.max(
          3,
          Math.min(100, ((slice.score - ELO_MIN) / (ELO_MAX - ELO_MIN)) * 100),
        );
        const voteNote =
          slice.votes != null ? ` · ${slice.votes.toLocaleString()} 票` : "";
        return (
          <div
            class="ai-lb-boardbars__row"
            key={k}
            title={`${meta.label}：${fmtScore(slice.score)} ELO${voteNote}`}
          >
            <span class="ai-lb-boardbars__label">{meta.label}</span>
            <span class="ai-lb-boardbars__bar" aria-hidden="true">
              <i style={{ width: pct + "%" }} />
            </span>
            <span class="ai-lb-boardbars__val">{fmtScore(slice.score)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default ArenaBoardBars;
