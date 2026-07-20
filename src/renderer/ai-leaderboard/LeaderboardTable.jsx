/**
 * src/renderer/ai-leaderboard/LeaderboardTable.jsx
 *
 * v3.0 双视角表格：
 *  - Arena 视角：# / 模型 / 厂商 / ELO（简洁，每行必有数据）
 *  - AA 视角：# / 模型 / 厂商 / 智能指数 / 代码 / Agent / 速度 / 输出价（全维度）
 */

import { activeView, activeBoard, activeDim } from "./aiLeaderboardStore.js";
import { ARENA_BOARDS, AA_DIMENSIONS } from "./types.js";
import { ModelRow } from "./ModelRow.jsx";

export function LeaderboardTable({ rows, view, board, dim }) {
  const v = view || activeView.value;
  const b = board || activeBoard.value;
  const d = dim || activeDim.value;
  const list = rows || [];

  return (
    <div class="ai-lb-table-wrap">
      <table class="ai-lb-table" id="ai-leaderboard-table">
        <thead>
          {v === "arena" ? (
            <tr>
              <th class="ai-lb-th ai-lb-col-check" scope="col" />
              <th class="ai-lb-th ai-lb-col-rank" scope="col">#</th>
              <th class="ai-lb-th" scope="col">模型</th>
              <th class="ai-lb-th" scope="col">厂商</th>
              <th class="ai-lb-th ai-lb-col-num ai-lb-col--active" scope="col">
                ELO 分数
              </th>
              <th class="ai-lb-th ai-lb-col-num" scope="col">
                置信区间
              </th>
            </tr>
          ) : (
            <tr>
              <th class="ai-lb-th ai-lb-col-check" scope="col" />
              <th class="ai-lb-th ai-lb-col-rank" scope="col">#</th>
              <th class="ai-lb-th" scope="col">模型</th>
              <th class="ai-lb-th" scope="col">厂商</th>
              <th
                class={`ai-lb-th ai-lb-col-num${d === "intelligence" ? " ai-lb-col--active" : ""}`}
                scope="col"
              >
                智能指数
              </th>
              <th
                class={`ai-lb-th ai-lb-col-num${d === "coding" ? " ai-lb-col--active" : ""}`}
                scope="col"
              >
                代码
              </th>
              <th
                class={`ai-lb-th ai-lb-col-num${d === "agentic" ? " ai-lb-col--active" : ""}`}
                scope="col"
              >
                Agent
              </th>
              <th
                class={`ai-lb-th ai-lb-col-num${d === "speed" ? " ai-lb-col--active" : ""}`}
                scope="col"
              >
                速度
              </th>
              <th
                class={`ai-lb-th ai-lb-col-num${d === "price" ? " ai-lb-col--active" : ""}`}
                scope="col"
              >
                输出价
              </th>
              <th class="ai-lb-th ai-lb-col-num" scope="col">性价比</th>
            </tr>
          )}
        </thead>
        <tbody>
          {list.map((m, i) => (
            <ModelRow
              key={m.id}
              model={m}
              rank={i + 1}
              view={v}
              board={b}
              dim={d}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LeaderboardTable;
