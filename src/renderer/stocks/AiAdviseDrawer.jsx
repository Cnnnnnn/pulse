/**
 * src/renderer/stocks/AiAdviseDrawer.jsx
 *
 * 阶段二: AI 推荐策略抽屉 — 6 个预设 chip + 可选自由文本 → 生成预览 → 应用.
 * 走 stockStore.requestAiAdvise / applyAiAdvise (signal-driven).
 *
 * ponytail: 不做对话式追问, 单轮意图 + 一份预览. 不自动点筛选.
 *          复用 AIDrawerShell (不引入新 modal 容器).
 */
import { useState } from "preact/hooks";
import {
  aiAdvise,
  aiAdviseOpen,
  closeAdvise,
  requestAiAdvise,
  applyAiAdvise,
} from "./stockStore.js";
import { AIDrawerShell } from "../components/AIDrawerShell.jsx";

// ponytail: 6 个预设 chip 跟 strategies.js 同级硬编码 (不开新 store 模块).
//   label 给用户看, id 是 LLM prompt 里的"意图标识".
const PRESET_CHIPS = [
  { id: "low_value", label: "低估值修复" },
  { id: "high_div", label: "高分红防御" },
  { id: "oversold", label: "超跌反弹" },
  { id: "growth_momentum", label: "成长动量" },
  { id: "industry_leader", label: "行业龙头" },
  { id: "balanced", label: "平衡型" },
];

const ERROR_REASON_TEXT = {
  config_missing: "AI 未配置, 请去 AI 设置配置 Provider 和 Key",
  api_key_missing: "AI Key 缺失, 请去 AI 设置补充",
  budget_exceeded: "今日 token 预算已用完, 明天重试或去设置加预算",
  parse_failed: "AI 返回格式异常, 请重试",
  llm_failed: "AI 调用失败, 请稍后重试",
  no_api: "AI 通道未就绪",
};

