/**
 * src/renderer/worldcup/BracketTree.jsx
 *
 * World Cup 淘汰赛对阵 — v1 5 段垂直堆叠 (fallback 版).
 *
 * 历史: v3 曾经重做为 FIFA 标准 bracket tree (上下半区镜像 + 中央 Final 奖杯),
 * 但双行卡 + 整体缩放 + SVG 汇聚连线渲染复杂度高, 行高错位, 视觉丑, 用户退回 v1.
 *
 * 当前: 始终走 BracketTreeFallback (R32 / R16 / QF / SF / 决赛&季军赛) 5 段堆叠,
 * 不判断 viewport, 不管宽窄都用 fallback. 这版稳定可用.
 *
 * splitBracketByHalf 保留导出供测试 (如果以后想再尝试 horizontal 树, 直接复用).
 */

import { TeamFlag, IconLock, IconCheck, IconClock } from "../components/icons.jsx";
import { displayTeam } from "./teams-data.js";

function teamCn(slot) {
  if (!slot || !slot.team) return null;
  // ponytail: 用 displayTeam 拿 ISO-2 code (FLAG_SVGS 的 key), 不要用 .substring(0,2)
  // 截队名 (那种 "South Africa" → "SO" 是错的, 南非 ISO 是 ZA).
  const d = displayTeam(slot.team.name);
  return { flag: d.flag, cn: d.cn };
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

function MatchMeta({ match }) {
  const k = match && match.kickoff;
  if (!k || !k.date) return null;
  const time = `${k.date}${k.time ? ` ${k.time}` : ""}${k.timezone ? ` ${k.timezone}` : ""}`;
  return (
    <div class="bracket-card-meta">
      {time && <span class="bracket-card-meta-time"><IconClock size={11} /> {time}</span>}
      {k.venue && <span class="bracket-card-meta-venue">@ {k.venue}</span>}
    </div>
  );
}

// ponytail: v2.64 — 百度/ESPN 风卡片: 头部 Match num + 状态徽章 (右对齐),
// 主行 队1 vs 队2 (居中比分/vs), 底部 meta 一行 (时间 + 球场).
// 比分 status=final/live 时显示数字 vs 灰色, status=pending/projected 显示 vs.
// 实际 score shape: { ft: [home, away], ht: [h, a], status } (来自 cup_finals.txt + state.json)
function CardScore({ match }) {
  const { status, score } = match;
  if ((status === "final" || status === "live") && score && Array.isArray(score.ft)) {
    const [home, away] = score.ft;
    const leaderIsHome = home != null && away != null && home > away;
    const leaderIsAway = home != null && away != null && away > home;
    return (
      <span class="bracket-card-score">
        <span class={`bracket-card-score-num ${leaderIsHome ? "is-leader" : ""}`}>{home ?? "-"}</span>
        <span class="bracket-card-score-dash">:</span>
        <span class={`bracket-card-score-num ${leaderIsAway ? "is-leader" : ""}`}>{away ?? "-"}</span>
      </span>
    );
  }
  return <span class="bracket-card-vs">vs</span>;
}

function StatusBadge({ status }) {
  if (status === "live") return <span class="bracket-badge bracket-badge--live">● 进行中</span>;
  if (status === "final") return <span class="bracket-badge bracket-badge--done"><IconCheck size={11} /> 已完赛</span>;
  if (status === "projected") return <span class="bracket-badge bracket-badge--lock"><IconLock size={11} /> 待定</span>;
  if (status === "pending") return <span class="bracket-badge">未赛</span>;
  return null;
}

function FallbackMatchCard({ match, onClick }) {
  if (!match) return null;
  const { matchNum, slot1, slot2, status } = match;
  const t1 = teamCn(slot1);
  const t2 = teamCn(slot2);

  return (
    <div
      class={`bracket-card bracket-card--${status}`}
      onClick={() => onClick && onClick(match)}
    >
      <div class="bracket-card-head">
        <span class="bracket-card-num">Match {matchNum}</span>
        <StatusBadge status={status} />
      </div>
      <div class="bracket-card-row">
        <div class="bracket-card-team">
          {t1 ? (
            <>
              <span class="bracket-card-flag"><TeamFlag code={t1.flag} size={14} /></span>
              <span class="bracket-card-name">{t1.cn || slot1.team.name}</span>
            </>
          ) : (
            <span class="bracket-card-placeholder">{slotPlaceholder(slot1)}</span>
          )}
        </div>
        <CardScore match={match} />
        <div class="bracket-card-team">
          {t2 ? (
            <>
              <span class="bracket-card-flag"><TeamFlag code={t2.flag} size={14} /></span>
              <span class="bracket-card-name">{t2.cn || slot2.team.name}</span>
            </>
          ) : (
            <span class="bracket-card-placeholder">{slotPlaceholder(slot2)}</span>
          )}
        </div>
      </div>
      <MatchMeta match={match} />
    </div>
  );
}

const FALLBACK_STAGE_LABELS = {
  r32: { title: "1/16 决赛 (Round of 32)", count: 16 },
  r16: { title: "1/8 决赛 (Round of 16)", count: 8 },
  qf:  { title: "1/4 决赛 (Quarter-finals)", count: 4 },
  sf:  { title: "半决赛 (Semi-finals)", count: 2 },
  final: { title: "决赛", count: 1 },
  third: { title: "季军赛", count: 1 },
};

function FallbackStageSection({ stageKey, matches, onMatchClick }) {
  const label = FALLBACK_STAGE_LABELS[stageKey];
  if (!label) return null;

  const matchList = Array.isArray(matches) ? matches : (matches ? [matches] : []);
  const hasContent = matchList.length > 0 && matchList.some(Boolean);

  if (!hasContent) {
    return (
      <section class={`bracket-stage bracket-stage--${stageKey} bracket-stage--empty`}>
        <header class="bracket-stage-header">
          <span class="bracket-stage-title">{label.title}</span>
          <span class="bracket-stage-count">[待定]</span>
        </header>
        <p class="bracket-stage-empty-msg">小组赛尚未确定对阵</p>
      </section>
    );
  }

  // ponytail: v2.52 大型 stage (R32 16 / R16 8) 拆上下两半并排 (2 列 grid), 整体高度减半,
  // 配合 single-row card 实现一屏装下 32 场.
  const splitFallback = label.count >= 8;
  let cards = null;
  if (splitFallback) {
    const mid = Math.ceil(matchList.length / 2);
    const top = matchList.slice(0, mid);
    const bot = matchList.slice(mid);
    cards = (
      <div class="bracket-fallback-split">
        <div class="bracket-fallback-half">
          {top.map((m) => m ? <FallbackMatchCard key={m.matchNum} match={m} onClick={onMatchClick} /> : null)}
        </div>
        <div class="bracket-fallback-half">
          {bot.map((m) => m ? <FallbackMatchCard key={m.matchNum} match={m} onClick={onMatchClick} /> : null)}
        </div>
      </div>
    );
  } else {
    cards = (
      <div class={`bracket-grid bracket-grid--${label.count}`}>
        {matchList.map((m) =>
          m ? <FallbackMatchCard key={m.matchNum} match={m} onClick={onMatchClick} /> : null
        )}
      </div>
    );
  }

  return (
    <section class={`bracket-stage bracket-stage--${stageKey}`}>
      <header class="bracket-stage-header">
        <span class="bracket-stage-title">{label.title}</span>
        <span class="bracket-stage-count">[{matchList.filter(Boolean).length} 场]</span>
      </header>
      {cards}
    </section>
  );
}

function BracketTreeFallbackFinals({ finalMatch, thirdMatch, onMatchClick }) {
  const matchList = [thirdMatch, finalMatch].filter(Boolean);
  const hasContent = matchList.length > 0;
  if (!hasContent) {
    return (
      <section class="bracket-stage bracket-stage--empty">
        <header class="bracket-stage-header">
          <span class="bracket-stage-title">决赛 & 季军赛</span>
          <span class="bracket-stage-count">[待定]</span>
        </header>
        <p class="bracket-stage-empty-msg">小组赛尚未确定对阵</p>
      </section>
    );
  }
  return (
    <section class="bracket-stage bracket-stage--finals">
      <header class="bracket-stage-header">
        <span class="bracket-stage-title">决赛 & 季军赛</span>
        <span class="bracket-stage-count">[{matchList.length} 场]</span>
      </header>
      <div class="bracket-finals">
        {matchList.map((m) => (
          <FallbackMatchCard key={m.matchNum} match={m} onClick={onMatchClick} />
        ))}
      </div>
    </section>
  );
}

function BracketTreeFallback({ snapshot, onMatchClick }) {
  if (!snapshot) return null;
  return (
    <div class="bracket-tree-fallback">
      <FallbackStageSection stageKey="r32" matches={snapshot.r32} onMatchClick={onMatchClick} />
      <FallbackStageSection stageKey="r16" matches={snapshot.r16} onMatchClick={onMatchClick} />
      <FallbackStageSection stageKey="qf" matches={snapshot.qf} onMatchClick={onMatchClick} />
      <FallbackStageSection stageKey="sf" matches={snapshot.sf} onMatchClick={onMatchClick} />
      <BracketTreeFallbackFinals
        finalMatch={snapshot.final}
        thirdMatch={snapshot.third}
        onMatchClick={onMatchClick}
      />
    </div>
  );
}

// ponytail: splitBracketByHalf 保留导出供测试 — 如果以后再尝试 horizontal tree,
// 直接 reuse. 当前不调用, 但保留 API surface.
function splitBracketByHalf(snapshot) {
  if (!snapshot) return null;
  const take = (arr, lo, hi) => Array.isArray(arr) ? arr.slice(lo, hi) : [];
  return {
    upperR32: take(snapshot.r32, 0, 8),
    upperR16: take(snapshot.r16, 0, 4),
    upperQF:  take(snapshot.qf, 0, 2),
    upperSF:  take(snapshot.sf, 0, 1),
    lowerSF:  take(snapshot.sf, 1, 2),
    lowerQF:  take(snapshot.qf, 2, 4),
    lowerR16: take(snapshot.r16, 4, 8),
    lowerR32: take(snapshot.r32, 8, 16),
    final: snapshot.final || null,
    third: snapshot.third || null,
  };
}

export function BracketTree({ snapshot, onMatchClick, currentStage }) {
  // ponytail: currentStage 参数为 WorldcupBracketView 的 stage tab 状态, 当前实现直接忽略
  // (一整张 fallback 已经包含所有 stage, 不需要按 stage 切换).
  void currentStage; // silence unused
  if (!snapshot) return null;
  return <BracketTreeFallback snapshot={snapshot} onMatchClick={onMatchClick} />;
}

export default BracketTree;

// 模块级导出 splitBracketByHalf 供测试直接验证镜像分割逻辑.
export { splitBracketByHalf };