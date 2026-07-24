/**
 * src/renderer/ai-leaderboard/ModelRow.jsx
 *
 * v3.1 三视角行渲染（重设计 P0/P1）：
 *  - rank<=3 金/银/铜 medal（排名是榜单灵魂）
 *  - 主指标列内联条形（primaryKey + primaryMax 驱动）
 *  - 示例行：左侧色条 + 轻微底色（row 级 class，CSS 配合）
 */

import { forwardRef } from "preact/compat";
import { VENDOR_META, ARENA_BOARDS } from "./types.js";
import { fmtScore, fmtIndex, fmtSpeed, fmtPricePer1M, fmtLivebench, fmtLbCost, fmtVotes, fmtContext, fmtDownloads, fmtHfDate, fmtTrending, computeTrendingScore, licenseKind, licenseShort } from "./format.js";
import { compareList, toggleCompare, openModelDetail, baseModelCountMap, items } from "./aiLeaderboardStore.js";
import { RankSparkline } from "./RankSparkline.jsx";
import { ArenaBoardBars } from "./ArenaBoardBars.jsx";

// ponytail: forwardRef 把 virtuoso TableRow 的测量 ref 落到真实 <tr>，否则 ResizeObserver.observe(null)
export const ModelRow = forwardRef(function ModelRow(
  { model, rank, view, board, dim, lb, primaryKey, primaryMax, votesMax },
  ref,
) {
  const m = model || {};
  const aa = m.aa || {};
  const md = m.modelsdev || {};
  const lbData = m.livebench || {};
  const byCat = lbData.byCategory || {};
  const vendorLabel =
    (VENDOR_META[m.vendor] && VENDOR_META[m.vendor].label) || m.vendor || "—";

  // Arena 切片（所有视角复用，避免分支内重复解构）
  const boardMeta = view === "arena" ? (ARENA_BOARDS[board] || ARENA_BOARDS.text) : null;
  const arenaSlice = boardMeta && m.arena && m.arena[boardMeta.key] ? m.arena[boardMeta.key] : null;
  const licKind = licenseKind(m.license);
  const licBadge =
    licKind !== "unknown" ? (
      <span
        class={`ai-lb-license ai-lb-license--${licKind}`}
        title={m.license ? `许可：${m.license}` : "许可未知"}
      >
        {licenseShort(licKind)}
      </span>
    ) : null;
  const officialRank = arenaSlice && arenaSlice.rank ? arenaSlice.rank : null;
  const rankTitle = officialRank ? `官方排名 #${officialRank}` : undefined;

  const inCompare = compareList.value.includes(m.id);
  const compareDisabled = !inCompare && compareList.value.length >= 3;
  const sampleCls = m.isSample ? " ai-lb-row--sample" : "";
  const checkboxCell = (
    <td class="ai-lb-td ai-lb-col-check">
      <input
        type="checkbox"
        class="ai-lb-check"
        checked={inCompare}
        disabled={compareDisabled}
        aria-label={`对比 ${m.name}`}
        onChange={() => toggleCompare(m.id)}
      />
    </td>
  );

  const modelCell = (
    <td class="ai-lb-td ai-lb-col-model">
      <button
        type="button"
        class="ai-lb-cell-name-btn"
        onClick={(e) => {
          e.stopPropagation();
          openModelDetail(m.id);
        }}
        title="查看模型详情"
      >
        {m.name || "—"}
      </button>
      {m.isSample && (
        <span class="ai-lb-tag ai-lb-tag--sample" title="示例数据（离线快照）">示例</span>
      )}
      {view === "arena" && <ArenaBoardBars model={m} />}
    </td>
  );
  const vendorCell = (
    <td class="ai-lb-td ai-lb-col-vendor">
      <span class="ai-lb-vendor">
        {/* ponytail: HF view (v2.79.5+) — 优先显示 vendorRaw (HF author 原始组织名)
            如 "BAAI" / "meta-llama" / "pyannote" 等. 其它 view 走 VENDOR_META 归一
            (canonical 厂商中文友好名). HF 数据本身就是 author 名, 保留原样更有信息量. */}
        {view === "huggingface" && m.vendorRaw ? m.vendorRaw : vendorLabel}
        {licBadge}
      </span>
    </td>
  );

  // 排名：前 3 渲染奖牌，其余数字 + 变动标记。
  let deltaEl = null;
  if (m.isNew) {
    deltaEl = <span class="ai-lb-delta ai-lb-delta--new">NEW</span>;
  } else if (typeof m.rankDelta === "number" && m.rankDelta !== 0) {
    const up = m.rankDelta > 0;
    deltaEl = (
      <span class={`ai-lb-delta ${up ? "ai-lb-delta--up" : "ai-lb-delta--down"}`}>
        {up ? "↑" : "↓"}{Math.abs(m.rankDelta)}
      </span>
    );
  }
  const rankCell = (
    <td class="ai-lb-td ai-lb-col-rank" scope="row" title={rankTitle}>
      {rank <= 3
        ? <span class={`ai-lb-medal g${rank}`} aria-label={`第 ${rank} 名`}>{rank}</span>
        : <>{rank}{deltaEl}</>}
      <RankSparkline series={m.rankSeries} />
    </td>
  );

  // 内联条形：仅主指标列（primaryKey）渲染，width = 值/primaryMax。
  function bar(key, value) {
    if (key !== primaryKey || !primaryMax || typeof value !== "number" || !isFinite(value)) {
      return null;
    }
    const pct = Math.max(0, Math.min(100, (value / primaryMax) * 100));
    return (
      <div class="ai-lb-bar" aria-hidden="true">
        <i style={{ width: pct + "%" }} />
      </div>
    );
  }
  // 数值单元格：按 key 判定是否激活（主指标），并挂条形。
  function num(key, value, fmt, title) {
    const active = key === primaryKey;
    return (
      <td
        class={`ai-lb-td ai-lb-col-num${active ? " ai-lb-col--active" : ""}`}
        title={title}
      >
        {fmt(value)}
        {bar(key, value)}
      </td>
    );
  }

  // ponytail: HF 视角 (v2.79.5+) — 走 huggingface 切片, 主列 Downloads 内联条形.
  // v2.79.6+: 加 Trending 列 (computeTrendingScore 客户端算, 老模型 > 365 天返回 null).
  //         加 License 列 (按 license 类别聚类) + base_model 衍生数 tag.
  if (view === "huggingface") {
    const hf = m.huggingface || {};
    const downloads = typeof hf.downloads === "number" ? hf.downloads : null;
    const likes = typeof hf.likes === "number" ? hf.likes : null;
    const trending = computeTrendingScore(hf.downloads, hf.lastModified, hf.createdAt);
    // ponytail: base_model 衍生数 (v2.79.6+) — 一次扫描 items 算同 base_model 出现次数.
    // 派生 state, 不污染 m.huggingface schema (避免破现有 toEqual 断言).
    // count >= 2 才显示 (单个 base model 没意义, 1 就是它自己).
    const bmCount = hf.baseModel && items.value ? baseModelCountMap(items.value).get(hf.baseModel) : null;
    // ponytail: Library 列 — 库 + 量化标记. HF 数据里 library_name 覆盖广
    // (transformers/sentence-transformers/timm/diffusers), quantized 来自 base_model:quantized:* tag.
    const libLabel = hf.libraryName || "—";
    const libCell = (
      <td class="ai-lb-td" title={`推理库: ${libLabel}${hf.quantized ? " (量化版: GGUF/AWQ/GPTQ)" : ""}`}>
        {libLabel}
        {hf.quantized ? <span class="ai-lb-tag" style={{ marginLeft: "4px" }}>量化</span> : null}
      </td>
    );
    // ponytail: License 列 — 短名 + 衍生 baseModel tag (v2.79.6+).
    // 例: "apache-2.0" + "🎯 12 变体" (这个 base_model 在榜上还有 11 个微调版本).
    const licLabel = m.license || "—";
    const licCell = (
      <td class="ai-lb-td" title={m.license ? `许可: ${m.license}` : "未知许可"}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {licBadge}
          <span style={{ fontSize: "0.85em" }}>{licLabel}</span>
          {bmCount && bmCount >= 2 ? (
            <span class="ai-lb-tag" style={{ fontSize: "0.75em" }} title={`基于 ${hf.baseModel} 共 ${bmCount} 个变体在榜`}>
              🎯 {bmCount} 变体
            </span>
          ) : null}
        </div>
      </td>
    );
    return (
      <tr ref={ref} class={`ai-lb-row${sampleCls}`}>
        {checkboxCell}
        {rankCell}
        {modelCell}
        {vendorCell}
        {num("hf_downloads", downloads, fmtDownloads, "HuggingFace 累计下载量（按 downloads 降序）")}
        {num("hf_trending", trending, fmtTrending, "HF 趋势分数 = log10(downloads+1) / log10(age_days+2) — 新发布爆款优先")}
        {num("hf_likes", likes, fmtVotes, "HuggingFace 点赞数（社区认可）")}
        {licCell}
        <td class="ai-lb-td" title={hf.pipelineTag ? `Pipeline: ${hf.pipelineTag}` : "未知 pipeline"}>
          {hf.pipelineTag || "—"}
        </td>
        <td class="ai-lb-td" title={hf.lastModified ? `更新于 ${hf.lastModified}` : "未知更新时间"}>
          {fmtHfDate(hf.lastModified)}
        </td>
        {libCell}
      </tr>
    );
  }

  if (view === "livebench") {
    return (
      <tr ref={ref} class={`ai-lb-row${sampleCls}`}>
        {checkboxCell}
        {rankCell}
        {modelCell}
        {vendorCell}
        {num("lb_overall", lbData.overall, fmtLivebench)}
        {num("lb_coding", byCat.Coding, fmtLivebench)}
        {num("lb_language", byCat.Language, fmtLivebench)}
        {num("lb_instfollow", byCat.IF, fmtLivebench)}
        {/* ponytail: v2.79.7+ 加 Reasoning + Math (LB byCategory 5 个全暴露) */}
        {num("lb_reasoning", byCat.Reasoning, fmtLivebench)}
        {num("lb_math", byCat.Math, fmtLivebench)}
        {num(
          "lb_cost",
          lbData.cost && lbData.cost.perSuccessfulTask,
          fmtLbCost,
          lbData.cost && lbData.cost.price
            ? `$${lbData.cost.price.inputPer1M}/1M in · $${lbData.cost.price.outputPer1M}/1M out`
            : "无成本数据",
        )}
      </tr>
    );
  }

  if (view === "arena") {
    const elo = arenaSlice && typeof arenaSlice.score === "number" ? arenaSlice.score : null;
    const ci = arenaSlice && arenaSlice.ci != null ? arenaSlice.ci : null;
    const votes = arenaSlice && typeof arenaSlice.votes === "number" ? arenaSlice.votes : null;
    const votesCell = (
      <td class="ai-lb-td ai-lb-col-num" title={votes != null ? `${votes.toLocaleString()} 票` : "无票数数据"}>
        {votes != null ? fmtVotes(votes) : "—"}
        {votes != null && votesMax ? (
          <div class="ai-lb-bar" aria-hidden="true">
            <i style={{ width: Math.max(0, Math.min(100, (votes / votesMax) * 100)) + "%" }} />
          </div>
        ) : null}
      </td>
    );
    return (
      <tr ref={ref} class={`ai-lb-row${sampleCls}`}>
        {checkboxCell}
        {rankCell}
        {modelCell}
        {vendorCell}
        {num("elo", elo, fmtScore)}
        {num("ci", ci, (v) => (v != null ? `±${Math.round(v)}` : "—"))}
        {votesCell}
        {num(
          "context",
          typeof md.contextLength === "number" ? md.contextLength : null,
          fmtContext,
          "上下文窗口（来自 models.dev）",
        )}
      </tr>
    );
  }

  // AA 视角
  const vr =
    aa.intelligenceIndex != null && aa.priceOutputPer1M > 0
      ? aa.intelligenceIndex / aa.priceOutputPer1M
      : null;
  return (
    <tr ref={ref} class={`ai-lb-row${sampleCls}`}>
      {checkboxCell}
      {rankCell}
      {modelCell}
      {vendorCell}
      {num("intelligence", aa.intelligenceIndex, fmtIndex)}
      {num("coding", aa.codingIndex, fmtIndex)}
      {num("agentic", aa.agenticIndex, fmtIndex)}
      {num("speed", aa.outputTokensPerSec, fmtSpeed)}
      {num("price", aa.priceOutputPer1M, fmtPricePer1M)}
      {num(
        "inputPrice",
        typeof md.inputCostPer1M === "number" ? md.inputCostPer1M : null,
        fmtPricePer1M,
        "输入价（来自 models.dev）",
      )}
      {num("valueRatio", vr, (v) => (v == null ? "—" : v.toFixed(1)))}
      {num(
        "context",
        typeof md.contextLength === "number" ? md.contextLength : null,
        fmtContext,
        "上下文窗口（来自 models.dev）",
      )}
    </tr>
  );
});

export default ModelRow;
