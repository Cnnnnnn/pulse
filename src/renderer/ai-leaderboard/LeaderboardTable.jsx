/**
 * src/renderer/ai-leaderboard/LeaderboardTable.jsx
 *
 * 多维度表格：列随维度高亮主评分列；数值列 tabular-nums。
 * 行数据由 store.deriveShown() 传入（已本地搜索+排序）。
 *
 * Props（兼容测试/独立渲染）：
 *  - models / rows：模型列表（rows 为别名）
 *  - dimension / category：可选覆盖，缺省时回退 store 信号（生产路径）
 */

import { activeDimension, activeCategory } from "./aiLeaderboardStore.js";
import { ModelRow } from "./ModelRow.jsx";

// v2.83: 维度按 AA Free tier 实字段重做, 表头同步.
// 删除 math/reasoning/price_perf (公式藏了真实价), 新增 agentic/speed/price.
const DIM_HEADER = {
  elo: "综合 ELO",
  intelligence: "智能指数",
  coding: "代码",
  agentic: "Agent",
  speed: "速度 (tok/s)",
  price: "输出价 /1M",
};

// 维度 → 需要高亮的次要列 (intelligence / coding / agentic 都有对应次要列)
const SECONDARY_ACTIVE = {
  intelligence: "intelligence",
  coding: "coding",
  agentic: "agentic",
};

export function LeaderboardTable({ models, rows, dimension, category }) {
  const dim = dimension || activeDimension.value;
  const cat = category || activeCategory.value;
  const secActive = SECONDARY_ACTIVE[dim];
  const list = rows || models || [];

  return (
    <div class="ai-lb-table-wrap">
      <table class="ai-lb-table">
        <thead>
          <tr>
            <th class="ai-lb-th ai-lb-col-rank" scope="col">#</th>
            <th class="ai-lb-th" scope="col">模型</th>
            <th class="ai-lb-th" scope="col">厂商</th>
            <th
              class="ai-lb-th ai-lb-col-num ai-lb-col--active"
              scope="col"
            >
              {DIM_HEADER[dim] || "评分"}
            </th>
            <th
              class={`ai-lb-th ai-lb-col-num${secActive === "intelligence" ? " ai-lb-col--active" : ""}`}
              scope="col"
            >
              智能
            </th>
            <th
              class={`ai-lb-th ai-lb-col-num${secActive === "coding" ? " ai-lb-col--active" : ""}`}
              scope="col"
            >
              代码
            </th>
            <th
              class={`ai-lb-th ai-lb-col-num${secActive === "agentic" ? " ai-lb-col--active" : ""}`}
              scope="col"
            >
              Agent
            </th>
            <th class="ai-lb-th ai-lb-col-num" scope="col">速度</th>
            <th class="ai-lb-th ai-lb-col-num" scope="col">输出价</th>
          </tr>
        </thead>
        <tbody>
          {list.map((m, i) => (
            <ModelRow
              key={m.id}
              model={m}
              rank={i + 1}
              dimension={dim}
              category={cat}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LeaderboardTable;
