/**
 * src/renderer/worldcup/WorldcupScorersView.jsx
 *
 * 射手榜 tab — 支持 小组赛 / 淘汰赛 / 全部 三个 stage filter
 */

import { useState } from 'preact/hooks';
import { worldcupMatches } from './store.js';
import { worldcupBracket } from './bracketStore.js';
import {
  buildScorersLeaderboard,
  filterScorersLeaderboard,
  flattenBracketMatches,
} from './scorers-leaderboard.js';
import { TeamFlag } from '../components/icons.jsx';

// ponytail: 阶段过滤 tab 状态. 小组赛 (group) / 淘汰赛 (knockout) / 全部 (all).
// 不持久化, 切 tab 重置为 group.
export function WorldcupScorersView({ search = '' }) {
  const [stageFilter, setStageFilter] = useState('group');

  const groupMatches = worldcupMatches.value?.matches || [];
  const bracketSnapshot = worldcupBracket.value;
  const bracketMatches = flattenBracketMatches(bracketSnapshot);

  const selectedMatches =
    stageFilter === 'group' ? groupMatches
    : stageFilter === 'knockout' ? bracketMatches
    : [...groupMatches, ...bracketMatches];

  const all = buildScorersLeaderboard(selectedMatches);
  const rows = filterScorersLeaderboard(all, search);

  const counts = {
    group: buildScorersLeaderboard(groupMatches).length,
    knockout: buildScorersLeaderboard(bracketMatches).length,
    all: buildScorersLeaderboard([...groupMatches, ...bracketMatches]).length,
  };

  if (all.length === 0) {
    return (
      <div class="worldcup-scorers-view worldcup-empty">
        <ScorersFilterTabs stageFilter={stageFilter} setStageFilter={setStageFilter} counts={counts} />
        <p>暂无进球数据</p>
        <p class="hint">完赛或进行中的比赛会在刷新比分后更新射手榜</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div class="worldcup-scorers-view worldcup-empty">
        <ScorersFilterTabs stageFilter={stageFilter} setStageFilter={setStageFilter} counts={counts} />
        <p>未匹配 "{search}"</p>
      </div>
    );
  }

  return (
    <div class="worldcup-scorers-view">
      <ScorersFilterTabs stageFilter={stageFilter} setStageFilter={setStageFilter} counts={counts} />
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

function ScorersFilterTabs({ stageFilter, setStageFilter, counts }) {
  return (
    <div class="worldcup-scorers-filters" role="tablist" aria-label="射手榜阶段过滤">
      {[
        { id: 'group', label: '小组赛' },
        { id: 'knockout', label: '淘汰赛' },
        { id: 'all', label: '全部' },
      ].map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={stageFilter === t.id}
          class={`worldcup-scorers-filter-tab ${stageFilter === t.id ? 'is-active' : ''}`}
          onClick={() => setStageFilter(t.id)}
        >
          {t.label} ({counts[t.id]})
        </button>
      ))}
    </div>
  );
}

export default WorldcupScorersView;
