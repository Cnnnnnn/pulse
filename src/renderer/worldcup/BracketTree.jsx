/**
 * src/renderer/worldcup/BracketTree.jsx
 *
 * World Cup 淘汰赛对阵 — v2 水平 bracket tree 渲染
 *
 * 5 阶段水平 flex 排列 (R32 → R16 → QF → SF → Final/Third)
 * MatchCard 上下两队版式: team1 (上) / 分隔线 / team2 (下), 比分右对齐
 * 占位 slot: 显示「A 组第 1」/「R32 #73 胜者」/「第 3 名 (A/B/C/D/F)」/🔒 待定
 *
 * Task 2 (本次): 在 Task 1 基础上加 SVG 连接器层 (L 型折线 + ResizeObserver)
 * - useConnectors: 测量相邻列卡片 DOM 位置, 画 M-H-V-H 折线
 * - 路径高亮: 上游 status=final 且 下游 slot.team 双侧均已 resolve
 * - ResizeObserver (降级 window resize) 防抖 50ms 重算
 *
 * Task 4 (本次): 响应式 fallback — 当 window.innerWidth < 900px 时,
 * 隐藏水平 tree, 改用 BracketTreeFallback (v1 垂直堆叠 5 段) 渲染.
 * - useNarrowViewport: 监听 resize, 返回是否 < maxWidth
 * - BracketTreeFallback / FallbackStageSection / FallbackMatchCard:
 *   提取自 WorldcupBracketView.jsx v1 代码, 复用 v1 CSS (无 .bracket-tree
 *   前缀的 .bracket-stage / .bracket-grid / .bracket-card)
 */

import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { displayTeam } from "./teams-data.js";

const STAGE_LABELS = {
  r32: "1/16 决赛",
  r16: "1/8 决赛",
  qf: "1/4 决赛",
  sf: "半决赛",
  final: "决赛",
  third: "季军赛",
};

const FALLBACK_STAGE_LABELS = {
  r32: { title: "1/16 决赛 (Round of 32)", count: 16 },
  r16: { title: "1/8 决赛 (Round of 16)", count: 8 },
  qf:  { title: "1/4 决赛 (Quarter-finals)", count: 4 },
  sf:  { title: "半决赛 (Semi-finals)", count: 2 },
  final: { title: "决赛", count: 1 },
  third: { title: "季军赛", count: 1 },
};

const STAGE_PAIRS = [
  ["r32", "r16", 2],
  ["r16", "qf", 2],
  ["qf", "sf", 2],
  ["sf", "final", 2],
  ["sf", "third", 2],
];

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

function isHighlighted(fromMatch, toMatch) {
  if (!fromMatch || !toMatch) return false;
  if (fromMatch.status !== "final") return false;
  const t1 = toMatch.slot1 && toMatch.slot1.team;
  const t2 = toMatch.slot2 && toMatch.slot2.team;
  return !!(t1 && t2);
}

function MatchCard({ match, onClick }) {
  if (!match) return null;
  const { matchNum, slot1, slot2, status } = match;
  const t1 = teamCn(slot1);
  const t2 = teamCn(slot2);

  return (
    <div
      ref={(el) => { if (el) el.__matchData = match; }}
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

function FinalMatchCard({ match, kind, onClick }) {
  if (!match) return null;
  const { matchNum, slot1, slot2, status } = match;
  const t1 = teamCn(slot1);
  const t2 = teamCn(slot2);
  const cls = kind === "final" ? "bracket-card--final-prominent" : "bracket-card--third-prominent";
  const headText = kind === "final" ? `FINAL · M${matchNum}` : `3rd · M${matchNum}`;
  return (
    <div
      ref={(el) => { if (el) el.__matchData = match; }}
      class={`bracket-card ${cls} bracket-card--${status}`}
      onClick={() => onClick && onClick(match)}
    >
      <div class="bracket-card-head">{headText}</div>
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

function StageColumn({ stage, matches, onMatchClick, columnRef }) {
  const matchList = Array.isArray(matches) ? matches : (matches ? [matches] : []);
  return (
    <div
      ref={columnRef}
      class={`bracket-tree-column bracket-tree-column--${stage}`}
    >
      <div class="bracket-tree-column-title">{STAGE_LABELS[stage]}</div>
      <div class="bracket-tree-column-cards">
        {matchList.map((m) => m ? <MatchCard key={m.matchNum} match={m} onClick={onMatchClick} /> : null)}
      </div>
    </div>
  );
}

function FinalColumn({ finalMatch, thirdMatch, onMatchClick, finalColRef, thirdColRef }) {
  return (
    <div class="bracket-tree-column bracket-tree-column--final">
      <div class="bracket-tree-column-title">决赛 & 季军</div>
      <div class="bracket-tree-column-cards">
        <div ref={finalColRef} class="bracket-tree-column-section bracket-tree-column-section--final">
          {finalMatch && <FinalMatchCard match={finalMatch} kind="final" onClick={onMatchClick} />}
        </div>
        <div ref={thirdColRef} class="bracket-tree-column-section bracket-tree-column-section--third">
          {thirdMatch && <FinalMatchCard match={thirdMatch} kind="third" onClick={onMatchClick} />}
        </div>
      </div>
    </div>
  );
}

function useConnectors(columnRefs) {
  const [paths, setPaths] = useState([]);
  const [version, setVersion] = useState(0);

  const recalc = useCallback(() => {
    if (typeof window === "undefined" || !columnRefs.current) return;
    const refs = columnRefs.current;
    if (!refs.container) return;
    const out = [];
    for (const [fromStage, toStage, fanIn] of STAGE_PAIRS) {
      const fromCol = refs[`${fromStage}Col`];
      const toCol = refs[`${toStage}Col`];
      if (!fromCol || !toCol) continue;
      const fromCards = fromCol.querySelectorAll(".bracket-card");
      const toCards = toCol.querySelectorAll(".bracket-card");
      if (!fromCards.length || !toCards.length) continue;
      const containerRect = refs.container.getBoundingClientRect();
      // Iterate by destination: for each to-card, fanIn sources feed it.
      for (let j = 0; j < toCards.length; j += 1) {
        const toCard = toCards[j];
        for (let k = 0; k < fanIn; k += 1) {
          const fromIdx = j * fanIn + k;
          const fromCard = fromCards[fromIdx];
          if (!fromCard) continue;
          const fromCardRect = fromCard.getBoundingClientRect();
          const toCardRect = toCard.getBoundingClientRect();
          const x1 = fromCardRect.right - containerRect.left;
          const y1 = fromCardRect.top + fromCardRect.height / 2 - containerRect.top;
          const x2 = toCardRect.left - containerRect.left;
          const y2 = toCardRect.top + toCardRect.height / 2 - containerRect.top;
          const mx = (x1 + x2) / 2;
          const fromData = fromCard.__matchData;
          const toData = toCard.__matchData;
          out.push({
            d: `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`,
            highlighted: isHighlighted(fromData, toData),
          });
        }
      }
    }
    setPaths((prev) => {
      if (prev.length !== out.length) return out;
      for (let i = 0; i < out.length; i += 1) {
        if (prev[i].d !== out[i].d || prev[i].highlighted !== out[i].highlighted) return out;
      }
      return prev;
    });
  }, [columnRefs]);

  useEffect(() => {
    if (typeof window === "undefined" || !columnRefs.current || !columnRefs.current.container) return undefined;
    recalc();
    let timer = null;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(recalc, 50);
    };
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(onResize);
      ro.observe(columnRefs.current.container);
      return () => { ro.disconnect(); clearTimeout(timer); };
    }
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); clearTimeout(timer); };
  }, [recalc, version, columnRefs]);

  const triggerRecalc = useCallback(() => setVersion((v) => v + 1), []);
  return { paths, triggerRecalc };
}

