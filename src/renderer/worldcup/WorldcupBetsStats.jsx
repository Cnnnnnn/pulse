/**
 * src/renderer/worldcup/WorldcupBetsStats.jsx
 *
 * v2.10.0 顶部 stats card — 总投入 / 总盈亏 / 已填 / 未填 / 盈亏率
 */
import { worldcupBets, betsLoaded, computeBetsStats } from "./betsStore.js";

function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}¥${Math.abs(Math.round(n * 100) / 100)}`;
}

function fmtRoi(roi) {
  if (roi == null) return "—";
  const pct = (roi * 100).toFixed(1);
  return (roi >= 0 ? "+" : "") + pct + "%";
}

export function WorldcupBetsStats({ allDates = [] }) {
  const loaded = betsLoaded.value;
  if (!loaded) return null;
  const stats = computeBetsStats(worldcupBets.value, allDates);
  // filled=0 时整张卡不渲染 (用户还没开始填, 4 个 0 没价值)
  if (stats.filled === 0) return null;

  const pnlClass = stats.totalPnl >= 0 ? "positive" : "negative";
  return (
    <div class="worldcup-bets-stats">
      <div class="worldcup-bets-stat">
        <div class="worldcup-bets-stat-label">总投入</div>
        <div class="worldcup-bets-stat-value">{fmtMoney(stats.totalStake)}</div>
      </div>
      <div class="worldcup-bets-stat">
        <div class="worldcup-bets-stat-label">总盈亏</div>
        <div
          class={`worldcup-bets-stat-value worldcup-bets-stat-pnl ${pnlClass}`}
        >
          {fmtMoney(stats.totalPnl)}
        </div>
      </div>
      <div class="worldcup-bets-stat">
        <div class="worldcup-bets-stat-label">已填 / 未填</div>
        <div class="worldcup-bets-stat-value">
          {stats.filled} / {stats.unfilled}
        </div>
      </div>
      <div class="worldcup-bets-stat">
        <div class="worldcup-bets-stat-label">盈亏率</div>
        <div class={`worldcup-bets-stat-value ${pnlClass}`}>
          {fmtRoi(stats.roi)}
        </div>
      </div>
    </div>
  );
}
