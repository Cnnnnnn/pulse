/**
 * P0-2: 数据缺口显式提示.
 * 拿不到数据时 (整条 angle 拉取失败 / status !== 'ok') 在 diagnosis 顶部展示,
 * 告知用户"这些维度无法判断" — 避免误导.
 * ponytail: 2026-07-07 — 1 个 component 1 个 function, 不接 props / 不做动画, 只管展示.
 */
import { IconAlert } from "../../components/icons.jsx";

export function DataGapsIndicator({ gaps }) {
  if (!gaps || gaps.length === 0) return null;
  const labels = gaps.map((g) => g.label).join("、");
  return (
    <div class="diagnosis-data-gaps" role="status" aria-live="polite">
      <IconAlert size={14} class="diagnosis-data-gaps-icon" />
      <span class="diagnosis-data-gaps-text">
        以下维度数据缺失, 暂不参与判断: <strong>{labels}</strong>
      </span>
    </div>
  );
}

export default DataGapsIndicator;
