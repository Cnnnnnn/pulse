/**
 * src/renderer/football-value/FootballValuePage.tsx
 *
 * 球员身价榜主页面（按 2026-08-02 设计规范重构）：
 *   FeatureHeader（品牌 + 搜索 + 刷新）
 *   → 信任条(TrustBar)
 *   → 部分源失败横幅
 *   → 控制条(位置多选 / 联赛 / 身价区间多选 / 排序)
 *   → 筛选摘要 token
 *   → 最贵 XI 阵容(BestXI，4-3-3 足球场布局，条件渲染)
 *   → 表格(可排序表头 + 热度条 + 位置色) / <720px 卡片列表
 *   → 脚注
 *   → 右侧详情抽屉(DrawerShell + 焦点陷阱 + 前后导航 + 同位置参照)
 *
 * 设计约定：采集时间语义（信任条显示"更新于 X天前 (HH:MM)"）；涨跌列已移除
 * （Transfermarkt 季度级更新，日常 diff 无意义）。
 */
import { useState, useEffect } from "preact/hooks";
import { FeatureHeader } from "../components/FeatureHeader.tsx";
import { PanelEmpty } from "../components/EmptyState.tsx";
import { DrawerShell } from "../components/DrawerShell.tsx";
import {
  players,
  loading,
  refreshing,
  error,
  source,
  stale,
  isSample,
  fetchedAt,
  errors,
  maxValueEur,
  activePositions,
  activeLeague,
  activeBands,
  sortKey,
  sortDir,
  searchQuery,
  loadBoard,
  refresh,
  setPosition,
  setLeague,
  toggleBand,
  cycleSort,
  setSort,
  setSearchQuery,
  clearSearchQuery,
  clearFilters,
  positionCounts,
  leagueCounts,
  bandCounts,
  leagueOptions,
  getDisplayed,
  hasSampleSource,
  isPartial,
  hasActiveFilters,
  VALUE_BANDS,
  buildBestXI,
  bestXITotalValue,
  FORMATION_433,
} from "./footballValueStore.ts";
import { POSITION_META, POSITION_KEYS, formatValueEur } from "./types.ts";
import type { Player } from "../../shared/football-value-types.ts";

