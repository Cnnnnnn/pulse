/**
 * src/renderer/ai-leaderboard/AiLeaderboardPage.jsx
 *
 * v3.1 布局对齐 ai-leaderboard-redesign-preview
 */
import { useEffect, useState } from "preact/hooks";
import { FeatureHeader } from "../components/FeatureHeader.jsx";
import {
  loading,
  error,
  attribution,
  hasSampleSource,
  fetchedAt,
  sourceDate,
  searchQuery,
  clearSearchQuery,
  getDisplayed,
  refresh,
  activeView,
  activeBoard,
  activeDim,
  activeLB,
  sortKey,
  items,
  licenseFilter,
  setLicenseFilter,
  columnValue,
} from "./aiLeaderboardStore.js";
import { ARENA_BOARDS, ARENA_BOARD_KEYS, AA_DIMENSIONS, LIVE_DIMENSIONS, SORT_COLUMN_LABELS, VENDOR_META } from "./types.js";
import { fmtClock, fmtDate, licenseKind } from "./format.js";
import { tableToMarkdown, copyToClipboard } from "./exportMarkdown.js";
import { rowsToCsv } from "./exportCsv.js";
import { api } from "../api.js";
import { LeaderboardFilterBar } from "./LeaderboardFilterBar.jsx";
import { LeaderboardTable } from "./LeaderboardTable.jsx";
import { ValueScatter } from "./ValueScatter.jsx";
import { ArenaBubbleChart } from "./ArenaBubbleChart.jsx";
import { ComparePanel } from "./ComparePanel.jsx";
import { ModelDetailDrawer } from "./ModelDetailDrawer.jsx";
import { AttributionFooter } from "./AttributionFooter.jsx";
import { LoadingState, ErrorState, EmptyState } from "./states.jsx";
import { TopPodium } from "./TopPodium.jsx";
import { BoardHealthCard } from "./BoardHealthCard.jsx";

/**
 * 当前视图导出 CSV 的列定义（顺序匹配 LeaderboardTable 的列头）。
 * 2026-07-22 P0：与表格同构，不重写取值逻辑 —— 由 handleExportCsv 用 columnValue() 取数。
 */
function csvColumnsForView(view) {
  if (view === "arena") {
    return [
      { key: "elo", header: "ELO" },
      { key: "ci", header: "CI" },
      { key: "votes", header: "票数" },
      { key: "context", header: "上下文" },
    ];
  }
  if (view === "livebench") {
    return [
      { key: "lb_overall", header: "Overall" },
      { key: "lb_coding", header: "Coding" },
      { key: "lb_language", header: "Language" },
      { key: "lb_instfollow", header: "指令遵循" },
      { key: "lb_cost", header: "$/成功" },
    ];
  }
  return [
    { key: "intelligence", header: "智能" },
    { key: "coding", header: "代码" },
    { key: "agentic", header: "Agent" },
    { key: "speed", header: "速度" },
    { key: "price", header: "输出价" },
    { key: "inputPrice", header: "输入价" },
    { key: "valueRatio", header: "性价比" },
    { key: "context", header: "上下文" },
  ];
}

/**
 * 按许可筛选却无结果时的空状态提示。
 * 说明当前榜单无该类模型，并列出具该类模型的其它 Arena board（含数量），避免误以为是故障。
 */
function LicenseEmptyHint({ kind, counts, boardLabel, arenaView, onClear }) {
  const label = kind === "open" ? "开源权重" : "闭源";
  const boards = ARENA_BOARD_KEYS
    .map((bk) => ({ meta: ARENA_BOARDS[bk], n: counts[bk] || 0 }))
    .filter((x) => x.n > 0);
  const boardText = boards.length
    ? boards.map((x) => `${x.meta.label}(${x.n})`).join("、")
    : null;
  return (
    <div class="ai-lb-state ai-lb-state--empty" role="status">
      <div class="ai-lb-state-icon" aria-hidden="true">∅</div>
      <p class="ai-lb-state-text">
        {arenaView ? `当前「${boardLabel}」榜无「${label}」模型` : `当前视图下无「${label}」模型`}
      </p>
      <p class="ai-lb-state-sub">
        {boardText
          ? `「${label}」模型分布在：${boardText}。可切换到对应榜单，或清除筛选查看全部。`
          : "本快照中暂无该许可类型的模型，可清除筛选查看全部。"}
      </p>
      <button type="button" class="ai-lb-btn ai-lb-btn--ghost" onClick={onClear}>
        清除许可筛选
      </button>
    </div>
  );
}

