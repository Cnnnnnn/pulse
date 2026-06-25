/**
 * src/renderer/worldcup/WorldcupScorersView.jsx
 *
 * 射手榜 tab
 */

import { worldcupMatches } from './store.js';
import {
  buildScorersLeaderboard,
  filterScorersLeaderboard,
} from './scorers-leaderboard.js';
import { TeamFlag } from '../components/icons.jsx';

export function WorldcupScorersView({ search = '' }) {
  const matches = worldcupMatches.value?.matches || [];
  const all = buildScorersLeaderboard(matches);
  const rows = filterScorersLeaderboard(all, search);

  if (all.length === 0) {
    return (
      <div class="worldcup-scorers-view worldcup-empty">
        <p>暂无进球数据</p>
        <p class="hint">完赛或进行中的比赛会在刷新比分后更新射手榜</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div class="worldcup-scorers-view worldcup-empty">
        <p>未匹配 "{search}"</p>
      </div>
    );
  }

  return (
    <div class="worldcup-scorers-view">
      <header class="worldcup-scorers-head">
        <h3 class="worldcup-scorers-title">射手榜</h3>
        <span class="worldcup-scorers-meta">{all.length} 名球员 · 按进球数排序</span>
      </header>
      <div class="worldcup-scorers-table" role="table" aria-label="射手榜">
        <div class="worldcup-scorers-row worldcup-scorers-row-head" role="row">
          <span class="worldcup-scorers-col-rank" role="columnheader">#</span>
          <span class="worldcup-scorers-col-player" role="columnheader">球员</span>
          <span class="worldcup-scorers-col-team" role="columnheader">球队</span>
          <span class="worldcup-scorers-col-goals" role="columnheader">进球</span>
        </div>
        {rows.map((r) => (
          <div class="worldcup-scorers-row" role="row" key={`${r.teamName}-${r.player}`}>
            <span class="worldcup-scorers-col-rank" role="cell">
              <span class={`worldcup-scorers-rank${r.rank <= 3 ? ` worldcup-scorers-rank-top${r.rank}` : ''}`}>
                {r.rank}
              </span>
            </span>
            <span class="worldcup-scorers-col-player" role="cell">
              <span class="worldcup-scorers-player-cn">{r.playerCn || r.player}</span>
              {r.playerCn && r.playerCn !== r.player && (
                <span class="worldcup-scorers-player-en">{r.player}</span>
              )}
            </span>
            <span class="worldcup-scorers-col-team" role="cell">
              {r.flag && <span class="worldcup-scorers-team-flag"><TeamFlag code={r.flag} size={12} /></span>}
              <span>{r.teamCn}</span>
            </span>
            <span class="worldcup-scorers-col-goals" role="cell">
              <span class="worldcup-scorers-goals">{r.goals}</span>
              {r.penalties > 0 && (
                <span class="worldcup-scorers-pen" title={`含 ${r.penalties} 个点球`}>
                  ({r.penalties}P)
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default WorldcupScorersView;
