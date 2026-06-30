/**
 * src/renderer/worldcup/BracketTree.jsx
 *
 * FIFA 标准 bracket tree — 上下半区镜像汇聚到中央 Final + Third.
 *
 * 上半区: R32[0..7] → R16[0..3] → QF[0..1] → SF[0]
 * 下半区: SF[1] → QF[2..3] → R16[4..7] → R32[8..15]
 * 中央: 季军赛 + 决赛奖杯卡
 *
 * 设计要点:
 * - 双行 MatchCard (队1+比分 / 分隔线 / 队2+比分)
 * - Final 用 .bracket-final-card 金色奖杯 + IconTrophy
 * - R32→R16→QF→SF 走 CSS ::before 静态折线 (零 JS)
 * - SF→Final + SF→Third 走 SVG (汇聚到中央, 位置动态)
 * - 整体 transform: scale() 等比缩放, ResizeObserver 算 --bracket-scale
 * - 窗口 < 700px 时退回 BracketTreeFallback 垂直堆叠
 */

import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { displayTeam } from "./teams-data.js";
import { TeamFlag, IconLock, IconCheck, IconClock, IconTrophy } from "../components/icons.jsx";

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

// ponytail: FIFA 标准 bracket 镜像分割 — 16 场 R32 分上下半区各 8 张,
// 然后 R16 各 4, QF 各 2, SF 上半 = index 0, 下半 = index 1.
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
  if (status === "projected") return <span class="bracket-badge bracket-badge--lock"><IconLock size={12} /> 待定</span>;
  if (status === "live") return <span class="bracket-badge bracket-badge--live">● 进行中</span>;
  if (status === "final") return <span class="bracket-badge bracket-badge--done"><IconCheck size={12} /> 已完赛</span>;
  return null;
}

function MatchMeta({ match }) {
  const k = match && match.kickoff;
  if (!k || !k.date) return null;
  return (
    <div class="bracket-card-meta">
      <span class="bracket-card-meta-time"><IconClock size={10} /> {k.date} {k.time}{k.timezone ? ` ${k.timezone}` : ""}</span>
      {k.venue && <span class="bracket-card-meta-venue">@ {k.venue}</span>}
    </div>
  );
}

// ponytail: 双行布局 — 队1+比分 上行 / 分隔线 / 队2+比分 下行. 胜方加粗金黄.
function TeamRow({ slot, side, isWinner }) {
  const t = teamCn(slot);
  return (
    <div class={`bracket-card-team bracket-card-team--${side}${isWinner ? " bracket-card-team--winner" : ""}`}>
      {t ? (
        <>
          <span class="bracket-card-flag"><TeamFlag code={t.flag} size={12} /></span>
          <span class="bracket-card-name">{t.cn || slot.team.name}</span>
        </>
      ) : (
        <span class="bracket-card-placeholder">{slotPlaceholder(slot)}</span>
      )}
    </div>
  );
}

function ScoreDisplay({ match }) {
  if (match.score && match.score.ft) {
    const [s1, s2] = match.score.ft;
    const winnerIdx = match.slot1 && match.slot2 && s1 !== s2 ? (s1 > s2 ? 1 : 2) : 0;
    return (
      <div class={`bracket-card-score bracket-card-score--winner-${winnerIdx}`}>
        <span class="bracket-card-score-num">{s1}</span>
        <span class="bracket-card-score-dash">-</span>
        <span class="bracket-card-score-num">{s2}</span>
      </div>
    );
  }
  return <span class="bracket-card-vs">vs</span>;
}

function isCardFinal(match) {
  return match && match.status === "final" && match.score && match.score.ft
    && match.score.ft[0] !== match.score.ft[1];
}

function MatchCard({ match, onClick }) {
  if (!match) return null;
  const { matchNum, slot1, slot2, status } = match;
  const final = isCardFinal(match);
  const s1 = match.score && match.score.ft ? match.score.ft[0] : null;
  const s2 = match.score && match.score.ft ? match.score.ft[1] : null;
  const winnerSide = final ? (s1 > s2 ? "top" : "bottom") : null;
  return (
    <div
      ref={(el) => { if (el) el.__matchData = match; }}
      class={`bracket-card bracket-card--${status}`}
      onClick={() => onClick && onClick(match)}
    >
      <div class="bracket-card-head">
        <span class="bracket-card-num">M{matchNum}</span>
        <span class="bracket-card-status">{statusBadge(status)}</span>
      </div>
      <div class="bracket-card-row bracket-card-row--double">
        <TeamRow slot={slot1} side="top" isWinner={winnerSide === "top"} />
        <ScoreDisplay match={match} />
        <TeamRow slot={slot2} side="bottom" isWinner={winnerSide === "bottom"} />
      </div>
      <MatchMeta match={match} />
    </div>
  );
}

