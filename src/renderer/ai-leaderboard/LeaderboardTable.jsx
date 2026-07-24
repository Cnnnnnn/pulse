/**
 * src/renderer/ai-leaderboard/LeaderboardTable.jsx
 *
 * v3.2 三视角表格（虚拟化 P0）：
 *  - 列头可点选排序（data-sort + aria-sort + ▲▼ 指示）
 *  - sticky 表头 + 首列(对比) / 模型列 横向滚动固定（CSS 配合）
 *  - 主指标列内联条形（primaryKey + primaryMax 驱动）
 *  - 桌面表格 / 移动端卡片双渲染（CSS 控制显隐，状态共享 store）
 *  - 桌面表格 ≥200 行套 react-virtuoso TableVirtuoso，仅渲染可见行
 */

import { cloneElement, toChildArray } from "preact";
import { forwardRef } from "preact/compat";
import { TableVirtuoso } from "react-virtuoso";
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

// ponytail: Preact 自定义组件必须 forwardRef，否则 virtuoso 的 ResizeObserver 拿到 null
const VirtuosoTable = forwardRef((props, ref) => (
  <table {...props} ref={ref} class="ai-lb-table" id="ai-leaderboard-table" />
));
const VirtuosoTableHead = forwardRef((props, ref) => <thead {...props} ref={ref} />);
const VirtuosoTableBody = forwardRef((props, ref) => <tbody {...props} ref={ref} />);
// ModelRow 已返回完整 <tr>；把 virtuoso 的测量 ref / style 合并上去，避免 <tr><tr>
const VirtuosoTableRow = forwardRef(({ children, ...props }, ref) => {
  const child = toChildArray(children)[0];
  if (child && typeof child === "object") {
    return cloneElement(child, { ...props, ref });
  }
  return (
    <tr {...props} ref={ref}>
      {children}
    </tr>
  );
});

