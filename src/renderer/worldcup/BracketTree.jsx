/**
 * src/renderer/worldcup/BracketTree.jsx
 *
 * World Cup 淘汰赛对阵 — v2 水平 bracket tree 渲染
 *
 * 5 阶段水平 flex 排列 (R32 → R16 → QF → SF → Final/Third)
 * MatchCard 上下两队版式: team1 (上) / 分隔线 / team2 (下), 比分右对齐
 * 占位 slot: 显示「A 组第 1」/「R32 #73 胜者」/「第 3 名 (A/B/C/D/F)」/IconLock 待定
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
import { TeamFlag, IconLock, IconCheck, IconClock } from "../components/icons.jsx";

const STAGE_LABELS = {
  r32: "1/16 决赛",
  r16: "1/8 决赛",
  qf: "1/4 决赛",
  sf: "半决赛",
  final: "决赛",
  third: "季军赛",
};

// ponytail: v2.56 单 stage 视图 — tab 选 stage, 同时展示当前 + 下一 stage.
// 顺序: r32 → r16 → qf → sf → final (Final 是终局, 下一 stage 显示 third + final 双卡? 用户选了 tab 只看决赛)
// 这里只显示 2 列: left=currentStage, right=nextStage (末位 stage 则右侧为空).
const STAGE_ORDER = ["r32", "r16", "qf", "sf", "final"];
const STAGE_NEXT = { r32: "r16", r16: "qf", qf: "sf", sf: "final", final: null };
// ponytail: STAGE_PAIRS 重置 — 单 stage 视图只画 1 对 connector (current→next)
const STAGE_PAIRS_SINGLE = [
  ["current", "next", 2],
];

const FALLBACK_STAGE_LABELS = {
  r32: { title: "1/16 决赛 (Round of 32)", count: 16 },
  r16: { title: "1/8 决赛 (Round of 16)", count: 8 },
  qf:  { title: "1/4 决赛 (Quarter-finals)", count: 4 },
  sf:  { title: "半决赛 (Semi-finals)", count: 2 },
  final: { title: "决赛", count: 1 },
  third: { title: "季军赛", count: 1 },
};

// ponytail: v2.56 单 stage 视图 — STAGE_PAIRS 用 current→next 一对.
// sf→final fanIn=1 (sf 2 张 L/R 收 1 张 final).
const STAGE_PAIRS = STAGE_PAIRS_SINGLE;

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

// ponytail: 把 cup_finals.txt 拉来的 kickoff (date/time/timezone/venue) 内嵌到每张 card 底部.
// 没 kickoff → 返回 null (小组赛未完赛时不会破坏现有视觉).
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

  // ponytail: 单行布局 — flag 队1 [比分/待定] flag 队2, meta 一行. 比旧的
  // head + divider + 2 个 team 行 + meta + status 紧凑一半. R32 列 16 张卡整体高度砍约 40%.
  return (
    <div
      ref={(el) => { if (el) el.__matchData = match; }}
      class={`bracket-card bracket-card--${status}`}
      onClick={() => onClick && onClick(match)}
    >
      <div class="bracket-card-head">M{matchNum}</div>
      <div class="bracket-card-row">
        <div class="bracket-card-team bracket-card-team--left">
          {t1 ? (
            <>
              <span class="bracket-card-flag"><TeamFlag code={t1.flag} size={12} /></span>
              <span class="bracket-card-name">{t1.cn || slot1.team.name}</span>
            </>
          ) : (
            <span class="bracket-card-placeholder">{slotPlaceholder(slot1)}</span>
          )}
        </div>
        {match.score && match.score.ft ? (
          <span class="bracket-card-score bracket-card-score--inline">{match.score.ft[0]} - {match.score.ft[1]}</span>
        ) : (
          <span class="bracket-card-vs">vs</span>
        )}
        <div class="bracket-card-team bracket-card-team--right">
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
  const headText = kind === "final" ? `决赛 · M${matchNum}` : `季军 · M${matchNum}`;
  return (
    <div
      ref={(el) => { if (el) el.__matchData = match; }}
      class={`bracket-card ${cls} bracket-card--${status}`}
      onClick={() => onClick && onClick(match)}
    >
      <div class="bracket-card-head">{headText}</div>
      <div class="bracket-card-row">
        <div class="bracket-card-team bracket-card-team--left">
          {t1 ? (
            <>
              <span class="bracket-card-flag"><TeamFlag code={t1.flag} size={12} /></span>
              <span class="bracket-card-name">{t1.cn || slot1.team.name}</span>
            </>
          ) : (
            <span class="bracket-card-placeholder">{slotPlaceholder(slot1)}</span>
          )}
        </div>
        {match.score && match.score.ft ? (
          <span class="bracket-card-score bracket-card-score--inline">{match.score.ft[0]} - {match.score.ft[1]}</span>
        ) : (
          <span class="bracket-card-vs">vs</span>
        )}
        <div class="bracket-card-team bracket-card-team--right">
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
      <div class="bracket-card-status">{statusBadge(status)}</div>
    </div>
  );
}

function StageColumn({ stage, matches, onMatchClick, columnRef }) {
  const matchList = Array.isArray(matches) ? matches : (matches ? [matches] : []);
  // ponytail: v2.56 单 stage 视图 — final/third 用 FinalMatchCard 大样式突出.
  const renderCard = (m) => {
    if (stage === "final") return <FinalMatchCard key={m.matchNum} match={m} kind="final" onClick={onMatchClick} />;
    if (stage === "third") return <FinalMatchCard key={m.matchNum} match={m} kind="third" onClick={onMatchClick} />;
    return <MatchCard key={m.matchNum} match={m} onClick={onMatchClick} />;
  };
  return (
    <div
      ref={columnRef}
      class={`bracket-tree-column bracket-tree-column--${stage}`}
    >
      <div class="bracket-tree-column-title">{STAGE_LABELS[stage] || stage}</div>
      <div class="bracket-tree-column-cards">
        {matchList.map((m) => m ? renderCard(m) : null)}
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
              <span class="bracket-card-flag"><TeamFlag code={t1.flag} size={12} /></span>
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
              <span class="bracket-card-flag"><TeamFlag code={t2.flag} size={12} /></span>
              <span class="bracket-card-name">{t2.cn || slot2.team.name}</span>
            </>
          ) : (
            <span class="bracket-card-placeholder">{p2}</span>
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

export function BracketTree({ snapshot, onMatchClick, currentStage = "r32" }) {
  const narrow = useNarrowViewport(900);

  // ponytail: v2.62 — 全景模式: 5 个 stage 全部展示, 卡片缩小, 水平滚动.
  if (currentStage === "overview") {
    return <BracketOverview snapshot={snapshot} onMatchClick={onMatchClick} />;
  }
  // ponytail: v2.56 单 stage 视图 — 2 column refs (current + next), connector 只画这一对.
  const columnRefs = useRef({
    container: null,
    currentCol: null,
    nextCol: null,
  });
  const { paths, triggerRecalc } = useConnectors(columnRefs);

  useEffect(() => { triggerRecalc(); }, [snapshot, currentStage, triggerRecalc]);

  if (!snapshot) return null;
  if (narrow) {
    return <BracketTreeFallback snapshot={snapshot} onMatchClick={onMatchClick} />;
  }

  // ponytail: v2.56 单 stage 视图 — tab 选 stage 后, 左侧展示当前 stage, 右侧展示下一 stage (若有).
  // 例如 tab=r16 → 左 r16 (8 张), 右 qf (4 张). tab=final → 左 final, 右空.
  const stage = currentStage;
  const nextStage = STAGE_NEXT[stage];
  const stageMatches = Array.isArray(snapshot[stage]) ? snapshot[stage] : (snapshot[stage] ? [snapshot[stage]] : []);
  const nextMatches = nextStage
    ? (Array.isArray(snapshot[nextStage]) ? snapshot[nextStage] : (snapshot[nextStage] ? [snapshot[nextStage]] : []))
    : [];

  return (
    <div class="bracket-tree bracket-tree--single" ref={(el) => { columnRefs.current.container = el; }}>
      <BracketConnectors paths={paths} />
      <div class="bracket-tree-single-cols">
        <StageColumn stage={stage} matches={stageMatches} onMatchClick={onMatchClick}
          columnRef={(el) => { columnRefs.current.currentCol = el; }} />
        {nextStage && (
          <StageColumn stage={nextStage} matches={nextMatches} onMatchClick={onMatchClick}
            columnRef={(el) => { columnRefs.current.nextCol = el; }} />
        )}
      </div>
    </div>
  );
}

// ponytail: v2.62 — 全景图: 5 个 stage 横排, 卡片缩小, 一屏看完整淘汰赛对阵.
// 不画 SVG connector (5 列连线计算量大且视觉混乱), 改用顶部 stage label 标识 stage 顺序.
function BracketOverview({ snapshot, onMatchClick }) {
  const stages = [
    { id: "r32", label: "1/16 决赛" },
    { id: "r16", label: "1/8 决赛" },
    { id: "qf", label: "1/4 决赛" },
    { id: "sf", label: "半决赛" },
    { id: "final", label: "决赛" },
  ];
  return (
    <div class="bracket-tree bracket-tree--overview" role="region" aria-label="完整对阵全景">
      <div class="bracket-tree-overview-cols">
        {stages.map((s) => {
          const raw = snapshot[s.id];
          const matches = Array.isArray(raw) ? raw : (raw ? [raw] : []);
          return (
            <div key={s.id} class={`bracket-tree-column bracket-tree-column--${s.id}`}>
              <div class="bracket-tree-column-title">{s.label}</div>
              <div class="bracket-tree-column-cards">
                {matches.length === 0 ? (
                  <div class="bracket-tree-column-empty">暂无</div>
                ) : matches.map((m) => (
                  s.id === "final" || s.id === "third"
                    ? <FinalMatchCard key={m.matchNum} match={m} kind={s.id} onClick={onMatchClick} />
                    : <MatchCard key={m.matchNum} match={m} onClick={onMatchClick} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default BracketTree;
