/**
 * src/renderer/worldcup/WorldcupTeamsView.jsx
 *
 * v2.9.5 — 球队列表 (中文 + 弹 SquadModal)
 *
 * 12 group × 4 队 = 48 队; 组内按积分 → 净胜球排序.
 * 搜索框 (WorldcupHeader 传下来) 过滤 队名 / 中文 / 国旗.
 * 点 team card → 弹 SquadModal (传 1 虚拟 match, 1 队对 1 队 自身).
 */

import { listTeams } from './teams-data.js';
import { worldcupMatches } from './store.js';
import {
  computeGroupStandings,
  sortTeamsInGroup,
  formatGoalDiff,
} from './group-standings.js';

export function WorldcupTeamsView({ search = '', onTeamClick }) {
  const teams = listTeams();
  const matches = worldcupMatches.value?.matches || [];
  const standings = computeGroupStandings(matches, teams);
  const q = search.toLowerCase();
  const filtered = q
    ? teams.filter((t) => (
        t.name.toLowerCase().includes(q) ||
        t.cn.includes(q) ||
        t.flag.includes(q) ||
        t.group.toLowerCase().includes(q)
      ))
    : teams;

  // 按 group group
  const grouped = {};
  for (const t of filtered) {
    if (!grouped[t.group]) grouped[t.group] = [];
    grouped[t.group].push(t);
  }
  const groupKeys = Object.keys(grouped).sort();

  if (filtered.length === 0) {
    return (
      <div class="worldcup-teams-view worldcup-empty">
        <p>未匹配 "{search}"</p>
      </div>
    );
  }

  return (
    <div class="worldcup-teams-view">
      {groupKeys.map((g) => (
        <section key={g} class="worldcup-group-section">
          <header class="worldcup-group-header">
            <span class="worldcup-group-letter">{g} 组</span>
            <span class="worldcup-group-count">{grouped[g].length} 支球队</span>
          </header>
          <div class="worldcup-teams-grid">
            {sortTeamsInGroup(grouped[g], standings, g).map((t, idx) => {
              const stat = standings[g]?.[t.name];
              const pts = stat ? stat.pts : 0;
              const gd = stat ? stat.gd : 0;
              return (
              <button
                key={t.name}
                class="worldcup-team-card"
                onClick={() => onTeamClick && onTeamClick(t)}
                title={`${t.cn} (${t.name}) · ${pts} 分 · 净胜球 ${formatGoalDiff(gd)}`}
              >
                <span class="worldcup-team-rank">{idx + 1}</span>
                <span class="worldcup-team-flag">{t.flag}</span>
                <span class="worldcup-team-cn">{t.cn}</span>
                <span class="worldcup-team-standings">
                  <span class="worldcup-team-pts">{pts}<small>分</small></span>
                  <span class={`worldcup-team-gd${gd > 0 ? ' worldcup-team-gd--pos' : gd < 0 ? ' worldcup-team-gd--neg' : ''}`}>
                    净胜球 {formatGoalDiff(gd)}
                  </span>
                </span>
              </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default WorldcupTeamsView;