export function AiLeaderboardPage() {
  const rows = getDisplayed();
  const view = activeView.value;

  const [animate, setAnimate] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimate(false), 450);
    return () => clearTimeout(t);
  }, []);

  async function handleCopyTable() {
    const md = tableToMarkdown({ rows, view, board: activeBoard.value });
    const ok = await copyToClipboard(md);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleExportCsv() {
    if (!rows.length || exporting) return;
    setExporting(true);
    try {
      const cols = csvColumnsForView(view);
      const dataRows = rows.map((m, i) => {
        const o = {
          rank: i + 1,
          model: m.name,
          vendor: (VENDOR_META[m.vendor] || {}).label || m.vendor,
        };
        for (const c of cols) {
          o[c.key] = columnValue(m, view, c.key);
        }
        return o;
      });
      const csv = rowsToCsv({
        rows: dataRows,
        columns: [
          { key: "rank", header: "排名" },
          { key: "model", header: "模型" },
          { key: "vendor", header: "厂商" },
          ...cols,
        ],
      });
      const sub =
        view === "arena"
          ? activeBoard.value
          : view === "livebench"
            ? activeLB.value
            : activeDim.value;
      const today = new Date().toISOString().slice(0, 10);
      const filenameSuggestion = `ai-榜单_${view}_${sub}_${today}.csv`;
      // ponytail: 失败 / 取消都静默, finally 总会清 exporting.
      await api.exportLeaderboardCsv({ csv, filenameSuggestion });
    } catch {
      /* 静默 — 与现有设计一致 */
    } finally {
      setExporting(false);
    }
  }

  const sortLabel = sortKey.value && SORT_COLUMN_LABELS[sortKey.value];
  let crumb;
  if (view === "arena") {
    const boardMeta = ARENA_BOARDS[activeBoard.value] || {};
    crumb = `${boardMeta.label || "文本"} 榜`;
  } else if (view === "livebench") {
    const lbMeta = LIVE_DIMENSIONS[activeLB.value] || {};
    const sub = sortLabel || lbMeta.label || "Overall";
    crumb = `LiveBench · ${sub}`;
  } else {
    const dimMeta = AA_DIMENSIONS[activeDim.value] || {};
    const sub = sortLabel || dimMeta.label || "Intelligence Index";
    crumb = `AA · ${sub}`;
  }

  const count = rows.length;
  const clock = fmtClock(fetchedAt.value);
  const isEmpty = !loading.value && !error.value && rows.length === 0;

  // 按许可筛选却无结果：说明当前榜单无该类模型，统计哪些 board 有（给提示用）。
  const licenseActive = licenseFilter.value !== "all";
  const licenseEmpty = licenseActive && isEmpty && items.value.length > 0;
  const boardLabel = (ARENA_BOARDS[activeBoard.value] || {}).label || "文本";
  const licenseCounts = (() => {
    const counts = {};
    for (const it of items.value) {
      if (licenseKind(it.license) !== licenseFilter.value) continue;
      for (const bk of ARENA_BOARD_KEYS) {
        const slice = it.arena && it.arena[ARENA_BOARDS[bk].key];
        if (slice && typeof slice.score === "number") counts[bk] = (counts[bk] || 0) + 1;
      }
    }
    return counts;
  })();
  const sample = hasSampleSource();
  const scopeNote =
    view === "aa" || view === "livebench"
      ? "仅 LLM"
      : view === "arena" && count > 0 && count <= 15
        ? `仅 Top ${count}`
        : null;

  return (
    <div class="ai-leaderboard-page" data-view={view}>
      <FeatureHeader
        className="ai-leaderboard-header"
        brand={
          <div class="ai-leaderboard-page-header__brand">
            <h1 class="ai-leaderboard-page-header__title">AI 榜单</h1>
            <p class="ai-leaderboard-page-header__sub">三个评测源，一个视图</p>
          </div>
        }
      >
        <span
          class={`ai-leaderboard-status-pill${sample ? " is-sample" : ""}`}
          title={sample ? "部分数据为示例快照" : "数据来自在线或缓存"}
        >
          <span class="ai-leaderboard-status-pill__dot" aria-hidden="true" />
          {sample ? "含示例" : "实时"}
          {clock ? ` · ${clock}` : ""}
        </span>
      </FeatureHeader>

      <div class="ai-leaderboard-toolbar">
        <LeaderboardFilterBar />
      </div>

      {count > 0 && (
        <div class="ai-leaderboard-summary" aria-live="polite">
          <span class="ai-leaderboard-summary__dot" aria-hidden="true" />
          <span>{crumb}</span>
          <span class="ai-leaderboard-summary__sep">·</span>
          <span>
            共 <strong>{count}</strong> 个模型
          </span>
          {scopeNote && (
            <>
              <span class="ai-leaderboard-summary__sep">·</span>
              <span class="ai-leaderboard-summary__note">{scopeNote}</span>
            </>
          )}
          {sourceDate.value ? (
            <>
              <span class="ai-leaderboard-summary__sep">·</span>
              <span class="ai-leaderboard-summary__note" title="Arena 社区快照的数据截止日期">
                数据截至 {fmtDate(sourceDate.value)}
              </span>
            </>
          ) : fetchedAt.value ? (
            <>
              <span class="ai-leaderboard-summary__sep">·</span>
              <span class="ai-leaderboard-summary__note">数据更新于 {fmtDate(fetchedAt.value)}</span>
            </>
          ) : null}
          <span class="ai-leaderboard-summary__fill" />
          <BoardHealthCard total={count} compact />
          {count > 0 && (
            <button type="button" class="ai-lb-copy-btn" onClick={handleCopyTable}>
              {copied ? "已复制 ✓" : "复制表格"}
            </button>
          )}
          {count > 0 && (
            <button
              type="button"
              class="ai-lb-copy-btn"
              onClick={handleExportCsv}
              disabled={exporting}
              title="导出当前视图当前过滤后模型为 CSV"
            >
              {exporting ? "导出中…" : "导出 CSV"}
            </button>
          )}
        </div>
      )}

      <div class={`ai-leaderboard-body${animate ? " is-entering" : ""}`}>
        {loading.value && <LoadingState />}

        {error.value && (
          <ErrorState message={error.value} onRetry={() => refresh()} />
        )}

        {isEmpty && licenseEmpty ? (
          <LicenseEmptyHint
            kind={licenseFilter.value}
            counts={licenseCounts}
            boardLabel={boardLabel}
            arenaView={view === "arena"}
            onClear={() => setLicenseFilter("all")}
          />
        ) : isEmpty ? (
          <EmptyState onRetry={() => (searchQuery.value ? clearSearchQuery() : refresh())} />
        ) : null}

        {!loading.value && !error.value && rows.length > 0 && (
          <>
            {view === "aa" && <ValueScatter items={rows} />}
            {view === "arena" && <ArenaBubbleChart items={rows} board={activeBoard.value} />}
            <TopPodium rows={rows} view={view} />
            <LeaderboardTable rows={rows} view={view} />
          </>
        )}
      </div>

      <ModelDetailDrawer />
      <ComparePanel />

      <AttributionFooter attribution={attribution.value} />
    </div>
  );
}

export default AiLeaderboardPage;
