/**
 * src/renderer/ai-leaderboard/ModelCard.jsx
 *
 * v3.1 移动端卡片列表（重设计 P0）：
 *  - 每模型一卡 = medal 排名 + 模型名 + 主指标大数字 + 其余指标 2×N 网格 + 对比勾选
 *  - 与 LeaderboardTable 同数据源 / 同对比状态（共享 store）
 *  - 桌面端由 CSS 隐藏（display:none），仅 <640px 显示
 */

import { VENDOR_META } from "./types.js";
import { fmtScore, fmtIndex, fmtSpeed, fmtPricePer1M, fmtLivebench, fmtLbCost, fmtVotes, fmtContext, licenseKind, licenseShort } from "./format.js";
import { compareList, toggleCompare, columnValue, openModelDetail } from "./aiLeaderboardStore.js";
import { RankSparkline } from "./RankSparkline.jsx";
import { ArenaBoardBars } from "./ArenaBoardBars.jsx";

const FIELDS = {
  arena: [
    { key: "elo", label: "ELO 分数", fmt: fmtScore },
    { key: "ci", label: "置信区间", fmt: (v) => (v != null ? `±${Math.round(v)}` : "—") },
    { key: "votes", label: "票数", fmt: fmtVotes },
    { key: "context", label: "上下文", fmt: fmtContext },
  ],
  aa: [
    { key: "intelligence", label: "智能指数", fmt: fmtIndex },
    { key: "coding", label: "代码", fmt: fmtIndex },
    { key: "agentic", label: "Agentic", fmt: fmtIndex },
    { key: "speed", label: "速度", fmt: fmtSpeed },
    { key: "price", label: "输出价", fmt: fmtPricePer1M },
    { key: "inputPrice", label: "输入价", fmt: fmtPricePer1M },
    { key: "valueRatio", label: "性价比", fmt: (v) => (v == null ? "—" : v.toFixed(1)) },
    { key: "context", label: "上下文", fmt: fmtContext },
  ],
  livebench: [
    { key: "lb_overall", label: "综合", fmt: fmtLivebench },
    { key: "lb_coding", label: "Coding", fmt: fmtLivebench },
    { key: "lb_language", label: "Language", fmt: fmtLivebench },
    { key: "lb_instfollow", label: "指令遵循", fmt: fmtLivebench },
    { key: "lb_cost", label: "$/成功", fmt: fmtLbCost },
  ],
};

function ModelCard({ m, rank, view, primaryKey }) {
  const fields = FIELDS[view] || [];
  const primary = fields.find((f) => f.key === primaryKey) || fields[0];
  const pval = columnValue(m, view, primaryKey);
  const others = fields.filter((f) => f.key !== primaryKey);

  const inCompare = compareList.value.includes(m.id);
  const disabled = !inCompare && compareList.value.length >= 3;
  const vendorLabel = (VENDOR_META[m.vendor] && VENDOR_META[m.vendor].label) || m.vendor || "—";
  const licKind = licenseKind(m.license);
  const licBadge = licKind !== "unknown" ? (
    <span class={`ai-lb-license ai-lb-license--${licKind}`} title={m.license ? `许可：${m.license}` : "许可未知"}>
      {licenseShort(licKind)}
    </span>
  ) : null;

  return (
    <div class={`ai-lb-card${m.isSample ? " ai-lb-row--sample" : ""}`}>
      <div class="ai-lb-card__head">
        <span class="ai-lb-card__rank">
          {rank <= 3
            ? <span class={`ai-lb-medal g${rank}`} aria-label={`第 ${rank} 名`}>{rank}</span>
            : rank}
        </span>
        <span class="ai-lb-card__name">
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
          {m.isSample && <span class="ai-lb-tag ai-lb-tag--sample" title="示例数据（离线快照）">示例</span>}
        </span>
        <label class="ai-lb-card__check">
          <input
            type="checkbox"
            class="ai-lb-check"
            checked={inCompare}
            disabled={disabled}
            aria-label={`对比 ${m.name}`}
            onChange={() => toggleCompare(m.id)}
          />
        </label>
      </div>

      <div class="ai-lb-card__primary">
        <span class="ai-lb-card__plabel">{primary ? primary.label : "主指标"}</span>
        <span class="ai-lb-card__pval">{primary ? primary.fmt(pval) : "—"}</span>
      </div>

      <div class="ai-lb-card__grid">
        {others.map((f) => (
          <div class="ai-lb-card__cell" key={f.key}>
            <span class="ai-lb-card__clabel">{f.label}</span>
            <span class="ai-lb-card__cval">{f.fmt(columnValue(m, view, f.key))}</span>
          </div>
        ))}
      </div>

      <div class="ai-lb-card__vendor">{vendorLabel}{licBadge}</div>

      {view === "arena" && (
        <div class="ai-lb-card__extra">
          <ArenaBoardBars model={m} />
          <RankSparkline series={m.rankSeries} />
        </div>
      )}
    </div>
  );
}

export function ModelCardList({ rows, view, primaryKey }) {
  const list = rows || [];
  return (
    <div class="ai-lb-cards">
      {list.map((m, i) => (
        <ModelCard key={m.id} m={m} rank={i + 1} view={view} primaryKey={primaryKey} />
      ))}
    </div>
  );
}

export default ModelCardList;
