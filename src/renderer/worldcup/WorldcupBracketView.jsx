/**
 * src/renderer/worldcup/WorldcupBracketView.jsx
 *
 * v1 淘汰赛对阵 - bracket tree 渲染
 *
 * 5 阶段垂直堆叠: R32 / R16 / QF / SF / Final+Third
 * 每阶段: 阶段标题 + match cards 2-列网格
 * Toolbar: 重新计算按钮 + 元信息 (上次计算时间 / 进度 / warnings)
 */

import { useState, useEffect } from "preact/hooks";
import { displayTeam } from "./teams-data.js";
import SquadModal from "./SquadModal.jsx";
import {
  worldcupBracket,
  bracketComputing,
  bracketError,
  bracketLastComputedAt,
  loadBracket,
  computeBracket,
  clearBracketError,
} from "./bracketStore.js";
import { trackWorldcupMatchView } from "../recent/track.js";

const STAGE_LABELS = {
  r32: { title: "1/16 决赛 (Round of 32)", count: 16 },
  r16: { title: "1/8 决赛 (Round of 16)", count: 8 },
  qf:  { title: "1/4 决赛 (Quarter-finals)", count: 4 },
  sf:  { title: "半决赛 (Semi-finals)", count: 2 },
  final: { title: "决赛", count: 1 },
  third: { title: "季军赛", count: 1 },
};

function formatRelativeTime(ts) {
  if (!ts) return "从未计算";
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return new Date(ts).toLocaleString("zh-CN");
}

function teamCn(slot) {
  if (!slot || !slot.team) return null;
  return displayTeam(slot.team.name);
}

const RANK_LABELS = { winner: "第 1", runnerUp: "第 2", third: "第 3" };

function slotPlaceholder(slot) {
  if (!slot) return "未定";
  if (slot.team) return null; // MatchCard 走另一条分支
  // 上游来源: 胜者 / 败者 / 未知
  if (slot.source && /^[a-z0-9]+:\d+(-loser)?$/.test(slot.source)) {
    const [stage, num] = slot.source.split(":");
    const tail = slot.source.includes("-loser") ? "败者" : "胜者";
    return `${stage.toUpperCase()} #${num} ${tail}`;
  }
  if (slot.source && slot.source.startsWith("group:") && slot.group && slot.rank) {
    const rank = RANK_LABELS[slot.rank] || slot.rank;
    return `${slot.group} 组${rank}`;
  }
  if (slot.source === "best-third-pool" && Array.isArray(slot.pool)) {
    return `第 3 名 (${slot.pool.join("/")})`;
  }
  return "未定";
}

function MatchCard({ match, onClick }) {
  if (!match) return null;
  const { matchNum, slot1, slot2, status } = match;
  const t1 = teamCn(slot1);
  const t2 = teamCn(slot2);
  const p1 = !t1 ? slotPlaceholder(slot1) : null;
  const p2 = !t2 ? slotPlaceholder(slot2) : null;

  return (
    <div
      class={`bracket-card bracket-card--${status}`}
      onClick={() => onClick && onClick(match)}
    >
      <div class="bracket-card-num">Match {matchNum}</div>
      <div class="bracket-card-row">
        <div class="bracket-card-team">
          {t1 ? (
            <>
              <span class="bracket-card-flag">{t1.flag}</span>
              <span class="bracket-card-name">{t1.cn || slot1.team.name}</span>
            </>
          ) : (
            <span class="bracket-card-placeholder">{p1}</span>
          )}
        </div>
        <div class="bracket-card-vs">vs</div>
        <div class="bracket-card-team">
          {t2 ? (
            <>
              <span class="bracket-card-flag">{t2.flag}</span>
              <span class="bracket-card-name">{t2.cn || slot2.team.name}</span>
            </>
          ) : (
            <span class="bracket-card-placeholder">{p2}</span>
          )}
        </div>
      </div>
      <div class="bracket-card-status">
        {status === "pending" && <span class="bracket-badge">未赛</span>}
        {status === "projected" && <span class="bracket-badge bracket-badge--lock">🔒 待定</span>}
        {status === "live" && <span class="bracket-badge bracket-badge--live">● 进行中</span>}
        {status === "final" && <span class="bracket-badge bracket-badge--done">✓ 已完赛</span>}
      </div>
    </div>
  );
}

