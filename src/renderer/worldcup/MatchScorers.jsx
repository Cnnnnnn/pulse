/**
 * src/renderer/worldcup/MatchScorers.jsx
 *
 * 进球者列表 (ESPN scoringPlays)
 */

import { displayTeam } from './teams-data.js';
import { TeamFlag, IconFootball } from '../components/icons.jsx';
import { resolvePlayerCnByName } from './player-cn.js';

function formatScorer(s) {
  const cn = resolvePlayerCnByName(s.player);
  const name = cn ? `${cn}` : s.player;
  const tags = [];
  if (s.ownGoal) tags.push('乌龙');
  if (s.penalty) tags.push('点球');
  const tag = tags.length ? ` (${tags.join('·')})` : '';
  const minute = s.minute || '';
  return `${minute} ${name}${tag}`.trim();
}

export function MatchScorers({ scorers, team1, team2, compact = false }) {
  if (!Array.isArray(scorers) || scorers.length === 0) return null;

  const t1 = displayTeam(team1);
  const t2 = displayTeam(team2);
  const t1Scorers = scorers.filter((s) => s.teamSide === 'team1');
  const t2Scorers = scorers.filter((s) => s.teamSide === 'team2');

  if (compact) {
    return (
      <div class="match-scorers match-scorers--compact">
        {scorers.map((s, i) => (
          <span key={`${s.minute}-${s.player}-${i}`} class="match-scorer-chip">
            <IconFootball size={12} /> {formatScorer(s)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div class="match-scorers">
      {t1Scorers.length > 0 && (
        <div class="match-scorers-side">
          <span class="match-scorers-team">
            <TeamFlag code={t1.flag} size={12} /> {t1.cn}
          </span>
          <ul class="match-scorers-list">
            {t1Scorers.map((s, i) => (
              <li key={`t1-${i}`}>{formatScorer(s)}</li>
            ))}
          </ul>
        </div>
      )}
      {t2Scorers.length > 0 && (
        <div class="match-scorers-side">
          <span class="match-scorers-team">
            <TeamFlag code={t2.flag} size={12} /> {t2.cn}
          </span>
          <ul class="match-scorers-list">
            {t2Scorers.map((s, i) => (
              <li key={`t2-${i}`}>{formatScorer(s)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default MatchScorers;