function BracketConnectors({ paths }) {
  return (
    <svg class="bracket-tree-connectors" xmlns="http://www.w3.org/2000/svg">
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          class={p.highlighted ? "bracket-tree-connector bracket-tree-connector--highlighted" : "bracket-tree-connector"}
          fill="none"
        />
      ))}
    </svg>
  );
}

function useNarrowViewport(maxWidth = 900) {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < maxWidth;
  });
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (typeof window.addEventListener !== "function") return undefined;
    const onResize = () => setNarrow(window.innerWidth < maxWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [maxWidth]);
  return narrow;
}

function FallbackMatchCard({ match, onClick }) {
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

function FallbackStageSection({ stageKey, matches, onMatchClick }) {
  const label = FALLBACK_STAGE_LABELS[stageKey];
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
          m ? <FallbackMatchCard key={m.matchNum} match={m} onClick={onMatchClick} /> : null
        )}
      </div>
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
  // Structure: r32 / r16 / qf / sf / finals(= final + third) = 5 .bracket-stage
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

export function BracketTree({ snapshot, onMatchClick }) {
  const narrow = useNarrowViewport(900);
  const columnRefs = useRef({
    container: null,
    r32Col: null, r16Col: null, qfCol: null, sfCol: null, finalCol: null, thirdCol: null,
  });
  const { paths, triggerRecalc } = useConnectors(columnRefs);

  useEffect(() => { triggerRecalc(); }, [snapshot, triggerRecalc]);

  if (!snapshot) return null;
  if (narrow) {
    return <BracketTreeFallback snapshot={snapshot} onMatchClick={onMatchClick} />;
  }
  return (
    <div class="bracket-tree" ref={(el) => { columnRefs.current.container = el; }}>
      <BracketConnectors paths={paths} />
      <div class="bracket-tree-columns">
        <StageColumn
          stage="r32"
          matches={snapshot.r32}
          onMatchClick={onMatchClick}
          columnRef={(el) => { columnRefs.current.r32Col = el; }}
        />
        <StageColumn
          stage="r16"
          matches={snapshot.r16}
          onMatchClick={onMatchClick}
          columnRef={(el) => { columnRefs.current.r16Col = el; }}
        />
        <StageColumn
          stage="qf"
          matches={snapshot.qf}
          onMatchClick={onMatchClick}
          columnRef={(el) => { columnRefs.current.qfCol = el; }}
        />
        <StageColumn
          stage="sf"
          matches={snapshot.sf}
          onMatchClick={onMatchClick}
          columnRef={(el) => { columnRefs.current.sfCol = el; }}
        />
        <FinalColumn
          finalMatch={snapshot.final}
          thirdMatch={snapshot.third}
          onMatchClick={onMatchClick}
          finalColRef={(el) => { columnRefs.current.finalCol = el; }}
          thirdColRef={(el) => { columnRefs.current.thirdCol = el; }}
        />
      </div>
    </div>
  );
}

export default BracketTree;
