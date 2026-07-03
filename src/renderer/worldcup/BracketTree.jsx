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
import { toBeijingTime } from "./timeUtils.js";

// ponytail: 2026 世界杯 16 主办城市 × 主球场中英映射. cup_finals.txt 给的是英文
// "Los Angeles (Inglewood)" 这种, 在卡片 meta 行里翻译成中文.
const VENUE_CN = {
  "Los Angeles (Inglewood)": "洛杉矶 SoFi 体育场",
  "Boston (Foxborough)": "波士顿吉列体育场",
  "Monterrey (Guadalupe)": "蒙特雷 BBVA 体育场",
  "Houston": "休斯顿 NRG 体育场",
  "New York/New Jersey (East Rutherford)": "纽约/新泽西大都会人寿体育场",
  "Dallas (Arlington)": "达拉斯 AT&T 体育场",
  "Mexico City": "墨西哥城阿兹特克体育场",
  "Atlanta": "亚特兰大梅赛德斯-奔驰体育场",
  "San Francisco Bay Area (Santa Clara)": "旧金山湾区李维斯体育场",
  "Seattle": "西雅图世纪互联体育场",
  "Toronto": "多伦多 BMO 体育场",
  "Vancouver": "温哥华 BC Place",
  "Miami (Miami Gardens)": "迈阿密 Hard Rock 体育场",
  "Kansas City": "堪萨斯城箭头体育场",
};
function venueCn(venue) {
  if (!venue) return "";
  return VENUE_CN[venue] || venue;
}

// ponytail: 历史 bracket snapshot 里有些 slot.team.name 被 TXT/手工数据污染
// 成 "a.e.t. (1-1, 0-1), 3-4 pen. Paraguay" 这种. 既要还队名, 也要把
// 隐藏在污染串里的 et/pen 比分救出来 (上游 0 来源, 自救一次).
//
// 已知污染格式 (来自 openfootball cup_finals 历史 fixtures):
//   "a.e.t. (1-1, 0-1), 3-4 pen. Paraguay"   → 90 分 1-1, 加时 0-1, 点球 3-4 巴拉圭胜
//   "a.e.t. (1-1, 0-0), 2-3 pen. Morocco"    → 90 分 1-1, 加时 0-0, 点球 2-3 摩洛哥胜
//   "a.e.t. (2-2, 0-1) Senegal"              → 90 分 2-2, 加时 0-1 塞内加尔胜 (无点球)
const AET_PEN_RE = /^a\.e\.t\.\s*\(\s*(\d+)-(\d+)\s*(?:,\s*(\d+)-(\d+))?\s*\)\s*(?:,\s*(\d+)-(\d+)\s*pen\.?)?\s+(.+)$/i;
const AET_ONLY_RE = /^a\.e\.t\.\s*\(\s*(\d+)-(\d+)\s*(?:,\s*(\d+)-(\d+))?\s*\)\s+([A-Za-zÀ-ÿ].+)$/i;

function cleanTeamName(raw) {
  if (!raw || typeof raw !== "string") return raw;
  // 整段都是污染串
  const aet = raw.match(AET_PEN_RE);
  if (aet) return aet[aet.length - 1].trim();
  const aetOnly = raw.match(AET_ONLY_RE);
  if (aetOnly) return aetOnly[aetOnly.length - 1].trim();
  return raw;
}

// ponytail: DEPRECATED 自 v2.71. 从污染串 (历史脏数据) 反推 et/pen 比分.
// v2.66-v2.70 一直用, 但实测污染串是手工脏数据, 跟真实比赛不符 (M82
// ft=[3,2] 但污染串写"2-2 0-1" → 90 分决胜负, 污染串说不过加时不攻自破).
// 即便 ft 一致也无法验证 et/pen 数字真伪. 唯一可信来源是 score.et/score.pen
// 真字段. EtPenTags 已停用本函数. 留代码方便将来 debug / 复用.
function extractEtPenFromName(raw, ft) {
  if (!raw || typeof raw !== "string") return null;
  const m = raw.match(AET_PEN_RE);
  if (m) {
    const claimedFt = [Number(m[1]), Number(m[2])];
    if (Array.isArray(ft) && ft.length === 2) {
      if (ft[0] !== claimedFt[0] || ft[1] !== claimedFt[1]) return null;
    }
    const et = m[3] != null ? [Number(m[3]), Number(m[4])] : null;
    const pen = m[5] != null ? [Number(m[5]), Number(m[6])] : null;
    return { et, pen };
  }
  const m2 = raw.match(AET_ONLY_RE);
  if (m2) {
    const claimedFt = [Number(m2[1]), Number(m2[2])];
    if (Array.isArray(ft) && ft.length === 2) {
      if (ft[0] !== claimedFt[0] || ft[1] !== claimedFt[1]) return null;
    }
    const et = m2[3] != null ? [Number(m2[3]), Number(m2[4])] : null;
    return { et, pen: null };
  }
  return null;
}

