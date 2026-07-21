/**
 * src/renderer/ai-leaderboard/BoardHealthCard.jsx
 *
 * 数据健康看板 (v2.83 → v3.2):
 *  - 5 个数据源徽标 (Arena / AA / LB / OR / MD), 显示每个源在当前列表里覆盖了多少行
 *  - hover 单个 chip 出现「隐藏」按钮，点击该 source chip 不再渲染（会话级）
 *  - 已隐藏的 source 数 >0 时显示「+N 已隐藏」chip，点击恢复全部
 *  - 一行解释文字 (为什么有些行某些列是 "—")
 *  - 用户据此理解合并行为 + 跨源命名差异 (无 ground truth 跨源合并)
 */

import { sourceCoverage, sources, hiddenHealthSources, toggleHealthSource, resetHealthSources } from "./aiLeaderboardStore.js";

const SOURCE_META = [
  { key: "arena", label: "Arena", color: "blue", desc: "社区 ELO 排名" },
  { key: "aa", label: "AA", color: "purple", desc: "客观分 / 价格 / 速度" },
  { key: "livebench", label: "LB", color: "livebench", desc: "抗污染客观评测 (livebench.ai)" },
  { key: "openrouter", label: "OR", color: "teal", desc: "目录骨架" },
  { key: "modelsdev", label: "MD", color: "modelsdev", desc: "模型元数据 (models.dev)" },
];

/**
 * @param {{total:number, compact?: boolean}} props
 */
export function BoardHealthCard({ total, compact = false }) {
  const cov = sourceCoverage.value || {};
  const src = sources.value || {};
  const hidden = hiddenHealthSources.value || new Set();
  const totalN = Number.isFinite(total) ? total : 0;

  // 没数据时整张卡隐藏, 不画空架子
  if (totalN === 0) return null;

  const visibleMeta = SOURCE_META.filter((m) => !hidden.has(m.key));
  const hiddenN = hidden.size;

  return (
    <div class={`ai-lb-health${compact ? " ai-lb-health--compact" : ""}`} aria-label="数据源覆盖">
      <div class="ai-lb-health__row">
        {visibleMeta.map((m) => {
          const live = src[m.key] === "live";
          const sample = src[m.key] === "sample";
          const count = cov[m.key] || 0;
          // 活源但当前 category 下 0 覆盖 → 警告 (该源端点活, 但未收录此分类)
          const liveButEmpty = live && count === 0;
          return (
            <span
              key={m.key}
              class={`ai-lb-health__chip ai-lb-health__chip--${m.color}${live ? " is-live" : ""}${sample ? " is-sample" : ""}${liveButEmpty ? " is-live-but-empty" : ""}`}
              title={
                liveButEmpty
                  ? `${m.label} 端点可用但本分类无收录 (例如 AA 仅 LLM) · 点击隐藏`
                  : `${m.label} — ${m.desc} · 点击隐藏`
              }
              role="button"
              tabindex="0"
              onClick={() => toggleHealthSource(m.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleHealthSource(m.key);
                }
              }}
            >
              <span class="ai-lb-health__dot" aria-hidden="true" />
              <span class="ai-lb-health__name">{m.label}</span>
              <span class="ai-lb-health__count">{count}</span>
              <span class="ai-lb-health__of">/{totalN}</span>
              {liveButEmpty && (
                <span class="ai-lb-health__warn" aria-label="本分类无收录">
                  ⚠
                </span>
              )}
            </span>
          );
        })}
        {hiddenN > 0 && (
          <button
            type="button"
            class="ai-lb-health__chip ai-lb-health__chip--restore"
            title={`已隐藏 ${hiddenN} 个 source，点击恢复全部`}
            onClick={resetHealthSources}
          >
            +{hiddenN} 已隐藏 · 恢复
          </button>
        )}
      </div>
      {!compact && (
        <p class="ai-lb-health__note">
          行数 = 当前筛选后模型数；覆盖率 = 该源切片填了多少行。空缺 = 该源未收录本分类
          （Arena 用内部代号、AA 仅 LLM 端点），非 bug。⚠ 标表示端点可用但本分类零覆盖。点 chip 可隐藏/恢复 source 徽标。
        </p>
      )}
    </div>
  );
}

export default BoardHealthCard;