function FinalTrophyCard({ match, onClick }) {
  if (!match) return null;
  const { matchNum, slot1, slot2, status } = match;
  const final = isCardFinal(match);
  const s1 = match.score && match.score.ft ? match.score.ft[0] : null;
  const s2 = match.score && match.score.ft ? match.score.ft[1] : null;
  const winnerSide = final ? (s1 > s2 ? "top" : "bottom") : null;
  return (
    <div
      ref={(el) => { if (el) el.__matchData = match; }}
      class={`bracket-card bracket-final-card bracket-card--${status}`}
      onClick={() => onClick && onClick(match)}
    >
      <div class="bracket-final-card-banner">
        <IconTrophy size={14} /> <span>决 赛</span> <IconTrophy size={14} />
      </div>
      <div class="bracket-card-row bracket-card-row--double bracket-card-row--trophy">
        <TeamRow slot={slot1} side="top" isWinner={winnerSide === "top"} />
        <ScoreDisplay match={match} />
        <TeamRow slot={slot2} side="bottom" isWinner={winnerSide === "bottom"} />
      </div>
      <div class="bracket-final-card-foot">
        <span>M{matchNum}</span>
        <MatchMeta match={match} />
      </div>
    </div>
  );
}

function ThirdPlaceCard({ match, onClick }) {
  if (!match) return null;
  const { matchNum, slot1, slot2, status } = match;
  const final = isCardFinal(match);
  const s1 = match.score && match.score.ft ? match.score.ft[0] : null;
  const s2 = match.score && match.score.ft ? match.score.ft[1] : null;
  const winnerSide = final ? (s1 > s2 ? "top" : "bottom") : null;
  return (
    <div
      ref={(el) => { if (el) el.__matchData = match; }}
      class={`bracket-card bracket-third-card bracket-card--${status}`}
      onClick={() => onClick && onClick(match)}
    >
      <div class="bracket-third-card-head">
        <span class="bracket-third-card-medal">🥉</span>
        <span>季军赛</span>
        <span class="bracket-third-card-num">M{matchNum}</span>
      </div>
      <div class="bracket-card-row bracket-card-row--double">
        <TeamRow slot={slot1} side="top" isWinner={winnerSide === "top"} />
        <ScoreDisplay match={match} />
        <TeamRow slot={slot2} side="bottom" isWinner={winnerSide === "bottom"} />
      </div>
      <MatchMeta match={match} />
    </div>
  );
}

// ponytail: 半区列 — 一个 R32/R16/QF/SF 列, 卡片用 justify-content: space-around 等距分布.
// CSS ::before 在每张非 R32 卡片左侧画一根横线接上游, 零 JS.
function HalfColumn({ stage, matches, onMatchClick, registerRef, empty }) {
  const matchList = Array.isArray(matches) ? matches : [];
  const hasContent = matchList.some(Boolean);
  return (
    <div
      class={`bracket-tree-column bracket-tree-column--${stage}${hasContent ? "" : " bracket-tree-column--empty"}`}
      ref={(el) => registerRef && registerRef(el)}
    >
      <div class="bracket-tree-column-title">{STAGE_LABELS[stage]}</div>
      <div class="bracket-tree-column-cards">
        {hasContent ? (
          matchList.map((m) => m ? <MatchCard key={m.matchNum} match={m} onClick={onMatchClick} /> : null)
        ) : (
          <div class="bracket-tree-column-empty">{empty || "暂无"}</div>
        )}
      </div>
    </div>
  );
}

// ponytail: 整体缩放 — ResizeObserver 算 naturalWidth / containerWidth 比例, 写入 --bracket-scale.
function useBracketScale(containerRef, naturalWidth) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const recalc = () => {
      const w = el.clientWidth;
      if (!naturalWidth || !w) return;
      // ponytail: 下限 0.4, 超过 1 不放大 (按设计文档)
      const next = Math.min(1, Math.max(0.4, w / naturalWidth));
      setScale(next);
      el.style.setProperty("--bracket-scale", String(next));
    };
    recalc();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(recalc);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [containerRef, naturalWidth]);
  return scale;
}