/* ── 工具 ── */
function fmtTime(iso: any) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
// 相对时间："3天前" / "昨天" / "今天" / "刚刚"（采集新鲜度，配合 fmtTime 用）
function fmtAgo(iso: any): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "刚刚";
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / dayMs);
  if (days >= 3) return `${days}天前`;
  if (days === 2) return "2天前";
  if (days === 1) return "昨天";
  // 同一天：显示小时级
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}小时前`;
  const mins = Math.floor(diffMs / (60 * 1000));
  if (mins >= 1) return `${mins}分钟前`;
  return "刚刚";
}
function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function posColorStyle(pos: string): string {
  const v = `--football-pos-${pos.toLowerCase()}`;
  return `background:color-mix(in oklch, var(${v}) 16%, transparent);color:var(${v})`;
}
function val(p: Player): number {
  return Number(p && p.valueEur) || 0;
}
function heatPct(p: Player): number {
  const m = maxValueEur.value || 1;
  return Math.max(4, Math.round((val(p) / m) * 100));
}
// HTML 转义:外部球员/俱乐部/联赛名进 dangerouslySetInnerHTML 前必须转义,
// 防止名字含 <img onerror> 等标签的注入(数据来自 dcaribou R2 CSV)。
function esc(s: any): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// 搜索高亮:先转义全文,再用 <mark> 包住命中的搜索词。
// 无搜索词时也转义(纯展示),保证 hl() 返回值永远可安全注入。
function hl(text: string, q: string): string {
  const safe = esc(text);
  if (!q) return safe;
  const i = safe.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return safe;
  return (
    safe.slice(0, i) +
    "<mark>" +
    safe.slice(i, i + q.length) +
    "</mark>" +
    safe.slice(i + q.length)
  );
}

/* ── 信任条 ── */
function TrustBar() {
  const refreshingNow = refreshing.value;
  const partial = isPartial();
  const err = error.value;
  let dot = "var(--text-tertiary)";
  let badge = "加载中";
  let extra = "正在请求数据源…";
  if (err && players.value.length === 0) {
    dot = "var(--color-danger)";
    badge = "加载失败";
    extra = "所有数据源均不可用";
  } else if (partial) {
    dot = "var(--color-warning)";
    badge = "部分源失败";
    extra = `${errors.value.length} 个源不可用，已合并可用数据`;
  } else if (refreshingNow) {
    dot = "var(--accent-primary)";
    badge = "更新中";
    extra = '<span class="football-spin">⟳</span> 后台刷新中';
  } else if (players.value.length === 0) {
    dot = "var(--text-tertiary)";
    badge = "暂无数据";
    extra = "当前没有记录";
  } else {
    dot = "var(--color-success)";
    badge = hasSampleSource() ? "示例数据" : "数据可信";
    const bits = [];
    if (source.value === "cache") bits.push("缓存");
    if (stale.value) bits.push("可能过期");
    if (fetchedAt.value) bits.push(`更新于 ${fmtAgo(fetchedAt.value)} ${fmtTime(fetchedAt.value)}`);
    bits.push(`共 ${players.value.length} 名球员`);
    extra = bits.join(" · ") + (hasSampleSource() ? " · 数据为示例" : "");
  }
  return (
    <div class="football-trust">
      <span class="football-trust-dot" style={`background:${dot}`} />
      <span class="football-trust-badge">{badge}</span>
      <span class="football-trust-extra" dangerouslySetInnerHTML={{ __html: extra }} />
      <span class="football-trust-spacer" />
      {source.value === "cache" && <span class="football-trust-tag">缓存</span>}
      {stale.value && <span class="football-trust-tag football-trust-tag-warn">可能过期</span>}
    </div>
  );
}

/* ── 控制条 ── */
const COLS = [
  { key: "rank", label: "#", cls: "football-col-rank" },
  { key: "player", label: "球员", cls: "football-col-player", sort: "name" },
  { key: "value", label: "身价", cls: "football-col-value", sort: "value", right: true },
  { key: "pos", label: "位置", cls: "football-col-pos" },
  { key: "age", label: "年龄", cls: "football-col-age", sort: "age" },
  { key: "club", label: "俱乐部", cls: "football-col-club" },
  { key: "league", label: "联赛", cls: "football-col-league" },
  { key: "nat", label: "国籍", cls: "football-col-nat" },
];

function Controls({ onClearSearch }: { onClearSearch: () => void }) {
  const posC = positionCounts();
  const lgC = leagueCounts();
  const bandC = bandCounts();
  const leagues = leagueOptions();
  return (
    <div class="football-controls">
      <div class="football-ctrl-group" role="group" aria-label="按位置筛选">
        <span class="football-ctrl-label">位置</span>
        {POSITION_KEYS.map((k) => (
          <button
            type="button"
            key={k}
            class={`football-chip${activePositions.value.has(k) ? " football-chip-active" : ""}`}
            aria-pressed={activePositions.value.has(k)}
            disabled={posC[k] === 0 && !activePositions.value.has(k)}
            onClick={() => setPosition(k)}
          >
            {POSITION_META[k].label} <span class="football-chip-count">{posC[k] || 0}</span>
          </button>
        ))}
      </div>

      <div class="football-ctrl-group">
        <span class="football-ctrl-label">联赛</span>
        <select
          class="football-select"
          aria-label="按联赛筛选"
          value={activeLeague.value}
          onChange={(e: any) => setLeague(e.currentTarget.value)}
        >
          <option value="all">全部联赛 ({lgC.all || 0})</option>
          {leagues.map((lg) => (
            <option key={lg} value={lg}>
              {lg} ({lgC[lg] || 0})
            </option>
          ))}
        </select>
      </div>

      <div class="football-ctrl-group" role="group" aria-label="按身价区间筛选">
        <span class="football-ctrl-label">身价</span>
        {VALUE_BANDS.map((b) => (
          <button
            type="button"
            key={b.key}
            class={`football-chip${activeBands.value.has(b.key) ? " football-chip-active" : ""}`}
            aria-pressed={activeBands.value.has(b.key)}
            disabled={bandC[b.key] === 0 && !activeBands.value.has(b.key)}
            onClick={() => toggleBand(b.key)}
          >
            {b.label} <span class="football-chip-count">{bandC[b.key] || 0}</span>
          </button>
        ))}
      </div>

      <div class="football-ctrl-group football-ctrl-sort">
        <span class="football-ctrl-label">排序</span>
        <select
          class="football-select"
          aria-label="排序方式"
          value={sortDir.value ? `${sortKey.value}-${sortDir.value}` : `${sortKey.value}-desc`}
          onChange={(e: any) => {
            const [k, d] = e.currentTarget.value.split("-");
            setSort(k, (d as any) || null);
          }}
        >
          <option value="value-desc">身价 从高到低</option>
          <option value="value-asc">身价 从低到高</option>
          <option value="age-asc">年龄 从小到大</option>
          <option value="age-desc">年龄 从大到小</option>
          <option value="name-asc">姓名 A→Z</option>
        </select>
      </div>
    </div>
  );
}

function Summary({ onClearSearch }: { onClearSearch: () => void }) {
  if (!hasActiveFilters()) return null;
  const tokens: { label: string; clear: () => void }[] = [];
  const q = (searchQuery.value || "").trim();
  if (q) tokens.push({ label: `搜索：${q}`, clear: () => { onClearSearch(); } });
  if (activeLeague.value !== "all")
    tokens.push({ label: `联赛：${activeLeague.value}`, clear: () => setLeague("all") });
  activePositions.value.forEach((k: string) =>
    tokens.push({ label: `位置：${POSITION_META[k].label}`, clear: () => setPosition(k) })
  );
  VALUE_BANDS.forEach((b) => {
    if (activeBands.value.has(b.key))
      tokens.push({ label: `身价：${b.label}`, clear: () => toggleBand(b.key) });
  });
  return (
    <div class="football-summary">
      <span class="football-summary-label">已筛选</span>
      {tokens.map((t, i) => (
        <span class="football-token" key={i}>
          {t.label}
          <button type="button" aria-label="移除筛选" onClick={t.clear}>
            ×
          </button>
        </span>
      ))}
      <button type="button" class="football-token-clear" onClick={() => { clearFilters(); onClearSearch(); }}>
        清除全部
      </button>
    </div>
  );
}

/* ── 最贵 XI 阵容（4-3-3 足球场布局，招牌视图）── */
function BestXI({ list, onOpen }: { list: Player[]; onOpen: (id: string) => void }) {
  const q = (searchQuery.value || "").trim();
  const shown =
    !q &&
    !loading.value &&
    error.value == null &&
    players.value.length > 0 &&
    list.length >= 6 &&
    sortDir.value !== "asc";
  if (!shown) return null;

  const xi = buildBestXI(list);
  const total = bestXITotalValue(xi);
  const filled = xi.flat().filter((p) => p).length;

  return (
    <div class="football-xi-wrap">
      <div class="football-xi-title">
        世界最贵 XI <span>4-3-3 · 总身价 {formatValueEur(total)} · {filled}/11</span>
      </div>
      <div class="football-xi-pitch">
        {xi.map((line, lineIdx) => (
          <div class="football-xi-line" key={lineIdx} data-line={FORMATION_433[lineIdx].pos}>
            {line.map((p, slotIdx) => {
              if (!p) {
                return (
                  <div class="football-xi-slot football-xi-empty" key={slotIdx}>
                    <span class="football-xi-avatar football-xi-avatar-empty">—</span>
                    <span class="football-xi-name">空缺</span>
                  </div>
                );
              }
              return (
                <div
                  class="football-xi-slot"
                  key={slotIdx}
                  role="button"
                  tabIndex={0}
                  aria-label={`查看 ${p.name} 详情`}
                  onClick={() => onOpen(p.id)}
                  onKeyDown={(e: any) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(p.id);
                    }
                  }}
                  dangerouslySetInnerHTML={{
                    __html:
                      `<div class="football-xi-avatar" style="${posColorStyle(p.position)}">${esc(initials(p.name))}</div>` +
                      `<div class="football-xi-name">${hl(p.name, q)}</div>` +
                      `<div class="football-xi-meta">${esc(p.club) || "—"}</div>` +
                      `<div class="football-xi-value">${esc(p.valueLabel) || "—"}</div>`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 表格行 ── */
function PlayerRow({ p, rank, q, onOpen }: { p: Player; rank: number; q: string; onOpen: (id: string) => void }) {
  const top3 = rank <= 3;
  const medalColor = ["", "var(--football-medal-gold)", "var(--football-medal-silver)", "var(--football-medal-bronze)"][rank];
  const star = val(p) >= 150e6 ? <span class="football-star">★ TOP</span> : null;
  return (
    <tr
      class={p.isSample ? "football-row-sample" : undefined}
      tabIndex={0}
      onClick={() => onOpen(p.id)}
      onKeyDown={(e: any) => {
        if (e.key === "Enter") onOpen(p.id);
      }}
    >
      <td class="football-col-rank">
        {top3 ? (
          <span class="football-medal-dot" style={`background:${medalColor}`} />
        ) : null}
        {rank}
      </td>
      <td class="football-col-player">
        <div class="football-player">
          {p.portraitUrl ? (
            <img class="football-portrait" src={p.portraitUrl} alt="" loading="lazy" />
          ) : (
            <span class="football-portrait football-portrait-fallback" style={posColorStyle(p.position)}>
              {initials(p.name)}
            </span>
          )}
          <span class="football-player-name">
            <span dangerouslySetInnerHTML={{ __html: hl(p.name, q) }} />
            {star}
            <span class="football-sub">{p.club || "—"} · {p.league || "—"}</span>
          </span>
        </div>
      </td>
      <td class="football-col-value">
        <span class="football-value-cell">
          <span class="football-value">{p.valueLabel || "—"}</span>
          <span class="football-heatbar">
            <i style={`width:${heatPct(p)}%`} />
          </span>
        </span>
      </td>
      <td class="football-col-pos">
        <span class="football-pos-chip" data-p={p.position}>
          {p.position}
        </span>
      </td>
      <td class="football-col-age">{p.age ?? "—"}</td>
      <td class="football-col-club" dangerouslySetInnerHTML={{ __html: hl(p.club || "—", q) }} />
      <td class="football-col-league" dangerouslySetInnerHTML={{ __html: hl(p.league || "—", q) }} />
      <td class="football-col-nat">
        {p.nationality ? `${p.nationality}` : "—"}
      </td>
    </tr>
  );
}

/* ── 骨架屏 ── */
function Skeleton() {
  const pod = (
    <div class="football-podium">
      {[0, 1, 2].map((i) => (
        <div class={`football-sk-card${i === 1 ? " tall" : ""}`} key={i}>
          <span class="football-sk football-sk-circle" />
          <span class="football-sk" style="width:80px;height:14px" />
          <span class="football-sk" style="width:120px;height:20px" />
        </div>
      ))}
    </div>
  );
  const rows = [];
  for (let i = 0; i < 8; i++) {
    rows.push(
      <tr key={i}>
        <td class="football-col-rank"><span class="football-sk" style="width:20px;height:14px" /></td>
        <td class="football-col-player"><span class="football-sk" style="width:160px;height:16px" /></td>
        <td class="football-col-value" style="text-align:right"><span class="football-sk" style="width:60px;height:16px;margin-left:auto" /></td>
        <td class="football-col-pos"><span class="football-sk" style="width:32px;height:14px" /></td>
        <td class="football-col-age"><span class="football-sk" style="width:24px;height:14px" /></td>
        <td class="football-col-club"><span class="football-sk" style="width:120px;height:14px" /></td>
        <td class="football-col-league"><span class="football-sk" style="width:64px;height:14px" /></td>
        <td class="football-col-nat"><span class="football-sk" style="width:80px;height:14px" /></td>
      </tr>
    );
  }
  return (
    <div class="football-skeleton">
      {pod}
      <table class="football-table">
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c.key} class={c.cls}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

/* ── 详情抽屉 ── */
function PlayerDrawer({ id, onClose, onNavigate }: { id: string | null; onClose: () => void; onNavigate: (id: string) => void }) {
  const list = getDisplayed();
  const idx = id ? list.findIndex((p) => p.id === id) : -1;
  const open = idx >= 0;

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const drawer = document.querySelector(".football-drawer") as HTMLElement | null;
    const f = drawer
      ? drawer.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
      : [];
    if (f.length) f[0].focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab" || !f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    };
  }, [id]);

  if (!open || !id) return null;
  const p = list[idx];
  const rank = idx + 1;
  const sharePct = maxValueEur.value > 0 ? Math.round((val(p) / maxValueEur.value) * 100) : 0;
  const peers = list
    .filter((x) => x.position === p.position && x.id !== p.id)
    .slice()
    .sort((a, b) => val(b) - val(a))
    .slice(0, 5);

  const step = (dir: number) => {
    const ni = idx + dir;
    if (ni >= 0 && ni < list.length) onNavigate(list[ni].id);
  };

  const body = (
    <div class="football-drawer-body">
      <div class="football-dr-id">
        {p.portraitUrl ? (
          <img class="football-dr-avatar" style={posColorStyle(p.position)} src={p.portraitUrl} alt="" />
        ) : (
          <span class="football-dr-avatar" style={posColorStyle(p.position)}>
            {initials(p.name)}
          </span>
        )}
        <div>
          <div class="football-dr-name">{p.name}</div>
          <div class="football-dr-sub">
            {p.nationality ? `${p.nationality} · ` : ""}
            {POSITION_META[p.position] ? POSITION_META[p.position].label : p.position} ({p.position})
          </div>
          <div class="football-dr-sub">
            {p.club || "—"} · {p.league || "—"}
          </div>
        </div>
      </div>

      <div class="football-dr-hero">
        <div class="football-dr-value">{p.valueLabel || "—"}</div>
        <div class="football-dr-deltarow">
          <span class="football-dr-dim">
            采集于 {fetchedAt.value ? `${fmtAgo(fetchedAt.value)} ${fmtTime(fetchedAt.value)}` : "—"}
            {stale.value ? " · 可能过期" : ""}
          </span>
        </div>
      </div>

      <div class="football-kpis">
        <div class="football-kpi">
          <div class="football-kpi-label">年龄</div>
          <div class="football-kpi-value">{p.age ?? "—"}</div>
        </div>
        <div class="football-kpi">
          <div class="football-kpi-label">位置</div>
          <div class="football-kpi-value">{p.position}</div>
        </div>
        <div class="football-kpi">
          <div class="football-kpi-label">联赛</div>
          <div class="football-kpi-value football-kpi-sm">{p.league || "—"}</div>
        </div>
      </div>

      <div class="football-dr-sec">
        <div class="football-dr-sec-title">身价占全榜峰值</div>
        <div class="football-share-bar">
          <i style={`width:${sharePct}%`} />
        </div>
        <div class="football-share-cap">
          {sharePct}% of {maxValueEur.value ? (maxValueEur.value / 1e6).toFixed(0) + "M" : "—"}（全榜最高身价）
        </div>
      </div>

      <div class="football-dr-sec">
        <div class="football-dr-sec-title">同位置身价参照</div>
        {peers.length ? (
          peers.map((x) => (
            <button type="button" class="football-peer" key={x.id} onClick={() => onNavigate(x.id)}>
              <span class="football-peer-rank">#{list.indexOf(x) + 1}</span>
              <span class="football-peer-name">{x.name}</span>
              <span class="football-peer-val">{x.valueLabel || "—"}</span>
            </button>
          ))
        ) : (
          <div class="football-share-cap">该位置暂无其他球员</div>
        )}
      </div>

      <div class="football-dr-foot">
        <span>数据来源 Transfermarkt · 市场估值 · 仅供参考</span>
      </div>
    </div>
  );

  return (
    <DrawerShell
      open={true}
      onClose={onClose}
      usePortal
      role="dialog"
      ariaLabel={`${p.name} 身价详情`}
      drawerClass="football-drawer"
      overlayClass="football-drawer-overlay"
      title={`#${rank} · ${p.name}`}
      headerActions={
        <>
          <button
            type="button"
            class="football-drawer-nav"
            aria-label="上一位"
            disabled={idx === 0}
            onClick={() => step(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            class="football-drawer-nav"
            aria-label="下一位"
            disabled={idx === list.length - 1}
            onClick={() => step(1)}
          >
            ›
          </button>
        </>
      }
    >
      {body}
    </DrawerShell>
  );
}

