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

import { useEffect, useState } from 'preact/hooks';
import { WorldcupView } from './WorldcupView.jsx';
import { WorldcupTeamsView } from './WorldcupTeamsView.jsx';
import { WorldcupScorersView } from './WorldcupScorersView.jsx';
import { WorldcupBracketView } from './WorldcupBracketView.jsx';
import { WorldcupHeader } from './WorldcupHeader.jsx';
import SquadModal from './SquadModal.jsx';
import {
  bootstrapWorldcupTab,
  refreshWorldcupScores,
  subscribeScoresUpdates,
  worldcupScoresLoading,
} from './store.js';
import { tryAutoRecompute } from './bracketStore.js';

export const WC_SUBTABS = [
  { key: 'fixtures', label: '赛程' },
  { key: 'teams', label: '球队' },
  { key: 'scorers', label: '进球榜' },
  { key: 'bracket', label: '对阵' },
];

export function WorldcupLayout() {
  const [subTab, setSubTab] = useState('fixtures');
  const [search, setSearch] = useState('');
  const [teamSquad, setTeamSquad] = useState(null);
  const [focusMatchKey, setFocusMatchKey] = useState(null);

  function handleSubTabChange(tab) {
    setSubTab(tab);
    // 切子 tab 时关球队大名单弹窗，避免 modal-backdrop 挡住赛程区
    setTeamSquad(null);
  }

  useEffect(() => {
    bootstrapWorldcupTab();
  }, []);

  useEffect(() => {
    if (typeof window.api?.onWorldcupFocusMatch !== "function") return;
    const off = window.api.onWorldcupFocusMatch(({ matchKey }) => {
      if (!matchKey) return;
      setSubTab("fixtures");
      setFocusMatchKey(matchKey);
    });
    return () => { if (typeof off === "function") off(); };
  }, []);

  // v2.51: 订阅 main 进程比分推送 + 60s 轮询兜底.
  // 推送: goal-watcher sweep 完立刻 fire (实时性).
  // 轮询: 防推送丢失 (窗口刚聚焦 / 推送时机错过) 的保底定期拉.
  // 两者互补, 都调 refreshWorldcupScores (内部幂等, 重复拉无害).
  // onUpdated: 比分刷新后触发 bracket 自动重算 (30s 节流, 仅在用户进过对阵 tab 时).
  useEffect(() => {
    const unsubscribe = subscribeScoresUpdates({
      onUpdated: () => tryAutoRecompute(),
    });
    const pollTimer = setInterval(() => {
      refreshWorldcupScores();
    }, 60_000);
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
      clearInterval(pollTimer);
    };
  }, []);

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
        onSubTabChange={handleSubTabChange}
        search={search}
        onSearchChange={setSearch}
        onRefreshScores={() => refreshWorldcupScores()}
        scoresLoading={worldcupScoresLoading.value}
      />
      <div class="worldcup-layout-main">
        {subTab === 'teams' ? (
          <WorldcupTeamsView search={search} onTeamClick={handleTeamClick} />
        ) : subTab === 'scorers' ? (
          <WorldcupScorersView search={search} />
        ) : subTab === 'bracket' ? (
          <WorldcupBracketView />
        ) : (
          <WorldcupView
            search={search}
            focusMatchKey={focusMatchKey}
            onFocusMatchConsumed={() => setFocusMatchKey(null)}
          />
        )}
        {teamSquad && (
          <SquadModal match={teamSquad} onClose={() => setTeamSquad(null)} />
        )}
      </div>
    </div>
  );
}

export default WorldcupLayout;
