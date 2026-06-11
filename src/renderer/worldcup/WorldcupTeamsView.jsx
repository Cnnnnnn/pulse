/**
 * src/renderer/worldcup/WorldcupTeamsView.jsx
 *
 * v2.9.5 — 球队列表 (中文 + 弹 SquadModal)
 *
 * 12 group × 4 队 = 48 队, 列表按 group 排序.
 * 搜索框 (WorldcupHeader 传下来) 过滤 队名 / 中文 / 国旗.
 * 点 team card → 弹 SquadModal (传 1 虚拟 match, 1 队对 1 队 自身).
 */

import { listTeams, lookupTeam } from './teams-data.js';

function posCn(pos) {
  return { GK: '门将', DF: '后卫', MF: '中场', FW: '前锋' }[pos] || pos;
}

export function WorldcupTeamsView({ search = '', onTeamClick }) {
  const teams = listTeams();
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
            {grouped[g].map((t) => {
              const realCount = (t.squad || []).filter((p) => !p.name.startsWith('TBD-')).length;
              return (
                <button
                  key={t.name}
                  class="worldcup-team-card"
                  onClick={() => onTeamClick && onTeamClick(t)}
                  title={`${t.cn} (${t.name}) 大名单`}
                >
                  <span class="worldcup-team-flag">{t.flag}</span>
                  <div class="worldcup-team-info">
                    <div class="worldcup-team-cn">{t.cn}</div>
                    <div class="worldcup-team-en">{t.name}</div>
                  </div>
                  <div class="worldcup-team-fam">
                    <div class="worldcup-team-fam-pos">{posCn(t.famous[0].position)}</div>
                    <div class="worldcup-team-fam-name">{t.famous[0].name}</div>
                  </div>
                  <div class="worldcup-team-squad-count">
                    26 大名单 · {realCount} 已知
                  </div>
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
