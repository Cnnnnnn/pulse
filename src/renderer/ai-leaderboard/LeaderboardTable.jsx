/**
 * src/renderer/ai-leaderboard/LeaderboardTable.jsx
 *
 * v3.0 双视角表格：
 *  - Arena 视角：# / 模型 / 厂商 / ELO（简洁，每行必有数据）
 *  - AA 视角：# / 模型 / 厂商 / 智能指数 / 代码 / Agent / 速度 / 输出价（全维度）
 */

import { activeView, activeBoard, activeDim, activeLB } from "./aiLeaderboardStore.js";
import { ARENA_BOARDS, AA_DIMENSIONS, LIVE_DIMENSIONS } from "./types.js";
import { ModelRow } from "./ModelRow.jsx";

export function LeaderboardTable({ rows, view, board, dim, lb }) {
  const v = view || activeView.value;
  const b = board || activeBoard.value;
  const d = dim || activeDim.value;
  const lbKey = lb || activeLB.value;
  const list = rows || [];

  return (
    <div class="ai-lb-table-wrap">
      <table class="ai-lb-table" id="ai-leaderboard-table" data-view={v}>
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
          ) : v === "livebench" ? (
            <tr>
              <th class="ai-lb-th ai-lb-col-check" scope="col" />
              <th class="ai-lb-th ai-lb-col-rank" scope="col">#</th>
              <th class="ai-lb-th" scope="col">模型</th>
              <th class="ai-lb-th" scope="col">厂商</th>
              <th
                class={`ai-lb-th ai-lb-col-num${lbKey === "lb_overall" ? " ai-lb-col--active" : ""}`}
                scope="col"
              >
                综合
              </th>
              <th
                class={`ai-lb-th ai-lb-col-num${lbKey === "lb_coding" ? " ai-lb-col--active" : ""}`}
                scope="col"
              >
                Coding
              </th>
              <th
                class={`ai-lb-th ai-lb-col-num${lbKey === "lb_language" ? " ai-lb-col--active" : ""}`}
                scope="col"
              >
                Language
              </th>
              <th
                class={`ai-lb-th ai-lb-col-num${lbKey === "lb_instfollow" ? " ai-lb-col--active" : ""}`}
                scope="col"
              >
                指令遵循
              </th>
              <th class="ai-lb-th ai-lb-col-num" scope="col" title="cost_per_successful_task — LiveBench 官网性价比主指标">
                $/成功
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
              lb={lbKey}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LeaderboardTable;