function FinalCenterConnectors({ containerRef, upperSfRef, lowerSfRef, finalRef, thirdRef, paths }) {
  // ponytail: SF→Final + SF→Third 的连线用 SVG (因为汇聚到中央奖杯卡, 位置动态).
  // 简化: 画两条汇聚线 — 上半区 SF 右中 → Final 左中, 下半区 SF 右中 → Final 左中.
  // 季军赛从两个 SF 左侧引出 (虚线).
  const [svgPaths, setSvgPaths] = useState([]);

  const recalc = useCallback(() => {
    const c = containerRef.current;
    const us = upperSfRef.current;
    const ls = lowerSfRef.current;
    const fn = finalRef.current;
    const td = thirdRef.current;
    if (!c || !us || !ls || !fn) { setSvgPaths([]); return; }
    const cRect = c.getBoundingClientRect();
    const usRect = us.getBoundingClientRect();
    const lsRect = ls.getBoundingClientRect();
    const fnRect = fn.getBoundingClientRect();
    const out = [];
    const upperX1 = usRect.right - cRect.left;
    const upperY1 = usRect.top + usRect.height / 2 - cRect.top;
    const lowerX1 = lsRect.right - cRect.left;
    const lowerY1 = lsRect.top + lsRect.height / 2 - cRect.top;
    const finalX2 = fnRect.left - cRect.left;
    const finalY2 = fnRect.top + fnRect.height / 2 - cRect.top;
    const upperMidX = (upperX1 + finalX2) / 2;
    out.push({ d: `M ${upperX1} ${upperY1} H ${upperMidX} V ${finalY2} H ${finalX2}` });
    out.push({ d: `M ${lowerX1} ${lowerY1} H ${upperMidX} V ${finalY2} H ${finalX2}` });
    // 季军赛 — 上半 SF 左中 → 第三卡左侧 (虚线), 下半 SF 左中 → 第三卡左侧
    if (td) {
      const tdRect = td.getBoundingClientRect();
      const tdX2 = tdRect.left - cRect.left;
      const tdY2 = tdRect.top + tdRect.height / 2 - cRect.top;
      const upperXfX1 = usRect.left - cRect.left;
      const upperXfY1 = usRect.top + usRect.height / 2 - cRect.top;
      const lowerXfX1 = lsRect.left - cRect.left;
      const lowerXfY1 = lsRect.top + lsRect.height / 2 - cRect.top;
      out.push({ d: `M ${upperXfX1} ${upperXfY1} H ${upperXfX1 - 30} V ${tdY2} H ${tdX2}`, dashed: true });
      out.push({ d: `M ${lowerXfX1} ${lowerXfY1} H ${lowerXfX1 - 30} V ${tdY2} H ${tdX2}`, dashed: true });
    }
    setSvgPaths(out);
  }, [containerRef, upperSfRef, lowerSfRef, finalRef, thirdRef]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return undefined;
    recalc();
    let timer = null;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(recalc, 50);
    };
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(onResize);
      ro.observe(c);
      return () => { ro.disconnect(); clearTimeout(timer); };
    }
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); clearTimeout(timer); };
  }, [recalc, paths]);

  return (
    <svg class="bracket-tree-center-connectors" xmlns="http://www.w3.org/2000/svg">
      {svgPaths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          class={p.dashed ? "bracket-tree-center-connector bracket-tree-center-connector--dashed" : "bracket-tree-center-connector"}
          fill="none"
        />
      ))}
    </svg>
  );
}