function StageSection({ stageKey, matches, onMatchClick }) {
  const label = STAGE_LABELS[stageKey];
  if (!label) return null;

  const matchList = Array.isArray(matches) ? matches : (matches ? [matches] : []);
  const hasContent = matchList.length > 0 && matchList.some(Boolean);

  if (!hasContent) {
    return (
      <section class="bracket-stage bracket-stage--empty">
        <header class="bracket-stage-header">
          <span class="bracket-stage-title">{label.title}</span>
          <span class="bracket-stage-count">[待定]</span>
        </header>
        <p class="bracket-stage-empty-msg">小组赛尚未确定对阵</p>
      </section>
    );
  }

  return (
    <section class={`bracket-stage bracket-stage--${stageKey}`}>
      <header class="bracket-stage-header">
        <span class="bracket-stage-title">{label.title}</span>
        <span class="bracket-stage-count">[{matchList.filter(Boolean).length} 场]</span>
      </header>
      <div class={`bracket-grid bracket-grid--${label.count}`}>
        {matchList.map((m) =>
          m ? <MatchCard key={m.matchNum} match={m} onClick={onMatchClick} /> : null
        )}
      </div>
    </section>
  );
}

export function WorldcupBracketView() {
  const snapshot = worldcupBracket.value;
  const computing = bracketComputing.value;
  const error = bracketError.value;
  const lastComputedAt = bracketLastComputedAt.value;
  const [squadMatch, setSquadMatch] = useState(null);

  useEffect(() => {
    loadBracket();
  }, []);

  function handleMatchClick(match) {
    trackWorldcupMatchView(match);
    setSquadMatch({
      team1: match.slot1?.team?.name || match.slot1?.source || "未定",
      team2: match.slot2?.team?.name || match.slot2?.source || "未定",
      stage: `Match ${match.matchNum}`,
      venue: "FIFA 2026",
      time: "",
      timezone: "",
      date: "",
      _isBracket: true,
    });
  }

  function handleRefresh() {
    clearBracketError();
    computeBracket({ force: true });
  }

  // 错误态
  if (error) {
    return (
      <div class="bracket-view bracket-view--error">
        <div class="bracket-error-card">
          <div class="bracket-error-icon">⚠️</div>
          <div class="bracket-error-msg">计算失败: {error}</div>
          <button class="btn btn-primary btn-sm" onClick={handleRefresh}>
            重试
          </button>
        </div>
      </div>
    );
  }

  // 空态: 小组赛尚未开始
  if (!snapshot) {
    return (
      <div class="bracket-view bracket-view--empty">
        <p class="bracket-empty-msg">小组赛尚未开始，待小组赛结束后计算淘汰赛对阵</p>
        <button
          class="btn btn-primary btn-sm"
          onClick={handleRefresh}
          disabled={computing}
        >
          {computing ? "计算中..." : "🔄 尝试计算"}
        </button>
      </div>
    );
  }

  // 空态: 小组赛完全没有数据 (所有组 played=0)
  // 保留 snapshot 结构以显示 header 工具栏, 但用空态消息提示
  const completeGroupCount = snapshot.completeGroupCount || 0;
  const noGroupData = completeGroupCount === 0;

  const advancingCount = snapshot.thirdPlacedAdvancing ? snapshot.thirdPlacedAdvancing.length : 0;
  const projectedBanner = snapshot.projected
    ? `基于 ${advancingCount} 个晋级第3名 · 待小组赛完赛`
    : "小组赛已完赛";

  return (
    <div class="bracket-view">
      {squadMatch && <SquadModal match={squadMatch} onClose={() => setSquadMatch(null)} />}
      <div class="bracket-toolbar">
        <button
          class="btn btn-primary btn-sm"
          onClick={handleRefresh}
          disabled={computing}
        >
          {computing ? "⟳ 计算中..." : "🔄 重新计算"}
        </button>
        <div class="bracket-meta">
          <span>上次计算: {formatRelativeTime(lastComputedAt)}</span>
          <span> · {projectedBanner}</span>
          {snapshot.warnings && snapshot.warnings.length > 0 && (
            <span class="bracket-warnings"> · ⚠️ {snapshot.warnings.length} 个警告</span>
          )}
        </div>
      </div>
      {noGroupData ? (
        <div class="bracket-view bracket-view--empty">
          <p class="bracket-empty-msg">小组赛尚未开始，待 6/11 揭幕战后再计算淘汰赛对阵</p>
        </div>
      ) : (
        <>
          <StageSection stageKey="r32" matches={snapshot.r32} onMatchClick={handleMatchClick} />
          <StageSection stageKey="r16" matches={snapshot.r16} onMatchClick={handleMatchClick} />
          <StageSection stageKey="qf" matches={snapshot.qf} onMatchClick={handleMatchClick} />
          <StageSection stageKey="sf" matches={snapshot.sf} onMatchClick={handleMatchClick} />
          <div class="bracket-finals">
            <StageSection stageKey="third" matches={snapshot.third} onMatchClick={handleMatchClick} />
            <StageSection stageKey="final" matches={snapshot.final} onMatchClick={handleMatchClick} />
          </div>
        </>
      )}
    </div>
  );
}

export default WorldcupBracketView;