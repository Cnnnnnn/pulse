/**
 * src/renderer/funds/FundList.jsx
 *
 * 2026-07-14 计划 §3 Phase 2 — 基金列表 (多维筛选 / 列排序 / 分页 / 骨架 / 卡片态).
 *
 * 数据: rowsWithMetrics (signal) — 由 fundStore 派生, 包含 holding + navSnap + metrics.
 * 风险: holding 没有 risk 字段, 用 riskFromCategory 从 category 推 (与原型 TYPE_RISK_DEFAULT 一致).
 *       Phase 4 接入 riskRating 后, 改为直接读 holding.risk.
 *
 * ponytail:
 *   - 排序/筛选/分页纯客户端 (无 IPC), 与 filteredRows 解耦, 用 useState.
 *   - 行点击 → selectedFundCode, FundContent 路由到 FundDetail.
 *   - 卡片态: ≤560px 触发 (matchesMedia), 与现有 HomeGrid card-mode 一致.
 */

import { useEffect, useMemo, useState } from "preact/hooks";
import {
  rowsWithMetrics,
  searchQuery,
  setSearchQuery,
  openAddModal,
  fundView,
  holdingWeights,
} from "./fundStore.js";
import { openFundDetail } from "./fundRoute.js";
import {
  isFundPinned,
  addWatchlistItem,
  removeWatchlistItem,
  refreshWatchlist,
  watchlistItems,
} from "../watchlist/watchlist-store.js";
import { downloadCsv } from "../utils/csv.js";
import { showToast } from "../store/toast-store.js";

const TYPE_OPTIONS = ["全部", "股票", "债券", "货币", "QDII", "其他"];
const RISK_OPTIONS = ["全部", "R1", "R2", "R3", "R4", "R5"];
const RISK_BY_CATEGORY = {
  money: "R1",
  bond: "R2",
  stock: "R4",
  qdii: "R4",
  other: "R3",
};

function riskFromCategory(cat) {
  return RISK_BY_CATEGORY[cat] || "R3";
}
// 2026-07-14: a11y 友好 — R1..R5 翻译为「低/中低/中/中高/高」, 给屏幕阅读器 / 色盲用户
const RISK_LABEL_MAP = { R1: "低", R2: "中低", R3: "中", R4: "中高", R5: "高" };
function riskLabel(r) {
  return RISK_LABEL_MAP[r] || r || "—";
}

function fmtMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("zh-CN", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

// 2026-07-14: 涨跌用 ▲▼ 前缀 — A 股习惯, 扫视时比单纯看颜色 + 符号更快
//   ponytail: 0 不加箭头 (灰色), 正加 ▲, 负加 ▼, 后跟原值
function fmtSignedPct(p) {
  const v = Number(p);
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return `0.00%`;
  const arrow = v > 0 ? "▲" : "▼";
  const sign = v > 0 ? "+" : "";
  return `${arrow}${sign}${v.toFixed(2)}%`;
}
// 金额版 — 只在已有 signClass 染色的 cell 用, 0 显示 "¥0.00" 不带箭头
function fmtSignedCurrency(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "¥0.00";
  if (v === 0) return fmtCurrency(0);
  const arrow = v > 0 ? "▲" : "▼";
  const sign = v < 0 ? "-" : "";
  return `${arrow}${sign}¥${Math.abs(v).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// 2026-07-14: ¥ + 千分位 + 2dp, 与 Dashboard / FundDetail fmtCurrency 一致
//   ponytail: 同一个函数签名, 三处实现收敛, 视觉读数统一
function fmtCurrency(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "¥0.00";
  const sign = v < 0 ? "-" : "";
  return `${sign}¥${Math.abs(v).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function signClass(n) {
  if (!Number.isFinite(Number(n))) return "";
  return Number(n) >= 0 ? "positive" : "negative";
}
// 2026-07-14: 涨跌幅度分档 — |pct| < 1 浅, 1..3 中, >=3 深
//   ponytail: 用 class 而非 inline color, 暗色 / 主题切换跟随全局变量
function magnitudeClass(pct) {
  const v = Math.abs(Number(pct));
  if (!Number.isFinite(v)) return "";
  if (v < 1) return "mag-low";
  if (v < 3) return "mag-mid";
  return "mag-high";
}

// 列定义 (key, label, sortable, align, accessor(row, key))
//   2026-07-14: 给每列加 align 字段; head/body 都跟着 align 走, 不再写死 text-align
//   2026-07-14: profit 列 — 累计盈亏绝对金额 ¥, 与 "累计收益" 百分比互补 (一眼看出"亏了多少/赚了多少")
const COLS = [
  { key: "name", label: "基金", sortable: false, align: "left" },
  { key: "type", label: "类型", sortable: false, align: "center" },
  { key: "nav", label: "单位净值", sortable: true, align: "right", accessor: (r) => r.metrics.nav },
  { key: "daily", label: "日涨跌", sortable: true, align: "right", accessor: (r) => r.metrics.dailyReturnPct },
  { key: "todayProfit", label: "今日盈亏", sortable: true, align: "right", accessor: (r) => r.metrics.todayProfit },
  { key: "profitPct", label: "累计收益", sortable: true, align: "right", accessor: (r) => r.metrics.profitPct },
  { key: "profit", label: "累计盈亏", sortable: true, align: "right", accessor: (r) => r.metrics.profit },
  { key: "market", label: "持仓市值", sortable: true, align: "right", accessor: (r) => r.metrics.marketValue },
  { key: "risk", label: "风险", sortable: true, align: "center", accessor: (r) => riskNum(r.riskDerived) },
];

function riskNum(r) {
  if (!r) return 0;
  const m = String(r).match(/R(\d)/);
  return m ? Number(m[1]) : 0;
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "zh-CN");
}

const PAGE_SIZE = 8;

export function FundList() {
  const all = rowsWithMetrics.value || [];
  // 输入 (controlled)
  const [type, setType] = useState("全部");
  const [risk, setRisk] = useState("全部");
  const [search, setSearch] = useState(searchQuery.value || "");
  const [sortKey, setSortKey] = useState("profitPct");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [cardMode, setCardMode] = useState(false);

  // 推送搜索回 store (与 FundHero 双向同步, 避免 dashboard 也有搜索)
  useEffect(() => {
    setSearchQuery(search);
  }, [search]);

  // card-mode media query
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(max-width: 560px)");
    const onChange = () => setCardMode(mq.matches);
    onChange();
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // 2026-07-14: 自选功能 — 首次进 List 时拉一次 watchlist, 之后 ⭐ 按钮调 add/remove
  //   ponytail: 不再单独维护 set, 复用全局 watchlist signal, 通过 isFundPinned(code) 判定;
  //   切换 ⭐ 后, view='watch' 时该行立刻显示/隐藏, 'all' 时仅 ⭐ 状态变化.
  useEffect(() => {
    if (watchlistItems.value.length === 0) {
      void refreshWatchlist().catch(() => {});
    }
  }, []);
  async function toggleFundPin(e, code) {
    e.stopPropagation();
    e.preventDefault();
    if (!code) return;
    if (isFundPinned(code)) {
      await removeWatchlistItem({ type: "fund", ref: code });
    } else {
      await addWatchlistItem({ type: "fund", ref: code });
    }
  }

  // 装饰每行: 风险/类型标签
  const decorated = useMemo(
    () =>
      all.map((r) => {
        const cat = (r.holding && r.holding.category) || "other";
        const typeLabel = { stock: "股票", bond: "债券", money: "货币", qdii: "QDII", other: "其他" }[cat] || "其他";
        return Object.assign({}, r, {
          typeLabel,
          riskDerived: riskFromCategory(cat),
        });
      }),
    [all],
  );

  // 过滤
  const filtered = useMemo(() => {
    let list = decorated;
    if (type !== "全部") list = list.filter((r) => r.typeLabel === type);
    if (risk !== "全部") list = list.filter((r) => r.riskDerived === risk);
    const q = (search || "").trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const h = r.holding || {};
        const code = h.code || "";
        const name = (h.name || "").toLowerCase();
        return code.includes(q) || name.includes(q);
      });
    }
    // 自选过滤 (fundView='watch')
    if (fundView.value === "watch") {
      list = list.filter((r) => {
        // reuse isFundPinned 通过 watchlist-store; 避免循环引用就内联简单的判断
        try {
          const wl =
            typeof window !== "undefined" && window.__FUND_PIN_CHECK__
              ? window.__FUND_PIN_CHECK__
              : null;
          if (wl) return wl(r.holding && r.holding.code);
        } catch {
          /* noop */
        }
        return true;
      });
    }
    return list;
  }, [decorated, type, risk, search, fundView.value]);

  // 排序
  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.key === sortKey);
    if (!col || !col.sortable) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => compareValues(col.accessor(a), col.accessor(b)) * dir);
  }, [filtered, sortKey, sortDir]);

  // 分页
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageItems = sorted.slice(start, start + PAGE_SIZE);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // 2026-07-14: risk 改成 desc 默认 — R5 排到顶是高风险优先, 更符合监控直觉
      //   ponytail: name/type/risk 一律按字面 asc 是历史习惯, risk 反向更合理
      setSortDir(key === "name" || key === "type" ? "asc" : "desc");
    }
    setPage(1);
  }

  function handleReset() {
    setType("全部");
    setRisk("全部");
    setSearch("");
    setSortKey("profitPct");
    setSortDir("desc");
    setPage(1);
  }

  // 2026-07-15: 导出当前筛选+排序后的全量基金为 CSV
  //   ponytail: 导出 sorted (排序后全量), 不是 pageItems (分页); 用户能看到多少导多少
  function handleExport() {
    if (sorted.length === 0) {
      showToast("当前没有可导出的基金", { type: "info" });
      return;
    }
    const header = [
      "代码", "名称", "类型", "风险", "单位净值",
      "日涨跌(%)", "今日盈亏(¥)", "累计收益(%)", "累计盈亏(¥)",
      "持仓市值(¥)", "持有份额", "持仓权重(%)", "是否自选",
    ];
    const weightMap = (holdingWeights.value && holdingWeights.value.byCode) || {};
    const rows = [
      [`# Pulse 基金列表导出 — ${new Date().toLocaleString("zh-CN")}`],
      [`# 视图: ${fundView.value === "watch" ? "自选" : "全部"} | 搜索: ${search || "(无)"} | 类型: ${type} | 风险: ${risk}`],
      [`# 排序: ${sortKey} ${sortDir === "asc" ? "升序" : "降序"}`],
      [],
      header,
    ];
    for (const r of sorted) {
      const h = r.holding || {};
      const m = r.metrics || {};
      const nav = Number(m.nav);
      const day = Number(m.dailyReturnPct);
      const today = Number(m.todayProfit);
      const cumPct = Number(m.profitPct);
      const cum = Number(m.profit);
      const mv = Number(m.marketValue);
      const shares = Number(h.shares);
      const weight = Number(weightMap[h.code]) || 0;
      rows.push([
        h.code || "",
        h.name || "",
        r.typeLabel || "",
        r.riskDerived || "",
        Number.isFinite(nav) ? nav.toFixed(4) : "",
        Number.isFinite(day) ? day.toFixed(4) : "",
        Number.isFinite(today) ? today.toFixed(2) : "",
        Number.isFinite(cumPct) ? cumPct.toFixed(4) : "",
        Number.isFinite(cum) ? cum.toFixed(2) : "",
        Number.isFinite(mv) ? mv.toFixed(2) : "",
        Number.isFinite(shares) ? shares.toFixed(2) : "",
        (weight * 100).toFixed(2),
        isFundPinned(h.code) ? "是" : "否",
      ]);
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const viewTag = fundView.value === "watch" ? "-watch" : "";
    downloadCsv(`pulse-funds${viewTag}-${stamp}.csv`, rows);
    showToast(`已导出 ${sorted.length} 只基金`, { type: "success" });
  }


  return (
    <div class="fund-page fund-list" aria-label="基金列表">
      <div class="fund-page-head">
        <div>
          <h1>基金列表</h1>
          <p>
            共 {all.length} 只基金 · 多维筛选 / 排序 / 分页
            {fundView.value === "watch" ? " · 当前显示自选" : ""}
          </p>
        </div>
        <div class="head-tools">
          <div class="fund-view-toggle" role="tablist" aria-label="视图">
            <button
              type="button"
              role="tab"
              aria-selected={fundView.value === "all"}
              class={`fund-view-btn${fundView.value === "all" ? " active" : ""}`}
              onClick={() => {
                fundView.value = "all";
                setPage(1);
              }}
            >
              全部
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={fundView.value === "watch"}
              class={`fund-view-btn${fundView.value === "watch" ? " active" : ""}`}
              onClick={() => {
                fundView.value = "watch";
                setPage(1);
              }}
            >
              自选
            </button>
          </div>
          <button
            type="button"
            class="fund-btn fund-btn-primary"
            onClick={() => openAddModal()}
            aria-label="添加持仓"
          >
            <span aria-hidden="true">＋</span>
            <span style="margin-left:6px">添加持仓</span>
          </button>
        </div>
      </div>

      <div class="fund-list-filterbar">
        <input
          type="search"
          class="grow"
          placeholder="搜索代码 / 名称"
          value={search}
          onInput={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
            // 模拟加载态: 给骨架一闪
            setLoading(true);
            setTimeout(() => setLoading(false), 220);
          }}
          aria-label="搜索基金"
        />
        <select
          value={type}
          onChange={(e) => {
            setType(e.currentTarget.value);
            setPage(1);
          }}
          aria-label="按类型筛选"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={risk}
          onChange={(e) => {
            setRisk(e.currentTarget.value);
            setPage(1);
          }}
          aria-label="按风险筛选"
        >
          {RISK_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="button"
          class="fund-btn fund-btn-ghost"
          onClick={handleReset}
          aria-label="重置筛选"
        >
          重置
        </button>
        <button
          type="button"
          class="fund-btn fund-btn-ghost"
          onClick={handleExport}
          aria-label="导出当前列表为 CSV"
          disabled={sorted.length === 0}
          title="导出当前筛选+排序后的全量基金为 CSV (Excel/Numbers 可直接打开)"
        >
          <span aria-hidden="true">↓</span>
          <span style="margin-left:4px">导出 CSV</span>
        </button>
      </div>

      <div class="fund-card-flat" style="padding:0;overflow:hidden">
        <table
          key={`tbl-${fundView.value}`}
          class={`fund-list-table fund-list-fade${cardMode ? " card-mode" : ""}`}
        >
          <thead>
            <tr>
              <th class="col-star" aria-label="自选"></th>
              {COLS.map((c) => {
                const sortable = !!c.sortable;
                const active = sortKey === c.key;
                const caret = active ? (sortDir === "asc" ? "▲" : "▼") : sortable ? "▾" : "";
                return (
                  <th
                    key={c.key}
                    class={active ? "sorted" : ""}
                    style={`text-align:${c.align || "left"}`}
                    title={
                      sortable
                        ? c.key === "risk"
                          ? "点击按风险排序（R5 优先）"
                          : `点击按 ${c.label} 排序`
                        : undefined
                    }
                    onClick={sortable ? () => toggleSort(c.key) : undefined}
                    role={sortable ? "button" : undefined}
                    tabIndex={sortable ? 0 : undefined}
                    onKeyDown={
                      sortable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleSort(c.key);
                            }
                          }
                        : undefined
                    }
                    aria-sort={
                      active
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    {c.label}
                    {caret && <span class="sort-caret">{caret}</span>}
                  </th>
                );
              })}
              <th style="text-align:right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? skeletonRows(PAGE_SIZE)
              : pageItems.length === 0
              ? emptyRow(COLS.length + 1, fundView.value === "watch")
              : pageItems.map((r) => {
                  // 2026-07-14: 行 tint 标记 — R5 / 深度亏损 / 集中度高 触发视觉权重提升
                  //   ponytail: 不引入新 store, 在渲染时算 attr, CSS 用 attribute selector
                  const profitPctNum = Number((r.metrics && r.metrics.profitPct) || 0);
                  const isDeepLoss = profitPctNum <= -30;
                  const isHighRisk = r.riskDerived === "R5";
                  // 持仓权重 >= 30% 视为「鸡蛋都在一个篮子里」
                  const weightByCode = holdingWeights.value && holdingWeights.value.byCode;
                  const code = r.holding && r.holding.code;
                  const weight = (weightByCode && code && weightByCode[code]) || 0;
                  const isHighWeight = weight >= 0.3;
                  return (
                  <tr
                    key={(r.holding && r.holding.id) || (r.holding && r.holding.code)}
                    onClick={() => openFundDetail(r.holding && r.holding.code)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        openFundDetail(r.holding && r.holding.code);
                      }
                    }}
                    role="button"
                    aria-label={`查看 ${r.holding && r.holding.name} 详情`}
                    data-risk-row={isHighRisk ? "R5" : ""}
                    data-deep-loss={isDeepLoss ? "1" : ""}
                    data-high-weight={isHighWeight ? "1" : ""}
                  >
                    <td class="col-star" data-label="自选">
                      <button
                        type="button"
                        class={`fund-star${isFundPinned(r.holding && r.holding.code) ? " pinned" : ""}`}
                        aria-label={isFundPinned(r.holding && r.holding.code) ? "取消自选" : "加入自选"}
                        aria-pressed={isFundPinned(r.holding && r.holding.code)}
                        onClick={(e) => toggleFundPin(e, r.holding && r.holding.code)}
                        title={isFundPinned(r.holding && r.holding.code) ? "已加入自选，点击取消" : "加入自选"}
                      >
                        {isFundPinned(r.holding && r.holding.code) ? "★" : "☆"}
                      </button>
                    </td>
                    <td data-label="基金">
                      <div class="fund-name">{r.holding && r.holding.name}</div>
                      <div class="fund-code">
                        {r.holding && r.holding.code}
                      </div>
                    </td>
                    <td data-label="类型" style="text-align:center">{r.typeLabel}</td>
                    <td data-label="单位净值" class="num">
                      {fmtMoney(r.metrics.nav)}
                    </td>
                    <td
                      data-label="日涨跌"
                      class={`num ${signClass(r.metrics.dailyReturnPct)} ${magnitudeClass(r.metrics.dailyReturnPct)}`}
                    >
                      {fmtSignedPct(r.metrics.dailyReturnPct)}
                    </td>
                    <td
                      data-label="今日盈亏"
                      class={`num ${signClass(r.metrics.todayProfit)}`}
                    >
                      {fmtSignedCurrency(r.metrics.todayProfit)}
                    </td>
                    <td
                      data-label="累计收益"
                      class={`num ${signClass(r.metrics.profitPct)} ${magnitudeClass(r.metrics.profitPct)}`}
                    >
                      {fmtSignedPct(r.metrics.profitPct)}
                    </td>
                    <td
                      data-label="累计盈亏"
                      class={`num ${signClass(r.metrics.profit)}`}
                    >
                      {fmtSignedCurrency(r.metrics.profit)}
                    </td>
                    <td data-label="持仓市值" class="num">
                      {fmtCurrency(r.metrics.marketValue)}
                    </td>
                    <td data-label="风险" style="text-align:center">
                      <span
                        class="risk-pill"
                        data-risk={r.riskDerived}
                        aria-label={`风险等级 ${riskLabel(r.riskDerived)}`}
                        title={`风险等级 ${riskLabel(r.riskDerived)}`}
                      >
                        {r.riskDerived}
                      </span>
                    </td>
                    <td data-label="操作" class="actions">
                      <button
                        type="button"
                        class="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          openFundDetail(r.holding && r.holding.code);
                        }}
                      >
                        查看走势
                      </button>
                    </td>
                  </tr>
                  );
                })}
          </tbody>
        </table>
        <div class="fund-pager">
          <span class="fund-pager-info">
            {sorted.length === 0
              ? "无匹配结果"
              : `显示 ${start + 1}–${Math.min(sorted.length, start + PAGE_SIZE)} / 共 ${sorted.length} 只基金`}
          </span>
          <div class="fund-pager-btns" role="navigation" aria-label="分页">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              aria-label="上一页"
            >
              ‹
            </button>
            {renderPageButtons(safePage, totalPages, setPage)}
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage === totalPages}
              aria-label="下一页"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderPageButtons(current, total, onPick) {
  // 简单展开: ≤7 显示全部, 否则首/末 + 当前 ±2
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1).map((p) => (
      <button
        key={p}
        type="button"
        class={p === current ? "active" : ""}
        onClick={() => onPick(p)}
        aria-current={p === current ? "page" : undefined}
      >
        {p}
      </button>
    ));
  }
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(pages).filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(
      <button
        key={sorted[i]}
        type="button"
        class={sorted[i] === current ? "active" : ""}
        onClick={() => onPick(sorted[i])}
        aria-current={sorted[i] === current ? "page" : undefined}
      >
        {sorted[i]}
      </button>,
    );
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) {
      out.push(
        <span key={`gap-${sorted[i]}`} aria-hidden="true" style="padding:0 4px;color:var(--text-tertiary)">
          …
        </span>,
      );
    }
  }
  return out;
}

function skeletonRows(n) {
  const widths = [40, 80, 60, 50, 60, 70, 70, 60, 70, 40];
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push(
      <tr key={`sk-${i}`} class="fund-skel-row">
        {widths.map((w, j) => (
          <td key={j}>
            <div class="sk-line" style={`width:${w}%`} />
          </td>
        ))}
        <td>
          <div class="sk-line" style="width:60%" />
        </td>
      </tr>,
    );
  }
  return rows;
}

function emptyRow(colspan, isWatchView) {
  // 2026-07-14: 区分空态文案 — 「自选」视图下是「还没加自选」, 「全部」是「筛选无结果」
  //   ponytail: 自选视图给一个加号引导, 减少用户认知负担
  const msg = isWatchView
    ? "还没有自选基金。在「全部」视图点行首 ☆ 加入自选。"
    : "没有符合条件的基金，试试调整筛选条件。";
  return (
    <tr class="empty-row">
      <td colSpan={colspan}>
        <div class="fund-empty-card">{msg}</div>
      </td>
    </tr>
  );
}

export default FundList;