export function AiAdviseDrawer({ api }) {
  const open = aiAdviseOpen.value;
  const state = aiAdvise.value;
  const [selectedChip, setSelectedChip] = useState(PRESET_CHIPS[0].id);
  const [freeText, setFreeText] = useState("");

  function handleGenerate() {
    const chip = PRESET_CHIPS.find((c) => c.id === selectedChip);
    if (!chip) return;
    void requestAiAdvise(api, {
      intentChip: chip,
      freeText,
    });
  }

  function handleApply() {
    applyAiAdvise();
  }

  return (
    <AIDrawerShell
      open={open}
      onClose={closeAdvise}
      title="🧠 AI 推荐"
      subtitle="根据偏好 + 市场现状给出筛选条件"
    >
      <div class="stock-advise-subtitle">
        描述你的意图, AI 基于当日市场快照推荐筛选条件.
        <br />
        <span class="stock-advise-hint">最终股票仍由筛选规则按这些条件产出, AI 不直接荐股.</span>
      </div>

      <div class="stock-advise-body">
        {/* chip 选择 */}
        <div class="stock-advise-section">
          <div class="stock-advise-label">选个意图</div>
          <div class="stock-advise-chips">
            {PRESET_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                class={`stock-advise-chip${selectedChip === chip.id ? " active" : ""}`}
                onClick={() => setSelectedChip(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* 自由文本 */}
        <div class="stock-advise-section">
          <div class="stock-advise-label">
            补充说明 <span class="stock-advise-hint">(可选, 例: "我偏银行地产")</span>
          </div>
          <input
            class="stock-advise-input"
            type="text"
            value={freeText}
            onInput={(e) => setFreeText(e.currentTarget.value)}
            placeholder="可补充偏好行业 / 风险偏好 / 持有周期…"
            maxLength={120}
            autoComplete="off"
          />
        </div>

        {/* 生成按钮 */}
        <button
          type="button"
          class="stock-btn stock-btn-primary stock-btn-lg stock-advise-generate"
          disabled={state.status === "loading"}
          onClick={handleGenerate}
        >
          {state.status === "loading" ? "⏳ 生成中…" : "🚀 生成推荐"}
        </button>

        {/* 错误态 */}
        {state.status === "error" && (
          <div class="stock-advise-error">
            <div class="stock-advise-error-title">⚠️ 出错了</div>
            <div class="stock-advise-error-sub">
              {ERROR_REASON_TEXT[state.reason] || state.error || state.reason || "未知错误"}
            </div>
            <button
              type="button"
              class="stock-btn stock-btn-secondary"
              onClick={handleGenerate}
            >
              重试
            </button>
          </div>
        )}

        {/* 预览 */}
        {state.status === "ready" && state.result && (
          <div class="stock-advise-preview">
            <PreviewBlock result={state.result} fromCache={state.fromCache} />
            <div class="stock-advise-actions">
              <button
                type="button"
                class="stock-btn stock-btn-secondary"
                onClick={closeAdvise}
              >
                取消
              </button>
              <button
                type="button"
                class="stock-btn stock-btn-primary"
                onClick={handleApply}
              >
                应用这套条件
              </button>
            </div>
            <div class="stock-advise-apply-hint">
              应用后会填到条件区, 请手动点「🔍 筛选」确认.
            </div>
          </div>
        )}
      </div>
    </AIDrawerShell>
  );
}

function PreviewBlock({ result, fromCache }) {
  const c = result.criteria || {};
  const items = [];
  if (c.peMin != null || c.peMax != null) {
    items.push(`PE ${c.peMin ?? "—"} - ${c.peMax ?? "—"}`);
  }
  if (c.pbMin != null || c.pbMax != null) {
    items.push(`PB ${c.pbMin ?? "—"} - ${c.pbMax ?? "—"}`);
  }
  if (c.roeMin != null) items.push(`ROE ≥ ${c.roeMin}%`);
  if (c.dividendYieldMin != null) items.push(`股息率 ≥ ${c.dividendYieldMin}%`);
  if (c.turnoverMin != null || c.turnoverMax != null) {
    items.push(`换手率 ${c.turnoverMin ?? "—"} - ${c.turnoverMax ?? "—"}%`);
  }
  if (c.change5dMin != null) items.push(`近5日 ≥ ${c.change5dMin}%`);
  if (c.marketCapTier && c.marketCapTier !== "all") {
    const label = { large: "大盘", mid: "中盘", small: "小盘" }[c.marketCapTier] || c.marketCapTier;
    items.push(`市值 ${label}`);
  }
  if (Array.isArray(c.industries) && c.industries.length > 0) {
    items.push(`行业 ${c.industries.join("、")}`);
  }
  const sort = result.sortConfig;
  const sortText = sort
    ? `${labelOfSort(sort.key)} ${sort.dir === "asc" ? "升序" : "降序"}`
    : null;

  return (
    <>
      <div class="stock-advise-section-title">
        📊 推荐条件
        {fromCache && <span class="stock-advise-cache-tag">缓存命中</span>}
      </div>
      <ul class="stock-advise-list">
        {items.length === 0 ? (
          <li class="stock-advise-list-empty">无具体阈值 (仅基于意图给出方向)</li>
        ) : (
          items.map((it, i) => <li key={i}>{it}</li>)
        )}
        {sortText && <li class="stock-advise-sort">排序: {sortText}</li>}
      </ul>
      <div class="stock-advise-section-title">💡 当前市场总结</div>
      <div class="stock-advise-summary">{result.summary || "—"}</div>
    </>
  );
}

function labelOfSort(key) {
  const map = {
    roe: "ROE", pe: "PE", pb: "PB", changePct: "涨跌%", marketCap: "市值",
    turnover: "换手率", price: "现价", name: "名称", industry: "行业",
  };
  return map[key] || key;
}

export default AiAdviseDrawer;
