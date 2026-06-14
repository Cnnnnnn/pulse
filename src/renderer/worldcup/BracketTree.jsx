/**
 * src/renderer/worldcup/BracketTree.jsx
 *
 * World Cup 淘汰赛对阵 — v2 水平 bracket tree 渲染
 *
 * 5 阶段水平 flex 排列 (R32 → R16 → QF → SF → Final/Third)
 * MatchCard 上下两队版式: team1 (上) / 分隔线 / team2 (下), 比分右对齐
 * 占位 slot: 显示「A 组第 1」/「R32 #73 胜者」/「第 3 名 (A/B/C/D/F)」/🔒 待定
 *
 * Task 1 (本次): 基础布局 + MatchCard, 暂未引入 SVG 连接器 (Task 2)
 */

import { displayTeam } from "./teams-data.js";

const STAGE_LABELS = {
  r32: "1/16 决赛",
  r16: "1/8 决赛",
  qf: "1/4 决赛",
  sf: "半决赛",
  final: "决赛",
  third: "季军赛",
};

function teamCn(slot) {
  if (!slot || !slot.team) return null;
  return displayTeam(slot.team.name);
}

function slotPlaceholder(slot) {
  if (!slot) return "未定";
  if (slot.source && /^[a-z0-9]+:\d+(-loser)?$/.test(slot.source)) {
    const [stage, num] = slot.source.split(":");
    const tail = slot.source.includes("-loser") ? "败者" : "胜者";
    return `${stage.toUpperCase()} #${num} ${tail}`;
  }
  if (slot.source && slot.source.startsWith("group:") && slot.group && slot.rank) {
    const rank = { winner: "第 1", runnerUp: "第 2", third: "第 3" }[slot.rank] || slot.rank;
    return `${slot.group} 组${rank}`;
  }
  if (slot.source === "best-third-pool" && Array.isArray(slot.pool)) {
    return `第 3 名 (${slot.pool.join("/")})`;
  }
  return "未定";
}

function statusBadge(status) {
  if (status === "pending") return <span class="bracket-badge">未赛</span>;
  if (status === "projected") return <span class="bracket-badge bracket-badge--lock">🔒 待定</span>;
  if (status === "live") return <span class="bracket-badge bracket-badge--live">● 进行中</span>;
  if (status === "final") return <span class="bracket-badge bracket-badge--done">✓ 已完赛</span>;
  return null;
}

function MatchCard({ match, onClick }) {
  if (!match) return null;
  const { matchNum, slot1, slot2, status } = match;
  const t1 = teamCn(slot1);
  const t2 = teamCn(slot2);

  return (
    <div
      class={`bracket-card bracket-card--${status}`}
      onClick={() => onClick && onClick(match)}
    >
      <div class="bracket-card-head">M{matchNum}</div>
      <div class="bracket-card-team bracket-card-team--top">
        {t1 ? (
          <>
            <span class="bracket-card-flag">{t1.flag}</span>
            <span class="bracket-card-name">{t1.cn || slot1.team.name}</span>
            {match.score && <span class="bracket-card-score">{match.score.ft?.[0] ?? "?"}</span>}
          </>
        ) : (
          <span class="bracket-card-placeholder">{slotPlaceholder(slot1)}</span>
        )}
      </div>
      <div class="bracket-card-divider" />
      <div class="bracket-card-team bracket-card-team--bottom">
        {t2 ? (
          <>
            <span class="bracket-card-flag">{t2.flag}</span>
            <span class="bracket-card-name">{t2.cn || slot2.team.name}</span>
            {match.score && <span class="bracket-card-score">{match.score.ft?.[1] ?? "?"}</span>}
          </>
        ) : (
          <span class="bracket-card-placeholder">{slotPlaceholder(slot2)}</span>
        )}
      </div>
      <div class="bracket-card-status">{statusBadge(status)}</div>
    </div>
  );
}

function StageColumn({ stage, matches, onMatchClick }) {
  const matchList = Array.isArray(matches) ? matches : (matches ? [matches] : []);
  return (
    <div class={`bracket-tree-column bracket-tree-column--${stage}`}>
      <div class="bracket-tree-column-title">{STAGE_LABELS[stage]}</div>
      <div class="bracket-tree-column-cards">
        {matchList.map((m) => m ? <MatchCard key={m.matchNum} match={m} onClick={onMatchClick} /> : null)}
      </div>
    </div>
  );
}

function FinalColumn({ finalMatch, thirdMatch, onMatchClick }) {
  return (
    <div class="bracket-tree-column bracket-tree-column--final">
      <div class="bracket-tree-column-title">决赛 & 季军</div>
      <div class="bracket-tree-column-cards">
        {finalMatch && <MatchCard match={finalMatch} onClick={onMatchClick} />}
        {thirdMatch && <MatchCard match={thirdMatch} onClick={onMatchClick} />}
      </div>
    </div>
  );
}

export function BracketTree({ snapshot, onMatchClick }) {
  if (!snapshot) return null;
  return (
    <div class="bracket-tree">
      <StageColumn stage="r32" matches={snapshot.r32} onMatchClick={onMatchClick} />
      <StageColumn stage="r16" matches={snapshot.r16} onMatchClick={onMatchClick} />
      <StageColumn stage="qf"  matches={snapshot.qf}  onMatchClick={onMatchClick} />
      <StageColumn stage="sf"  matches={snapshot.sf}  onMatchClick={onMatchClick} />
      <FinalColumn finalMatch={snapshot.final} thirdMatch={snapshot.third} onMatchClick={onMatchClick} />
    </div>
  );
}

export default BracketTree;