function teamCn(slot) {
  if (!slot || !slot.team) return null;
  // ponytail: 用 displayTeam 拿 ISO-2 code (FLAG_SVGS 的 key), 不要用 .substring(0,2)
  // 截队名 (那种 "South Africa" → "SO" 是错的, 南非 ISO 是 ZA).
  const cleaned = cleanTeamName(slot.team.name);
  const d = displayTeam(cleaned);
  return { flag: d.flag, cn: d.cn, raw: cleaned };
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
  // ponytail: 转北京时间 + 中文球场. bj.time 是 "HH:MM", 当 shift>0 时附 "(+1日)" 等.
  const bj = toBeijingTime(k.time || "", k.timezone || "", k.date);
  const shift = bj.date && k.date && bj.date !== k.date;
  const time = bj.time
    ? `${bj.time}${shift ? ` (北京时间, 当地 ${bj.date})` : " 北京时间"}`
    : "";
  const venue = venueCn(k.venue);
  return (
    <div class="bracket-card-meta">
      {time && <span class="bracket-card-meta-time"><IconClock size={11} /> {time}</span>}
      {venue && <span class="bracket-card-meta-venue">@ {venue}</span>}
    </div>
  );
}

// ponytail: v2.64 — 百度/ESPN 风卡片: 头部 Match num + 状态徽章 (右对齐),
// 主行 队1 vs 队2 (居中比分/vs), 底部 meta 一行 (时间 + 球场).
// 比分 status=final/live 时显示数字 vs 灰色, status=pending/projected 显示 vs.
// 实际 score shape: { ft: [home, away], ht: [h, a], et?, pen? } (来自 cup_finals.txt + state.json)
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

// ponytail: v2.68 加时/点球标记从比分中拆出, 移到 head 行 (跟 "Match 73" 同行).
//
// v2.69 显示具体比分 "加时 0:1" / "点球 3:4".
//
// v2.71: **禁用** slot.team.name 污染串自救. 历史自 v2.66 起在用
// "a.e.t. (1-1, 0-1), 3-4 pen. XXX" 串反推 et/pen 数字, 但实测这串
// 是手工脏数据, 跟真实比赛不符 (例 M82 ft=[3,2] 但污染串写 2-2, 表示
// 90 分根本没加时). 即便 ft 一致时 (M74/M75), 污染串里的 et/pen 数字
// 也不可验证. 唯一可信来源是 score.et / score.pen 真字段.
//
// v2.74: 加 wc-2026.com 第四层源 (scores-fetcher-wc2026.js), 抓 HTML 后
// 通过 mergeWc2026EtPen 注入 score.pen. 当前能补: M74 pen=[3,4], M75
// pen=[2,3]. 加时 (score.et) 主页不提供, 等未来 detail 页 scraper
// (zerozero / 球迷屋, 抓 detail 页成本高 + 反爬, 暂不做).
// 不显示 etpen tag. 将来 ESL 流 (scores-fetcher) 抓到 et/pen 时自动显示.
function EtPenTags({ match }) {
  const { status, score } = match;
  if (status !== "final" && status !== "live") return null;
  const etArr = Array.isArray(score && score.et) && score.et.length === 2 ? score.et : null;
  const penArr = Array.isArray(score && score.pen) && score.pen.length === 2 ? score.pen : null;
  if (!etArr && !penArr) return null;
  const fmt = (arr) => (arr && arr.length === 2 ? `${arr[0]}:${arr[1]}` : "");
  const etLabel = etArr ? (fmt(etArr) ? `加时 ${fmt(etArr)}` : "加时") : null;
  const penLabel = penArr ? (fmt(penArr) ? `点球 ${fmt(penArr)}` : "点球") : null;
  return (
    <span class="bracket-card-etpen">
      {etLabel && <span class="bracket-card-etpen-tag">{etLabel}</span>}
      {penLabel && <span class="bracket-card-etpen-tag">{penLabel}</span>}
    </span>
  );
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
        <span class="bracket-card-head-right">
          <EtPenTags match={match} />
          <StatusBadge status={status} />
        </span>
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