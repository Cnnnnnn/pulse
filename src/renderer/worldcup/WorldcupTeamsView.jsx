/**
 * src/renderer/worldcup/WorldcupTeamsView.jsx
 *
 * v2.9.2 — 球队列表实装
 *
 * 12 group × 4 队 = 48 队, 列表按 group 排序.
 * 搜索框 (WorldcupHeader 传下来) 过滤 队名 / 中文 / 国旗.
 * 点 team card 弹 SquadModal (v2.9.3 才实装, 现在 placeholder).
 */

import { listTeams } from './teams-data.js';

export function WorldcupTeamsView({ search = '' }) {
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
            <span class="worldcup-group-letter">Group {g}</span>
            <span class="worldcup-group-count">{grouped[g].length} 队</span>
          </header>
          <div class="worldcup-teams-grid">
            {grouped[g].map((t) => (
              <button
                key={t.name}
                class="worldcup-team-card"
                onClick={() => { /* v2.9.3 弹 SquadModal */ }}
                title={`${t.cn} (${t.name})`}
              >
                <span class="worldcup-team-flag">{t.flag}</span>
                <div class="worldcup-team-info">
                  <div class="worldcup-team-cn">{t.cn}</div>
                  <div class="worldcup-team-en">{t.name}</div>
                </div>
                <div class="worldcup-team-fam">
                  <div class="worldcup-team-fam-pos">{t.famous[0].position}</div>
                  <div class="worldcup-team-fam-name">{t.famous[0].name}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default WorldcupTeamsView;
