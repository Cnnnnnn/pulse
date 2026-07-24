/**
 * AddToCompareButton — 加入/移出对比池按钮.
 *
 * 用例 2 处:
 *   1. ResultTable 行尾 (variant="row"): 圆形 icon-only
 *   2. ModuleGrid 顶部 (variant="card"): 文字按钮
 *
 * ponytail: 不引 IconPlus, 直接用 +/- unicode (ResultTable 已有 IconWand 风格
 *          一致 — 用最少元素表达状态). 满了 → 禁用 + tooltip.
 *
 * ponytail 2026-07-07: 接受 api prop (optional). 加 pool 时如果 entry 缺价, 主动
 * 调一次 api.stocksSearch(code) 拉价 — 让用户点 "加入对比" 后立即看到 ¥价格/涨跌,
 * 不必等打开对比池触发 drawer 端 enrichment. 调用方 (ResultTable / StockDiagnosisPage)
 * 都需要传 api.
 */
import { useState } from "preact/hooks";
import {
  isInCompare,
  toggleCompare,
  compareIsFull,
  updateComparePrice,
  MAX_COMPARE,
} from "./comparePool.js";

export function AddToCompareButton({ entry, variant = "row", api }) {
  const inPool = isInCompare(entry.code);
  const full = compareIsFull.value;
  const [flash, setFlash] = useState(null); // "added" | "removed" | "full"

  function handleClick(e) {
    e.stopPropagation();
    const r = toggleCompare(entry);
    if (!r.ok && r.reason === "full") {
      setFlash("full");
      setTimeout(() => setFlash(null), 1500);
      return;
    }
    if (r.ok && r.action === "added" && api && api.stocksSearch && entry && entry.price == null) {
      // ponytail: 缺价 → 后台拉一次补价 (静默失败 — drawer 端 useEnrichMissingPrices 兜底).
      api.stocksSearch(entry.code).then((resp) => {
        const got = resp && resp.results ? resp.results.find((x) => x && x.code === entry.code) : null;
        if (got && got.price != null) {
          updateComparePrice(entry.code, { price: got.price, changePct: got.changePct ?? null });
        }
      }).catch(() => {});
    }
    if (r.ok) {
      setFlash(r.action);
      setTimeout(() => setFlash(null), 1200);
    }
  }

  const label = inPool ? "已在对比池" : flash === "full" ? `已满 (${MAX_COMPARE})` : "加入对比";
  const cls = `add-compare-btn add-compare-${variant}${inPool ? " add-compare-in" : ""}${flash ? ` add-compare-flash-${flash}` : ""}`;
  return (
    <button
      type="button"
      class={cls}
      onClick={handleClick}
      disabled={!inPool && full}
      title={inPool ? "已加入对比池, 点击移除" : full ? `对比池已满 (${MAX_COMPARE})` : "加入对比池"}
      aria-label={label}
    >
      <span class="add-compare-mark">{inPool ? "✓" : flash === "full" ? "!" : "+"}</span>
      {variant === "card" && <span class="add-compare-text">{label}</span>}
    </button>
  );
}

export default AddToCompareButton;