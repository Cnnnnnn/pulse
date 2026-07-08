/**
 * CompareDrawer — 个股对比池右侧抽屉.
 *
 * ponytail 2026-07-07:
 *   - 不做雷达图 (引入图表库不值). 一张紧凑表格: 名称/代码 | 现价 | 综合分 | 5 维小柱 | ×
 *   - 列对齐用 5 列 grid 固定 (name 弹性 1fr) — 之前 flex 方案下, 5 维柱撑爆,
 *     现价列被压成 0 宽 (渲染就是 "—"), 行/列对不齐.
 *   - 现价缺失时 (例如从搜索选股直接进诊断加的, _cache.rows 没该 code) → drawer
 *     渲染时按 code 反查一次 api.stocksSearch (enrichSearchResults 内部会跟
 *     _cache.rows 合并, 仍 0 就只能 "—"), 拿到就写回 pool 让全屏同步.
 *
 * 综合分/5 维: pool entry 自带 scores 的就显示, 没诊断过的显示 "—".
 * 颜色用 DimensionScores 同款 (绿/蓝/橙/红).
 */
import { useEffect, useRef } from "preact/hooks";
import { AIDrawerShell } from "../components/AIDrawerShell.jsx";
import {
  comparePool,
  compareDrawerOpen,
  closeCompareDrawer,
  removeFromCompare,
  clearCompare,
  updateComparePrice,
  DIM_LABELS,
  DIM_KEYS,
} from "./comparePool.js";

const COLOR = (s) =>
  s == null ? "#d8d8de" : s >= 7 ? "#34c759" : s >= 5 ? "#007aff" : s >= 3 ? "#ff9500" : "#ff3b30";

function MiniDim({ value }) {
  if (value == null) return <span class="cmp-dim-missing">—</span>;
  const h = Math.max(6, value * 10);
  return (
    <div class="cmp-mini-dim" title={`${value}`}>
      <div class="cmp-mini-track">
        <div class="cmp-mini-fill" style={{ height: `${h}%`, background: COLOR(value) }} />
      </div>
    </div>
  );
}

function PoolRow({ entry }) {
  const s = entry.scores;
  return (
    <div class="cmp-row">
      <div class="cmp-cell cmp-cell-name">
        <div class="cmp-name">{entry.name}</div>
        <div class="cmp-code">{entry.code}{entry.industry ? ` · ${entry.industry}` : ""}</div>
      </div>
      <div class="cmp-cell cmp-cell-price">
        {entry.price != null && entry.price !== "" ? (
          <>
            <span class="cmp-price-num">¥{entry.price}</span>
            {entry.changePct != null && (
              <span class={`cmp-change ${entry.changePct >= 0 ? "up" : "down"}`}>
                {entry.changePct >= 0 ? "+" : ""}{entry.changePct}%
              </span>
            )}
          </>
        ) : (
          <span class="cmp-overall-missing">—</span>
        )}
      </div>
      <div class="cmp-cell cmp-cell-overall">
        {s && s.overall != null ? (
          <span class="cmp-overall-num" style={{ color: COLOR(s.overall) }}>{s.overall.toFixed(1)}</span>
        ) : (
          <span class="cmp-overall-missing">—</span>
        )}
      </div>
      <div class="cmp-cell cmp-cell-dims">
        {DIM_KEYS.map((k) => (
          <MiniDim key={k} value={s && s.dimensions ? s.dimensions[k] : null} />
        ))}
      </div>
      <div class="cmp-cell cmp-cell-actions">
        <button
          type="button"
          class="cmp-remove"
          onClick={() => removeFromCompare(entry.code)}
          aria-label={`移除 ${entry.name}`}
          title="移除"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/**
 * ponytail: drawer 打开时, 缺价的 entry 一次性反查 api.stocksSearch(code) 补价.
 * 不缺的不重查. 写回 pool (updateComparePrice) 让 ResultTable 的"已在对比池"角标
 * 同步看到最新价. 请求 inflight 时不重复发.
 */
function useEnrichMissingPrices(api, pool) {
  const inflight = useRef(new Set());
  useEffect(() => {
    if (!api || !api.stocksSearch) return;
    const missing = pool
      .filter((e) => e && e.code && e.price == null)
      .map((e) => e.code)
      .filter((c) => !inflight.current.has(c));
    if (missing.length === 0) return;
    missing.forEach((c) => inflight.current.add(c));
    (async () => {
      await Promise.all(
        missing.map(async (code) => {
          try {
            const resp = await api.stocksSearch(code);
            const r = resp && resp.results ? resp.results.find((x) => x && x.code === code) : null;
            if (r && r.price != null) {
              updateComparePrice(code, { price: r.price, changePct: r.changePct ?? null });
            }
          } catch (_) {
            // ponytail: 查询失败保持 "—", 不弹错 (drawer 是辅助视图, 静默降级)
          } finally {
            inflight.current.delete(code);
          }
        }),
      );
    })();
  }, [api, pool]);
}

export function CompareDrawer({ api }) {
  const open = compareDrawerOpen.value;
  const pool = comparePool.value;
  useEnrichMissingPrices(api, open ? pool : []);
  return (
    <AIDrawerShell
      open={open}
      onClose={closeCompareDrawer}
      title={`对比池 (${pool.length})`}
      subtitle={pool.length === 0 ? "从结果表或诊断页加入" : "横向对比综合分 / 5 维"}
    >
      {pool.length === 0 ? (
        <div class="cmp-empty">
          还没有加入对比池的股票.<br />
          <span class="cmp-empty-hint">ResultTable 行尾的 "+" 或 ModuleGrid 顶部"加入对比"按钮.</span>
        </div>
      ) : (
        <>
          <div class="cmp-head">
            <span class="cmp-cell cmp-cell-name">名称/代码</span>
            <span class="cmp-cell cmp-cell-price">现价</span>
            <span class="cmp-cell cmp-cell-overall">综合分</span>
            <span class="cmp-cell cmp-cell-dims">
              {DIM_KEYS.map((k) => (
                <span class="cmp-dim-label" key={k}>{DIM_LABELS[k]}</span>
              ))}
            </span>
            <span class="cmp-cell cmp-cell-actions" />
          </div>
          <div class="cmp-list">
            {pool.map((e) => <PoolRow key={e.code} entry={e} />)}
          </div>
          <div class="cmp-foot">
            <button
              type="button"
              class="stock-btn stock-btn-secondary"
              onClick={clearCompare}
            >
              清空对比池
            </button>
            <span class="cmp-foot-hint">最多 4 只. 综合分/5 维只在加入时已诊断过才有值.</span>
          </div>
        </>
      )}
    </AIDrawerShell>
  );
}

export default CompareDrawer;