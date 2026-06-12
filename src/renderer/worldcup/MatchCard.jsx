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
import { displayTeam } from './teams-data.js';
import { toBeijingTime } from './timeUtils.js';
import MatchScorers from './MatchScorers.jsx';
import MatchCardAi from './MatchCardAi.jsx';

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
  return displayTeam(name).cn;
}

function teamFlag(name) {
  return displayTeam(name).flag;
}

function formatBjDisplay(bj, matchDate) {
  if (!bj.time) return '';
  const crossDay = bj.date && matchDate && bj.date !== matchDate;
  const dateLabel = crossDay
    ? `${bj.date.slice(5).replace('-', '月')}日 `
    : '';
  return `🕒 ${dateLabel}${bj.time} 北京时间 (原 ${bj.originalTime})`;
}

function MatchCard({ match, onClick }) {
  if (!match) return null;
  const { team1, team2, venue, time, timezone, score, stage } = match;
  const hasScore = score && (score.ft || score.et || score.pen);
  const isLive = score && score.status === 'live';
  const isFinal = hasScore && !isLive;
  const ft = hasScore ? (score.ft || [0, 0]) : null;

  // 北京时间 (显示用) + 原始时间 (灰显)
  const bj = toBeijingTime(time, timezone, match.date);

  const cardClass = [
    'match-card',
    isLive ? 'match-card--live' : '',
    isFinal ? 'match-card--final' : '',
  ].filter(Boolean).join(' ');

  return (
    <div class={cardClass}>
      <div
        class="match-card-main"
        role="button"
        tabIndex={0}
        onClick={() => onClick && onClick(match)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick && onClick(match);
          }
        }}
        title="点看 2 队大名单"
      >
      <div class="match-card-tags">
        <span class="match-card-stage">{stageCn(stage)}</span>
        {isLive && (
          <span class="match-card-live">{score.clock ? `${score.clock}` : '进行中'}</span>
        )}
        {isFinal && <span class="match-card-final">完赛</span>}
      </div>
      <div class="match-card-row">
        <div class="match-team match-team-left" title={team1}>
          <span class="match-team-flag">{teamFlag(team1)}</span>
          <span class="match-team-name">{teamNameCn(team1)}</span>
        </div>
        {hasScore ? (
          <div class={`match-score match-score--${isLive ? 'live' : 'final'}`}>
            <span class="match-score-num">{ft[0]}</span>
            <span class="match-score-sep">-</span>
            <span class="match-score-num">{ft[1]}</span>
          </div>
        ) : (
          <div class="match-center">对</div>
        )}
        <div class="match-team match-team-right" title={team2}>
          <span class="match-team-name">{teamNameCn(team2)}</span>
          <span class="match-team-flag">{teamFlag(team2)}</span>
        </div>
      </div>
      {hasScore && score.scorers && score.scorers.length > 0 && (
        <MatchScorers
          scorers={score.scorers}
          team1={team1}
          team2={team2}
          compact
        />
      )}
      <div class="match-meta">
        {bj.time && (
          <span class="match-time" title={`当地 ${bj.originalTime} · ${match.date || ''}`}>
            {formatBjDisplay(bj, match.date)}
          </span>
        )}
        <span class="match-venue-sep"> · </span>
        <span class="match-venue" title={venue}>{venue || '—'}</span>
      </div>
      </div>
      <MatchCardAi match={match} score={score} />
    </div>
  );
}

export default memo(MatchCard);