function useNarrowViewport(maxWidth = 700) {
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

// ponytail: Fallback 仍用旧的 5 段垂直堆叠 (旧 .bracket-stage CSS) — 仅窄屏触发 (< 700px).
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
      <div class="bracket-card-num">Match {matchNum}</div>
      <div class="bracket-card-row">
        <div class="bracket-card-team">
          {t1 ? (
            <>
              <span class="bracket-card-flag"><TeamFlag code={t1.flag} size={12} /></span>
              <span class="bracket-card-name">{t1.cn || slot1.team.name}</span>
            </>
          ) : (
            <span class="bracket-card-placeholder">{slotPlaceholder(slot1)}</span>
          )}
        </div>
        <div class="bracket-card-vs">vs</div>
        <div class="bracket-card-team">
          {t2 ? (
            <>
              <span class="bracket-card-flag"><TeamFlag code={t2.flag} size={12} /></span>
              <span class="bracket-card-name">{t2.cn || slot2.team.name}</span>
            </>
          ) : (
            <span class="bracket-card-placeholder">{slotPlaceholder(slot2)}</span>
          )}
        </div>
      </div>
      <MatchMeta match={match} />
      <div class="bracket-card-status">
        {status === "pending" && <span class="bracket-badge">未赛</span>}
        {status === "projected" && <span class="bracket-badge bracket-badge--lock"><IconLock size={12} /> 待定</span>}
        {status === "live" && <span class="bracket-badge bracket-badge--live">● 进行中</span>}
        {status === "final" && <span class="bracket-badge bracket-badge--done"><IconCheck size={12} /> 已完赛</span>}
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

// ponytail: 自然宽度 = 4 列宽 (R32,R16,QF,SF) + FinalCenter + 4 个 gap.
// 每列 168px, gap 32px, FinalCenter 220px → 168*4 + 32*4 + 220 = 1020.
const BRACKET_NATURAL_WIDTH = 168 * 4 + 32 * 4 + 220;

export function BracketTree({ snapshot, onMatchClick }) {
  const narrow = useNarrowViewport(700);

  if (!snapshot) return null;
  if (narrow) {
    return <BracketTreeFallback snapshot={snapshot} onMatchClick={onMatchClick} />;
  }

  const halves = splitBracketByHalf(snapshot);
  if (!halves) return null;

  const containerRef = useRef(null);
  const upperSfRef = useRef(null);
  const lowerSfRef = useRef(null);
  const finalRef = useRef(null);
  const thirdRef = useRef(null);

  useBracketScale(containerRef, BRACKET_NATURAL_WIDTH);

  return (
    <div class="bracket-tree bracket-tree--tree" ref={containerRef}>
      <FinalCenterConnectors
        containerRef={containerRef}
        upperSfRef={upperSfRef}
        lowerSfRef={lowerSfRef}
        finalRef={finalRef}
        thirdRef={thirdRef}
        paths={snapshot}
      />
      <div class="bracket-tree-grid">
        <div class="bracket-tree-half bracket-tree-half--upper">
          <HalfColumn stage="sf" matches={halves.upperSF} onMatchClick={onMatchClick} registerRef={(el) => { upperSfRef.current = el; }} />
          <HalfColumn stage="qf" matches={halves.upperQF} onMatchClick={onMatchClick} />
          <HalfColumn stage="r16" matches={halves.upperR16} onMatchClick={onMatchClick} />
          <HalfColumn stage="r32" matches={halves.upperR32} onMatchClick={onMatchClick} />
        </div>
        <div class="bracket-tree-center">
          <div class="bracket-tree-center-final" ref={finalRef}>
            {halves.final ? (
              <FinalTrophyCard match={halves.final} onClick={onMatchClick} />
            ) : (
              <div class="bracket-tree-center-placeholder">决赛 待定</div>
            )}
          </div>
          <div class="bracket-tree-center-third" ref={thirdRef}>
            {halves.third ? (
              <ThirdPlaceCard match={halves.third} onClick={onMatchClick} />
            ) : (
              <div class="bracket-tree-center-placeholder bracket-tree-center-placeholder--small">季军赛 待定</div>
            )}
          </div>
        </div>
        <div class="bracket-tree-half bracket-tree-half--lower">
          <HalfColumn stage="r32" matches={halves.lowerR32} onMatchClick={onMatchClick} />
          <HalfColumn stage="r16" matches={halves.lowerR16} onMatchClick={onMatchClick} />
          <HalfColumn stage="qf" matches={halves.lowerQF} onMatchClick={onMatchClick} />
          <HalfColumn stage="sf" matches={halves.lowerSF} onMatchClick={onMatchClick} registerRef={(el) => { lowerSfRef.current = el; }} />
        </div>
      </div>
    </div>
  );
}

export default BracketTree;

// ponytail: 模块级导出 splitBracketByHalf 供测试直接验证镜像分割逻辑.
export { splitBracketByHalf };