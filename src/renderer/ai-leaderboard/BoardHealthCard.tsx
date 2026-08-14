/**
 * src/renderer/ai-leaderboard/BoardHealthCard.tsx
 *
 * 数据健康看板 (v2.83 → v3.2):
 *  - 5 个数据源徽标 (Arena / AA / LB / OR / MD), 显示每个源在当前可见列表里覆盖了多少行
 *  - hover 单个 chip 出现「隐藏」按钮，点击该 source chip 不再渲染（会话级）
 *  - 已隐藏的 source 数 >0 时显示「+N 已隐藏」chip，点击恢复全部
 *  - 一行解释文字 (为什么有些行某些列是 "—")
 *  - 用户据此理解合并行为 + 跨源命名差异 (无 ground truth 跨源合并)
 */

import { sourceCoverage, sources, hiddenHealthSources, toggleHealthSource, resetHealthSources, rateBudget, stale, fetchedAt, isSample, lastFetchErrors } from "./aiLeaderboardStore.ts";
import { fmtRelative } from "./format.ts";

const SOURCE_META = [
  { key: "arena", label: "Arena", color: "blue", desc: "社区 ELO 排名" },
  { key: "aa", label: "AA", color: "purple", desc: "客观分 / 价格 / 速度" },
  { key: "livebench", label: "LB", color: "livebench", desc: "抗污染客观评测 (livebench.ai)" },
  { key: "openrouter", label: "OR", color: "teal", desc: "目录骨架" },
  { key: "modelsdev", label: "MD", color: "modelsdev", desc: "模型元数据 (models.dev)" },
  { key: "huggingface", label: "HF", color: "huggingface", desc: "社区下载 / 点赞" },
];

const SOURCE_LABELS = {
  arena: "Arena",
  "artificial-analysis": "AA",
  openrouter: "OpenRouter",
  livebench: "LiveBench",
  "models-dev": "Models.dev",
  huggingface: "HuggingFace",
};

/**
 * @param {{total:number, items?: object[], compact?: boolean}} props
 */
export function BoardHealthCard({ total, items, compact = false }) {
  const cov = sourceCoverage.value || {};
  const src = sources.value || {};
  const hidden = hiddenHealthSources.value || new Set();
  const totalN = Number.isFinite(total) ? total : 0;
  const visibleItems = Array.isArray(items) ? items : null;
  const staleValue = stale.value;
  const staleSinceMs = fetchedAt.value
    ? Date.parse(fetchedAt.value)
    : null;
  const isSampleValue = isSample.value;
  const errors = Array.isArray(lastFetchErrors.value) ? lastFetchErrors.value : [];
  // ponytail: rateBudget 信号默认 {}，消费端 cast 出 AA 预算字段
  const aaBudget = (rateBudget.value || {}) as { used?: number; limit?: number };
  const aaUsedPct = aaBudget && Number.isFinite(aaBudget.limit) && (aaBudget.limit as number) > 0
    ? Math.round(((aaBudget.used || 0) / (aaBudget.limit as number)) * 100)
    : 0;
  const aaWarn = aaUsedPct >= 80;

  // 没数据时整张卡隐藏, 不画空架子
  if (totalN === 0) return null;

  const hasHfState = Object.prototype.hasOwnProperty.call(src, "huggingface")
    || Object.prototype.hasOwnProperty.call(cov, "huggingface")
    || errors.some((e) => e && e.source === "huggingface");
  const visibleMeta = SOURCE_META.filter((m) => (m.key !== "huggingface" || hasHfState) && !hidden.has(m.key));
  const hiddenN = hidden.size;

  return (
    <div class={`ai-lb-health${compact ? " ai-lb-health--compact" : ""}`} aria-label="数据源覆盖">
      {Boolean(staleValue) && !isSampleValue && !compact && (
        <div class="ai-lb-health__stale" role="status" aria-label="数据陈旧">
          <span class="ai-lb-health__stale-dot" aria-hidden="true" />
          <span>
            数据陈旧 · 最后拉取 {fmtRelative(staleSinceMs)}
          </span>
        </div>
      )}
      <div class="ai-lb-health__row">
        {visibleMeta.map((m) => {
          const live = src[m.key] === "live";
          const sample = src[m.key] === "sample";
          // 主进程 sourceCoverage 按聚合结果统计；AA/HF 视角在 renderer 还会
          // 按维度二次过滤，因此这里必须以当前可见 rows 重算，避免出现 1649/596。
          const count = visibleItems
            ? visibleItems.filter((item) => {
                const slice = item && item[m.key];
                if (!slice || typeof slice !== "object") return false;
                return m.key !== "arena" || Object.keys(slice).length > 0;
              }).length
            : cov[m.key] || 0;
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
              tabIndex={0}
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
      {errors.length > 0 && (
        <div class="ai-lb-health__errors" role="status" aria-label="数据源请求错误">
          <strong>部分请求失败</strong>
          {errors.slice(0, 4).map((e) => (
            <span key={`${e.source}-${e.ts}`} title={e.message}>
              {SOURCE_LABELS[e.source] || e.source}: {e.message}
            </span>
          ))}
        </div>
      )}
      {aaBudget && Number.isFinite(aaBudget.limit) && (
        <div class={`ai-lb-budget${aaWarn ? " is-warn" : ""}`} aria-label="AA 今日预算">
          <span class="ai-lb-budget__label">AA 今日</span>
          <strong class="ai-lb-budget__num">{aaBudget.used}/{aaBudget.limit}</strong>
          {aaWarn && <span class="ai-lb-budget__warn" aria-label="预算紧张">⚠</span>}
        </div>
      )}
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
