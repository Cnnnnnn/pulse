/**
 * P0-2: 数据缺口显式提示.
 * 拿不到数据时 (整条 angle 拉取失败 / status !== 'ok') 在 diagnosis 顶部展示,
 * 告知用户"这些维度无法判断" — 避免误导.
 * ponytail: 2026-07-07 — 每个 gap 单独 title tooltip, hover 显示具体 reason
 *          (如 "数据源请求失败" / "该股无行业归属数据, 跳过同业对比").
 *          1 个 component 1 个 function, 不接 props / 不做动画, 只管展示.
 */
import { IconAlert } from "../../components/icons.jsx";
import { gapReasonText } from "../diagnosisStore.js";

export function DataGapsIndicator({ gaps }) {
  if (!gaps || gaps.length === 0) return null;
  const labels = gaps.map((g) => g.label).join("、");
  return (
    <div class="diagnosis-data-gaps" role="status" aria-live="polite">
      <IconAlert size={14} class="diagnosis-data-gaps-icon" />
      <span class="diagnosis-data-gaps-text">
        以下维度数据缺失, 暂不参与判断:&nbsp;
        {gaps.map((g, i) => (
          <span key={g.key}>
            <strong title={gapReasonText(g)}>{g.label}</strong>
            {i < gaps.length - 1 && "、"}
          </span>
        ))}
      </span>
    </div>
  );
}

export default DataGapsIndicator;