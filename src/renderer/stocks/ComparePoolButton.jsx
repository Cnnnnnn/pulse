/**
 * ComparePoolButton — 浮动按钮, 显示"对比 (N)", N>0 才出现.
 * ponytail: 复用现有 .stock-fab 风格 (若有), 没有就用 fixed 定位 + 阴影.
 * 点开 CompareDrawer.
 */
import {
  comparePoolCount,
  openCompareDrawer,
} from "./comparePool.js";

export function ComparePoolButton() {
  const n = comparePoolCount.value;
  if (n === 0) return null;
  return (
    <button
      type="button"
      class="compare-pool-fab"
      onClick={openCompareDrawer}
      title="打开对比池"
      aria-label={`打开对比池 (${n})`}
    >
      <span class="compare-pool-fab-icon">⇄</span>
      <span class="compare-pool-fab-label">对比池</span>
      <span class="compare-pool-fab-count">{n}</span>
    </button>
  );
}

export default ComparePoolButton;