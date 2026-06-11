/**
 * src/renderer/worldcup/MatchCard.jsx
 *
 * v2.9.0 世界杯专栏 — 1 场赛事 card (你拍 card_minimal)
 *
 * 极简: 左 队1 / 中 VS 或 比分 / 右 队2 / 下面 北京时间 + 场址
 * 不点 / 不倒计时 / 不实时 (跟 spec §9 不做的 7 项一致)
 */

import { memo } from 'preact/compat';

function formatTimeBeijing(time, tz) {
  if (!time) return '';
  // TXT 给的是 UTC-XX (e.g. UTC-6), 简单显示 "13:00 UTC-6"
  // 不算时区转换, 跟 spec §1 一致: 保持数据源原貌
  return tz ? `${time} ${tz}` : time;
}

function MatchCard({ match }) {
  if (!match) return null;
  const { team1, team2, venue, time, timezone, score } = match;
  const hasScore = score && (score.ft || score.et || score.pen);
  const center = hasScore
    ? (() => {
        const ft = score.ft || [0, 0];
        return `${ft[0]} - ${ft[1]}`;
      })()
    : 'VS';

  return (
    <div class="match-card">
      <div class="match-card-row">
        <div class="match-team match-team-left" title={team1}>
          {team1 || '—'}
        </div>
        <div class={`match-center${hasScore ? ' match-center-score' : ''}`}>
          {center}
        </div>
        <div class="match-team match-team-right" title={team2}>
          {team2 || '—'}
        </div>
      </div>
      <div class="match-meta">
        <span class="match-time">{formatTimeBeijing(time, timezone)}</span>
        <span class="match-venue-sep"> · </span>
        <span class="match-venue" title={venue}>{venue || '—'}</span>
      </div>
    </div>
  );
}

export default memo(MatchCard);
