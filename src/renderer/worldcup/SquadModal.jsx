/**
 * src/renderer/worldcup/SquadModal.jsx
 *
 * v2.9.3 — 赛详情 modal (拍 card_rich_modal: 2 队 + 场馆 + 阶段 + squad)
 *
 * 点 MatchCard 触发.
 * 显示:
 *   - 顶: 阶段 + 日期 + 北京时间 + 场馆
 *   - 左: team1 大名单 (1 真实人 + 25 占位)
 *   - 中: VS / 比分
 *   - 右: team2 大名单
 *   - 底: 关闭按钮
 *
 * 隔离: 0 共享 store, 父组件 控 onClose + match prop.
 */

import { useEffect } from 'preact/hooks';
import { lookupTeam } from './teams-data.js';
import { toBeijingTime } from './timeUtils.js';

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
  const t1 = lookupTeam(team1);
  const t2 = lookupTeam(team2);
  const bj = toBeijingTime(time, timezone, match.date);

  function renderSquad(team) {
    if (!team) {
      return <p class="squad-empty">未匹配 ({match.team1 || '?'})</p>;
    }
    const isSkeleton = team.squad[0] && team.squad[0].name.startsWith('TBD-');
    return (
      <div class="squad-list">
        {/* 1 真实人 头排 */}
        {team.famous.map((p) => (
          <div key={`fam-${p.number}`} class="squad-row squad-row-famous">
            <span class="squad-num">{p.number}</span>
            <span class="squad-pos">{POS_LABELS[p.position] || p.position}</span>
            <span class="squad-name">{p.name}</span>
            <span class="squad-club">{p.club}</span>
          </div>
        ))}
        {/* 25 占位 */}
        {isSkeleton && (
          <p class="squad-skel-hint">↓ 大名单 (骨架 TBD, 后期 FIFA 报名 填)</p>
        )}
        {team.squad.map((p) => (
          <div key={p.number} class="squad-row squad-row-skel">
            <span class="squad-num">{p.number}</span>
            <span class="squad-pos">{POS_LABELS[p.position] || p.position}</span>
            <span class="squad-name">{p.name}</span>
            <span class="squad-club">{p.club}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class="modal-card modal-squad" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>{stage || '比赛详情'}</h2>
          <button class="btn-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div class="squad-meta">
          {match.date && <span class="squad-meta-date">{match.date} · {bj.weekday || ''}</span>}
          {bj.time && <span class="squad-meta-time">🕒 {bj.time} 北京 (原 {bj.originalTime})</span>}
          {venue && <span class="squad-meta-venue">📍 {venue}</span>}
        </div>

        <div class="squad-body">
          <div class="squad-col">
            <div class="squad-col-header">
              {t1 && <span class="squad-col-flag">{t1.flag}</span>}
              <div>
                <div class="squad-col-cn">{t1 ? t1.cn : team1}</div>
                <div class="squad-col-en">{t1 ? t1.name : ''}</div>
              </div>
            </div>
            {renderSquad(t1)}
          </div>

          <div class="squad-vs">
            {score && score.ft ? (
              <div class="squad-vs-score">
                <span>{score.ft[0]}</span>
                <span class="squad-vs-dash">-</span>
                <span>{score.ft[1]}</span>
              </div>
            ) : (
              <div class="squad-vs-text">VS</div>
            )}
            <div class="squad-vs-stage">{stage || ''}</div>
          </div>

          <div class="squad-col">
            <div class="squad-col-header">
              {t2 && <span class="squad-col-flag">{t2.flag}</span>}
              <div>
                <div class="squad-col-cn">{t2 ? t2.cn : team2}</div>
                <div class="squad-col-en">{t2 ? t2.name : ''}</div>
              </div>
            </div>
            {renderSquad(t2)}
          </div>
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
}

export default SquadModal;
