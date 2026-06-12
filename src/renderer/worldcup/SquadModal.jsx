/**
 * src/renderer/worldcup/SquadModal.jsx
 *
 * v2.9.5 — 兼容 2 模式:
 *   - 比赛详情 (match._isTeam = false): 2 队 squad 并列, 中 VS / 比分
 *   - 1 队详情 (match._isTeam = true): 单列 26 人 squad (从 队 详情 tab 点 team card 触发)
 *
 * 数据 schema 跟 match.team1/team2/... 通用.
 */

import { useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { lookupTeam, displayTeam } from './teams-data.js';
import { resolvePlayerCn } from './player-cn.js';
import { toBeijingTime } from './timeUtils.js';
import MatchScorers from './MatchScorers.jsx';
import MatchAiPanel from './MatchAiPanel.jsx';

const POS_LABELS = {
  GK: '门将', DF: '后卫', MF: '中场', FW: '前锋',
  TBD: '待定',
};

function SquadModal({ match, onClose }) {
  // ESC 关
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose && onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!match) return null;
  const { team1, team2, stage, venue, time, timezone, score } = match;
  const isTeamMode = match._isTeam === true;
  const t1 = lookupTeam(team1);
  const t2 = isTeamMode ? null : lookupTeam(team2);
  const d1 = displayTeam(team1);
  const d2 = isTeamMode ? null : displayTeam(team2);
  const bj = toBeijingTime(time, timezone, match.date);

  function renderSquad(team) {
    if (!team) {
      return <p class="squad-empty">未匹配</p>;
    }
    const isTBD = (p) => p && typeof p.name === 'string' && p.name.startsWith('TBD-');
    const realCount = (team.squad || []).filter((p) => !isTBD(p)).length;
    const tbdCount = (team.squad || []).filter((p) => isTBD(p)).length;
    return (
      <div class="squad-list">
        <p class="squad-meta-line">
          {team.cn} 大名单 · {realCount} 已知 · {tbdCount} 待定
        </p>
        {(team.squad || []).map((p) => {
          const cn = resolvePlayerCn(p);
          return (
            <div
              key={p.number}
              class={`squad-row${isTBD(p) ? ' squad-row-tbd' : ''}`}
            >
              <span class="squad-num">{p.number}</span>
              <span class="squad-pos">{POS_LABELS[p.position] || p.position}</span>
              <div class="squad-row-names">
                <span class="squad-name-cn">{cn || '—'}</span>
                <span class="squad-name-en">{p.name}</span>
              </div>
              <span class="squad-club" title={p.club}>{p.club}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const modal = (
    <div class="modal-backdrop modal-backdrop-top modal-backdrop-squad" onClick={onClose}>
      <div class={`modal-card modal-squad${isTeamMode ? ' modal-squad-team' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>{stage || (isTeamMode ? '球队详情' : '比赛详情')}</h2>
          <button class="btn-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        {(match.date || bj.time || venue) && (
          <div class="squad-meta">
            {match.date && <span class="squad-meta-date">{match.date} · {bj.weekday || ''}</span>}
            {bj.time && (
              <span class="squad-meta-time">
                🕒
                {bj.date && bj.date !== match.date ? ` ${bj.date} ` : ' '}
                {bj.time} 北京 (原 {bj.originalTime})
              </span>
            )}
            {venue && <span class="squad-meta-venue">📍 {venue}</span>}
          </div>
        )}

        {!isTeamMode && score && score.ft && (
          <div class={`squad-score-banner squad-score-banner--${score.status === 'live' ? 'live' : 'final'}`}>
            <div class="squad-score-side">
              <span class="squad-score-flag">{d1.flag}</span>
              <span class="squad-score-name">{d1.cn}</span>
            </div>
            <div class="squad-score-ft">
              <span class="squad-score-num">{score.ft[0]}</span>
              <span class="squad-score-sep">-</span>
              <span class="squad-score-num">{score.ft[1]}</span>
              {score.status === 'live' && <span class="squad-score-badge squad-score-badge--live">进行中</span>}
              {score.status === 'final' && <span class="squad-score-badge squad-score-badge--final">完赛</span>}
            </div>
            <div class="squad-score-side squad-score-side--away">
              <span class="squad-score-name">{d2.cn}</span>
              <span class="squad-score-flag">{d2.flag}</span>
            </div>
          </div>
        )}

        <div class="modal-squad-scroll">
        {!isTeamMode && score && score.scorers && score.scorers.length > 0 && (
          <div class="modal-squad-scorers">
            <MatchScorers scorers={score.scorers} team1={team1} team2={team2} />
          </div>
        )}

        <div class="squad-body">
          <div class="squad-col">
            {!isTeamMode && (
              <div class="squad-col-header">
                <span class="squad-col-flag">{d1.flag}</span>
                <div>
                  <div class="squad-col-cn">{d1.cn}</div>
                  <div class="squad-col-en">{t1 ? t1.name : team1}</div>
                </div>
              </div>
            )}
            {renderSquad(t1)}
          </div>

          {!isTeamMode && (
            <div class="squad-vs">
              {score && score.ft ? (
                <div class={`squad-vs-score squad-vs-score--${score.status === 'live' ? 'live' : 'final'}`}>
                  <span>{score.ft[0]}</span>
                  <span class="squad-vs-dash">-</span>
                  <span>{score.ft[1]}</span>
                </div>
              ) : (
                <div class="squad-vs-text">VS</div>
              )}
              <div class="squad-vs-stage">{stage || ''}</div>
            </div>
          )}

          {!isTeamMode && (
            <div class="squad-col">
              <div class="squad-col-header">
                <span class="squad-col-flag">{d2.flag}</span>
                <div>
                  <div class="squad-col-cn">{d2.cn}</div>
                  <div class="squad-col-en">{t2 ? t2.name : team2}</div>
                </div>
              </div>
              {renderSquad(t2)}
            </div>
          )}
        </div>

        {!isTeamMode && <MatchAiPanel match={match} score={score} />}
        </div>

        <div class="modal-footer">
          <span class="wizard-footer-hint">数据来源 openfootball/worldcup · 大名单 FIFA 2026 报名</span>
          <div class="modal-footer-buttons">
            <button class="btn btn-ghost" onClick={onClose}>关闭</button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default SquadModal;
