/**
 * src/renderer/ai-leaderboard/LeaderboardTable.jsx
 *
 * v3.1 三视角表格（重设计 P0/P1）：
 *  - 列头可点选排序（data-sort + aria-sort + ▲▼ 指示）
 *  - sticky 表头 + 首列(对比) / 模型列 横向滚动固定（CSS 配合）
 *  - 主指标列内联条形（primaryKey + primaryMax 驱动）
 *  - 桌面表格 / 移动端卡片双渲染（CSS 控制显隐，状态共享 store）
 */

import {
  activeView,
  activeBoard,
  activeDim,
  activeLB,
  sortKey,
  sortDir,
  toggleSort,
  columnValue,
} from "./aiLeaderboardStore.js";
import { ModelRow } from "./ModelRow.jsx";
import { ModelCardList } from "./ModelCard.jsx";
import { ARENA_BOARDS } from "./types.js";

/** 可点选排序列头。 */
function SortableTh({ k, label, active, dir, title }) {
  const isActive = active === k;
  return (
    <th
      class={`ai-lb-th ai-lb-col-num${isActive ? " ai-lb-col--active" : ""} ai-lb-th--sortable`}
      scope="col"
      data-sort={k}
      role="columnheader"
      tabindex="0"
      title={title || `按${label}排序`}
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => toggleSort(k)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleSort(k);
        }
      }}
    >
      <span class="ai-lb-th-label">{label}</span>
      <span class={`ai-lb-sort-ind${isActive ? " is-on" : ""}`} aria-hidden="true">
        {isActive ? (dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}

export function LeaderboardTable({ rows, view, board, dim, lb }) {
  const v = view || activeView.value;
  const b = board || activeBoard.value;
  const d = dim || activeDim.value;
  const lbKey = lb || activeLB.value;
  const list = rows || [];

  // 当前驱动排序/强调的主列：列头点选优先，否则走视角主维度。
  const primaryKey =
    sortKey.value || (v === "arena" ? "elo" : v === "livebench" ? lbKey : d);

  // 主指标列最大值（内联条形归一化用）。
  let primaryMax = 0;
  for (const m of list) {
    const val = columnValue(m, v, primaryKey);
    if (typeof val === "number" && isFinite(val)) primaryMax = Math.max(primaryMax, val);
  }

  // 票数列最大值（内联条形归一化用，独立于主指标，仅 Arena 视角有意义）。
  let votesMax = 0;
  if (v === "arena") {
    const bm = ARENA_BOARDS[b] || ARENA_BOARDS.text;
    for (const m of list) {
      const s = m && m.arena && m.arena[bm.key];
      if (s && typeof s.votes === "number") votesMax = Math.max(votesMax, s.votes);
    }
  }

  const aKey = primaryKey;
  const dir = sortDir.value;

  return (
    <>
      <div class="ai-lb-table-wrap">
        <table class="ai-lb-table" id="ai-leaderboard-table" data-view={v}>
          <thead>
            {v === "arena" ? (
              <tr>
                <th class="ai-lb-th ai-lb-col-check" scope="col" aria-label="对比" />
                <th class="ai-lb-th ai-lb-col-rank" scope="col">#</th>
                <th class="ai-lb-th" scope="col">模型</th>
                <th class="ai-lb-th ai-lb-col-vendor" scope="col">厂商</th>
                <SortableTh k="elo" label="ELO 分数" active={aKey} dir={dir} />
                <SortableTh k="ci" label="置信区间" active={aKey} dir={dir} />
                <SortableTh k="votes" label="票数" active={aKey} dir={dir} title="该模型在本 board 的参与对战 / 投票数" />
              </tr>
            ) : v === "livebench" ? (
              <tr>
                <th class="ai-lb-th ai-lb-col-check" scope="col" aria-label="对比" />
                <th class="ai-lb-th ai-lb-col-rank" scope="col">#</th>
                <th class="ai-lb-th" scope="col">模型</th>
                <th class="ai-lb-th ai-lb-col-vendor" scope="col">厂商</th>
                <SortableTh k="lb_overall" label="综合" active={aKey} dir={dir} />
                <SortableTh k="lb_coding" label="Coding" active={aKey} dir={dir} />
                <SortableTh k="lb_language" label="Language" active={aKey} dir={dir} />
                <SortableTh k="lb_instfollow" label="指令遵循" active={aKey} dir={dir} />
                <SortableTh
                  k="lb_cost"
                  label="$/成功"
                  active={aKey}
                  dir={dir}
                  title="cost_per_successful_task — LiveBench 官网性价比主指标"
                />
              </tr>
            ) : (
              <tr>
                <th class="ai-lb-th ai-lb-col-check" scope="col" aria-label="对比" />
                <th class="ai-lb-th ai-lb-col-rank" scope="col">#</th>
                <th class="ai-lb-th" scope="col">模型</th>
                <th class="ai-lb-th ai-lb-col-vendor" scope="col">厂商</th>
                <SortableTh k="intelligence" label="智能指数" active={aKey} dir={dir} />
                <SortableTh k="coding" label="代码" active={aKey} dir={dir} />
                <SortableTh k="agentic" label="Agentic" active={aKey} dir={dir} />
                <SortableTh k="speed" label="速度" active={aKey} dir={dir} />
                <SortableTh k="price" label="输出价" active={aKey} dir={dir} />
                <SortableTh k="valueRatio" label="性价比" active={aKey} dir={dir} />
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
                primaryKey={aKey}
                primaryMax={primaryMax}
                votesMax={votesMax}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ModelCardList
        rows={list}
        view={v}
        board={b}
        dim={d}
        lb={lbKey}
        primaryKey={aKey}
        primaryMax={primaryMax}
        votesMax={votesMax}
      />
    </>
  );
}

export default LeaderboardTable;