export function LeaderboardTable({ rows, view, board, dim, lb }) {
  const v = view || activeView.value;
  const b = board || activeBoard.value;
  const d = dim || activeDim.value;
  const lbKey = lb || activeLB.value;
  const list = rows || [];

  // 当前驱动排序/强调的主列：列头点选优先，否则走视角主维度。
  // ponytail: HF 视角 (v2.79.5+) — 主维度走 hf_downloads (renderer store 端 activeDim 兜底 "hf_downloads").
  // v2.79.6+: hf_trending 不在这里走 (列头点选 sortKey 走它, store 端 columnValue 会调 computeTrendingScore).
  const primaryKey =
    sortKey.value ||
    (v === "arena"
      ? "elo"
      : v === "livebench"
      ? lbKey
      : v === "huggingface"
      ? "hf_downloads"
      : d);

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

  // thead `<tr>` 内容：v4 virtuoso 会把它包进 `<thead>`，所以这里只返单行 `<tr>`
  const headRow =
    v === "arena" ? (
      <tr>
        <th class="ai-lb-th ai-lb-col-check" scope="col" aria-label="对比" />
        <th class="ai-lb-th ai-lb-col-rank" scope="col">#</th>
        <th class="ai-lb-th" scope="col">模型</th>
        <th class="ai-lb-th ai-lb-col-vendor" scope="col">厂商</th>
        <SortableTh k="elo" label="ELO 分数" active={aKey} dir={dir} />
        <SortableTh k="ci" label="置信区间" active={aKey} dir={dir} />
        <SortableTh k="votes" label="票数" active={aKey} dir={dir} title="该模型在本 board 的参与对战 / 投票数" />
        <SortableTh
          k="context"
          label="上下文"
          active={aKey}
          dir={dir}
          title="上下文窗口（models.dev 提供）"
        />
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
        {/* ponytail: v2.79.7+ 加 Reasoning + Math (LB byCategory 5 个全暴露) */}
        <SortableTh k="lb_reasoning" label="Reasoning" active={aKey} dir={dir} title="LiveBench Reasoning 平均分" />
        <SortableTh k="lb_math" label="Math" active={aKey} dir={dir} title="LiveBench Math 平均分" />
        <SortableTh
          k="lb_cost"
          label="$/成功"
          active={aKey}
          dir={dir}
          title="cost_per_successful_task — LiveBench 官网性价比主指标"
        />
      </tr>
    ) : v === "huggingface" ? (
      // ponytail: HF 视角 (v2.79.5+) — 主列 Downloads (内联条形), 副 Trending / Likes / License / Pipeline / 最后更新 / Library.
      // Library 列替换"上下文": HF 数据本身没 context, models.dev 也没收录 HF top 200
      // (大都是 embedding/ASR/旧模型), 用 libraryName 替代更有信息量.
      // v2.79.6+: Trending 列加在 Downloads 和 Likes 之间 (新发布爆款优先).
      //         License 列加在 Likes 后 (按 license 类别聚类: open/proprietary/unknown).
      <tr>
        <th class="ai-lb-th ai-lb-col-check" scope="col" aria-label="对比" />
        <th class="ai-lb-th ai-lb-col-rank" scope="col">#</th>
        <th class="ai-lb-th" scope="col">模型</th>
        <th class="ai-lb-th ai-lb-col-vendor" scope="col">厂商</th>
        <SortableTh
          k="hf_downloads"
          label="Downloads"
          active={aKey}
          dir={dir}
          title="HuggingFace Hub 累计下载量（按下载量降序排列 top 5000）"
        />
        <SortableTh
          k="hf_trending"
          label="Trending"
          active={aKey}
          dir={dir}
          title="HF 趋势分数 = log10(downloads+1) / log10(age_days+2) — 兼顾下载量 + 新近度, 新发布爆款会排前"
        />
        <SortableTh
          k="hf_likes"
          label="Likes"
          active={aKey}
          dir={dir}
          title="HuggingFace Hub 点赞数（社区认可度）"
        />
        <SortableTh
          k="hf_license"
          label="License"
          active={aKey}
          dir={dir}
          title="按 License 类别聚类: open / proprietary / unknown (commercial users 通常筛 open)"
        />
        <th class="ai-lb-th" scope="col" title="HuggingFace Pipeline Tag (text-generation / sentence-similarity 等)">Pipeline</th>
        <th class="ai-lb-th" scope="col" title="HuggingFace 模型最后更新时间">最后更新</th>
        <th class="ai-lb-th" scope="col" title="推理库 (transformers / sentence-transformers / timm / diffusers) + 量化标记 (GGUF/AWQ/GPTQ)">Library</th>
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
        <SortableTh
          k="inputPrice"
          label="输入价"
          active={aKey}
          dir={dir}
          title="输入 token 价格（models.dev 提供）— AA Free tier 不返回此字段，作为价格兜底"
        />
        <SortableTh k="valueRatio" label="性价比" active={aKey} dir={dir} />
        <SortableTh
          k="context"
          label="上下文"
          active={aKey}
          dir={dir}
          title="上下文窗口（models.dev 提供）— 列头点选按上下文大小排序"
        />
      </tr>
    );

  const renderRow = (index, model) => (
    <ModelRow
      model={model}
      rank={index + 1}
      view={v}
      board={b}
      dim={d}
      lb={lbKey}
      primaryKey={aKey}
      primaryMax={primaryMax}
      votesMax={votesMax}
    />
  );

  return (
    <>
      <div class="ai-lb-table-wrap">
        <TableVirtuoso
          data={list}
          style={{ height: "100%" }}
          // ponytail: happy-dom 量不到容器高度；生产用合理上限避免首屏建全量 DOM
          initialItemCount={Math.min(list.length, 40)}
          components={{
            Table: VirtuosoTable,
            TableHead: VirtuosoTableHead,
            TableBody: VirtuosoTableBody,
            TableRow: VirtuosoTableRow,
          }}
          fixedHeaderContent={() => headRow}
          itemContent={renderRow}
        />
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
