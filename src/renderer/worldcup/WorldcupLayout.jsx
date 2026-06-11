/**
 * src/renderer/worldcup/WorldcupLayout.jsx
 *
 * v2.9.1 — 抽 [世界杯] tab 自己的 layout 容器 (完全独立)
 *
 * 顶部: WorldcupHeader (品牌 + 切 [赛程] / [球队] + 搜索框)
 * main:  WorldcupView (赛程, section by day) | WorldcupTeamsView (球队, 待 v2.9.2)
 *
 * 跟 VersionsLayout 完全独立: 0 共享 view / store / signal (除 navStore 2 signal)
 */

import { useState } from 'preact/hooks';
import { WorldcupView } from './WorldcupView.jsx';
import { WorldcupTeamsView } from './WorldcupTeamsView.jsx';
import { WorldcupHeader } from './WorldcupHeader.jsx';

export const WC_SUBTABS = [
  { key: 'fixtures', label: '赛程', icon: '📅' },
  { key: 'teams', label: '球队', icon: '👥' },
];

export function WorldcupLayout() {
  const [subTab, setSubTab] = useState('fixtures');
  const [search, setSearch] = useState('');
  const [squadMatch, setSquadMatch] = useState(null);
  const [teamSquad, setTeamSquad] = useState(null);

  function handleTeamClick(team) {
    // 1 队对 1 队 自身 虚拟 match (Stage = 球队, VS 自己也行)
    setTeamSquad({
      team1: team.name,
      team2: team.name,  // 自己 vs 自己
      stage: `${team.cn} 大名单`,
      venue: 'FIFA 2026 报名',
      time: '',
      timezone: '',
      date: '',
      _isTeam: true,
    });
  }

  return (
    <div class="worldcup-layout">
      <WorldcupHeader
        subTab={subTab}
        subTabs={WC_SUBTABS}
        onSubTabChange={setSubTab}
        search={search}
        onSearchChange={setSearch}
      />
      <div class="worldcup-layout-main">
        {subTab === 'teams' ? (
          <WorldcupTeamsView search={search} onTeamClick={handleTeamClick} />
        ) : (
          <WorldcupView search={search} squadMatch={squadMatch} setSquadMatch={setSquadMatch} />
        )}
        {teamSquad && (
          <SquadModal match={teamSquad} onClose={() => setTeamSquad(null)} />
        )}
      </div>
    </div>
  );
}

export default WorldcupLayout;
