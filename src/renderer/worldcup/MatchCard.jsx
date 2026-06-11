/**
 * src/renderer/worldcup/MatchCard.jsx
 *
 * v2.9.3 — 赛 card 极简 + 国旗 + 北京时间 + 点进 SquadModal
 *
 * 形态:
 *   - 顶 row: [flag] team1   VS/比分   [flag] team2
 *   - 底 meta: 北京时间 + 场址
 *   - 整 card 可点 → 弹 SquadModal
 */

import { memo } from 'preact/compat';
import { lookupTeam } from './teams-data.js';
import { toBeijingTime } from './timeUtils.js';

function MatchCard({ match, onClick }) {
  if (!match) return null;
  const { team1, team2, venue, time, timezone, score, stage } = match;
  const hasScore = score && (score.ft || score.et || score.pen);
  const center = hasScore
    ? (() => {
        const ft = score.ft || [0, 0];
        return `${ft[0]} - ${ft[1]}`;
      })()
    : 'VS';

  const t1 = lookupTeam(team1);
  const t2 = lookupTeam(team2);

  // 北京时间 (显示用) + 原始时间 (灰显)
  const bj = toBeijingTime(time, timezone, match.date);

  return (
    <button
      class="match-card"
      onClick={() => onClick && onClick(match)}
      title="点看 2 队大名单"
    >
      <div class="match-card-stage">{stage || ''}</div>
      <div class="match-card-row">
        <div class="match-team match-team-left" title={team1}>
          {t1 && <span class="match-team-flag">{t1.flag}</span>}
          <span class="match-team-name">{team1 || '—'}</span>
        </div>
        <div class={`match-center${hasScore ? ' match-center-score' : ''}`}>
          {center}
        </div>
        <div class="match-team match-team-right" title={team2}>
          <span class="match-team-name">{team2 || '—'}</span>
          {t2 && <span class="match-team-flag">{t2.flag}</span>}
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