/* ── 主页面 ── */
export function FootballValuePage() {
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState(searchQuery.value || "");

  // 搜索防抖 300ms → store
  useEffect(() => {
    if ((searchQuery.value || "") === searchText) return;
    const t = setTimeout(() => setSearchQuery(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  // 进入模块拉数据
  useEffect(() => {
    loadBoard();
  }, []);

  const list = getDisplayed();
  const total = players.value.length;
  const loadingNow = loading.value;
  const refreshingNow = refreshing.value;
  const err = error.value;
  const partial = isPartial();
  const q = (searchQuery.value || "").trim();

  const clearSearch = () => {
    setSearchText("");
    clearSearchQuery();
  };

  const showSkeleton = loadingNow && total === 0;
  const showError = err && total === 0;
  const showEmpty = !err && total === 0;

  return (
    <div class="football-page">
      <FeatureHeader
        className="football-header"
        brand={
          <>
            <span class="football-brand-icon">⚽</span>
            <span>足球球员身价榜</span>
          </>
        }
      >
        <div class="football-search-wrap">
          <span class="football-search-icon">⌕</span>
          <input
            class="football-search"
            type="search"
            placeholder="搜索球员 / 俱乐部 / 联赛 / 国籍…"
            value={searchText}
            aria-label="搜索球员"
            onInput={(e: any) => setSearchText(e.currentTarget.value)}
          />
          {searchText && (
            <button type="button" class="football-search-clear" aria-label="清除搜索" onClick={clearSearch}>
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          onClick={() => refresh()}
          disabled={refreshingNow}
        >
          <span class={refreshingNow ? "football-spin" : undefined}>⟳</span> {refreshingNow ? "刷新中" : "刷新"}
        </button>
      </FeatureHeader>

      <TrustBar />

      {partial && (
        <div class="football-banner">
          <span class="football-banner-icon">⚠</span>
          <span>
            部分数据源不可用，当前展示 <b>{total}</b> 条可用记录。
          </span>
        </div>
      )}

      {!showSkeleton && !showError && !showEmpty && (
        <>
          <Controls onClearSearch={clearSearch} />
          <Summary onClearSearch={clearSearch} />
          <BestXI list={list} onOpen={setDrawerId} />
        </>
      )}

      {showSkeleton && <Skeleton />}

      {showError && (
        <PanelEmpty
          title="加载失败"
          hint={err}
          action={
            <button class="btn btn-secondary btn-sm" onClick={() => refresh()}>
              重试
            </button>
          }
        />
      )}

      {showEmpty && (
        <PanelEmpty
          title="暂无数据"
          hint="请检查网络或稍后刷新"
          action={
            <button class="btn btn-secondary btn-sm" onClick={() => refresh()}>
              刷新
            </button>
          }
        />
      )}

      {!showSkeleton && !showError && !showEmpty && (
        <div class="football-board">
          <table class="football-table">
            <thead>
              <tr>
                {COLS.map((c) => {
                  if (!c.sort) {
                    return (
                      <th key={c.key} class={c.cls} style={c.right ? "text-align:right" : undefined}>
                        {c.label}
                      </th>
                    );
                  }
                  const active = sortKey.value === c.sort;
                  const dir = sortDir.value;
                  const ariaSort = active
                    ? dir === "asc"
                      ? "ascending"
                      : dir === "desc"
                        ? "descending"
                        : "none"
                    : "none";
                  const arrow = active && sortDir.value ? (sortDir.value === "asc" ? "▲" : "▼") : "↕";
                  return (
                    <th key={c.key} class={c.cls} aria-sort={ariaSort} style={c.right ? "text-align:right" : undefined}>
                      <button type="button" class="football-sort-btn" onClick={() => cycleSort(c.sort!)}>
                        {c.label} <span class="football-arrow">{arrow}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {list.map((p: Player, i: number) => (
                <PlayerRow key={`${p.id || p.name}#${i}`} p={p} rank={i + 1} q={q} onOpen={setDrawerId} />
              ))}
            </tbody>
          </table>

          <div class="football-cards">
            {list.map((p: Player, i: number) => {
              return (
                <button type="button" class="football-card" key={`${p.id || p.name}#${i}`} onClick={() => setDrawerId(p.id)}>
                  <span class="football-card-rank">{i + 1}</span>
                  <span class="football-portrait football-portrait-fallback" style={posColorStyle(p.position)}>
                    {initials(p.name)}
                  </span>
                  <span class="football-card-body">
                    <span class="football-card-top">
                      <span class="football-card-name" dangerouslySetInnerHTML={{ __html: hl(p.name, q) }} />
                      <span class="football-value">{p.valueLabel || "—"}</span>
                    </span>
                    <span class="football-card-meta">
                      <span class="football-card-sub">
                        {p.position} · {p.club || "—"}
                      </span>
                    </span>
                    <span class="football-heatbar">
                      <i style={`width:${heatPct(p)}%`} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {list.length === 0 && (
            <PanelEmpty
              title="无匹配项"
              hint="试试调整筛选条件或搜索词"
              action={
                <button class="btn btn-secondary btn-sm" onClick={() => { clearFilters(); clearSearch(); }}>
                  清除筛选
                </button>
              }
            />
          )}
        </div>
      )}

      <div class="football-footnote">
        数据来源：Transfermarkt（经 dcaribou/transfermarkt-datasets 公开数据集）· 身价为市场估值，非实时交易价 · 采集时间见顶部信任条
      </div>

      <PlayerDrawer id={drawerId} onClose={() => setDrawerId(null)} onNavigate={setDrawerId} />
    </div>
  );
}
