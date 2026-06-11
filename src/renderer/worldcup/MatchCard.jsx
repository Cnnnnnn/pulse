/**
 * src/renderer/worldcup/MatchCard.jsx
 *
 * v2.9.5 — 赛 card 中文版
 *
 * 形态 (重排):
 *   - 顶 row: [阶段] [组别] (居中 tag)
 *   - 中 row: [flag] 队1中文名   对 / 比分   队2中文名 [flag]
 *   - 底 row: 🕒 北京时间 · 场址
 *   - 整 card 可点 → 弹 SquadModal
 *
 * 中文: 队名走 lookupTeam(team).cn, 组别走 `${groupCn}组`, 阶段走 stageMap
 */

import { memo } from 'preact/compat';
import { lookupTeam } from './teams-data.js';
import { toBeijingTime } from './timeUtils.js';

// TXT 阶段 → 中文
const STAGE_CN = {
  'Group': '小组赛',
  'Group A': '小组赛',
  'Round of 16': '1/8 决赛',
  'Quarter-final': '1/4 决赛',
  'Semi-final': '半决赛',
  'Third Place': '季军赛',
  'Final': '决赛',
};

function stageCn(stage) {
  if (!stage) return '';
  // match.stage 含 group letter (e.g. "Group A" = "A 组")
  const m = stage.match(/^Group\s+([A-L])$/i);
  if (m) return `${m[1].toUpperCase()} 组`;
  return STAGE_CN[stage] || stage;
}

function teamNameCn(name) {
  if (!name) return '—';
  const t = lookupTeam(name);
  return t ? t.cn : name;
}

function teamFlag(name) {
  if (!name) return '';
  const t = lookupTeam(name);
  return t ? t.flag : '';
}

function MatchCard({ match, onClick }) {
  if (!match) return null;
  const { team1, team2, venue, time, timezone, score, stage } = match;
  const hasScore = score && (score.ft || score.et || score.pen);
  const center = hasScore
    ? (() => {
        const ft = score.ft || [0, 0];
        return `${ft[0]} - ${ft[1]}`;
      })()
    : '对';

  // 北京时间 (显示用) + 原始时间 (灰显)
  const bj = toBeijingTime(time, timezone, match.date);

  return (
    <button
      class="match-card"
      onClick={() => onClick && onClick(match)}
      title="点看 2 队大名单"
    >
      <div class="match-card-tags">
        <span class="match-card-stage">{stageCn(stage)}</span>
      </div>
      <div class="match-card-row">
        <div class="match-team match-team-left" title={team1}>
          <span class="match-team-flag">{teamFlag(team1)}</span>
          <span class="match-team-name">{teamNameCn(team1)}</span>
        </div>
        <div class={`match-center${hasScore ? ' match-center-score' : ''}`}>
          {center}
        </div>
        <div class="match-team match-team-right" title={team2}>
          <span class="match-team-name">{teamNameCn(team2)}</span>
          <span class="match-team-flag">{teamFlag(team2)}</span>
        </div>
      </div>
      <div class="match-meta">
        {bj.time && (
          <span class="match-time" title={`本地 ${bj.originalTime}`}>
            🕒 {bj.time} (北京时间, 原 {bj.originalTime})
          </span>
        )}
        <span class="match-venue-sep"> · </span>
        <span class="match-venue" title={venue}>{venue || '—'}</span>
      </div>
    </button>
  );
}

export default memo(MatchCard);
