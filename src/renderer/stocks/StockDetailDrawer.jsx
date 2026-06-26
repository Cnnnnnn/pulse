/**
 * src/renderer/stocks/StockDetailDrawer.jsx
 *
 * 阶段四: 个股 AI 分析抽屉. 560px 右侧, fade-only, 表格立即让位 padding.
 * 复用 BareModalShell + 阶段二 AiAdviseDrawer 的层级修复模式.
 */
import { useState, useEffect, useRef } from "preact/hooks";
import { BareModalShell } from "../components/ModalShell.jsx";
import { ANGLE_DEFS, getAngle } from "../../stocks/stock-detail-angles.js";  // ESM import of CJS
import {
  codeInput, selectedStock, selectedAngles, perAngleData, aiResult,
  detailOpen, selectStock, toggleAngle, loadAngleData, requestAiDetail, resetDetail,
} from "./stockDetailStore.js";
import { taggedLog } from "../log.js";

const log = taggedLog("[stock-detail]");

const ERROR_REASON_TEXT = {
  config_missing: "AI 未配置, 请去 AI 设置配置 Provider 和 Key",
  api_key_missing: "AI Key 缺失, 请去 AI 设置补充",
  budget_exceeded: "今日 token 预算已用完, 明天重试或去设置加预算",
  parse_failed: "AI 返回格式异常, 请重试",
  llm_failed: "AI 调用失败, 请稍后重试",
  no_api: "AI 通道未就绪",
};

function StockSearchInput({ api, onSelect }) {
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (!codeInput.value || codeInput.value.length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      if (!api || !api.stocksSearch) return;
      const r = await api.stocksSearch(codeInput.value);
      if (r && r.ok) {
        setResults((r.results || []).slice(0, 8));
        setShowDropdown(true);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [codeInput.value]);

  return (
    <div class="stock-detail-search">
      <input
        class="stock-detail-input"
        type="text"
        value={codeInput.value}
        onInput={(e) => { codeInput.value = e.currentTarget.value; }}
        placeholder="输入 6 位股票代码或名称"
        maxLength={20}
        autoComplete="off"
      />
      {showDropdown && results.length > 0 && (
        <ul class="stock-detail-dropdown">
          {results.map((r) => (
            <li
              key={r.code}
              class="stock-detail-dropdown-item"
              onClick={() => {
                onSelect(r);
                setShowDropdown(false);
                codeInput.value = r.code;
              }}
            >
              <span class="stock-detail-dropdown-code">{r.code}</span>
              <span class="stock-detail-dropdown-name">{r.name}</span>
              <span class="stock-detail-dropdown-industry">{r.industry || "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AngleChip({ angle, selected, onToggle }) {
  const entry = perAngleData.value[angle.key];
  const failed = entry && entry.status === "failed";
  return (
    <button
      type="button"
      class={`stock-detail-chip${selected ? " active" : ""}${failed ? " failed" : ""}`}
      onClick={onToggle}
      title={failed ? `拉取失败: ${entry.reason}` : angle.promptHint}
    >
      {angle.label}{failed ? " ⚠" : ""}
    </button>
  );
}

function PerAnglePreview() {
  const angles = Array.from(selectedAngles.value);
  if (angles.length === 0) return null;
  return (
    <div class="stock-detail-preview">
      <div class="stock-detail-preview-title">已选 {angles.length} 个角度</div>
      {angles.map((k) => {
        const ang = getAngle(k);
        const entry = perAngleData.value[k];
        return (
          <div key={k} class="stock-detail-preview-row">
            <span class="stock-detail-preview-label">{ang ? ang.label : k}</span>
            <span class="stock-detail-preview-status">
              {entry ? (entry.status === "ok" ? "已加载" : entry.status === "loading" ? "加载中…" : "失败") : "未拉取"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AiResultBlock() {
  const state = aiResult.value;
  if (state.status === "idle" || state.status === "loading") {
    return (
      <div class="stock-detail-ai-loading">
        {state.status === "loading" ? "⏳ AI 解读中…" : ""}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div class="stock-detail-ai-error">
        <div class="stock-detail-ai-error-title">⚠️ 出错了</div>
        <div class="stock-detail-ai-error-sub">
          {ERROR_REASON_TEXT[state.reason] || state.error || state.reason || "未知错误"}
        </div>
      </div>
    );
  }
  if (state.status === "ready" && state.result) {
    const r = state.result;
    return (
      <div class="stock-detail-ai-result">
        {state.fromCache && <div class="stock-detail-cache-tag">缓存命中</div>}
        <div class="stock-detail-section-title">💡 总结</div>
        <div class="stock-detail-summary">{r.summary}</div>
        {r.perAngle && Object.keys(r.perAngle).length > 0 && (
          <>
            <div class="stock-detail-section-title">📊 各角度解读</div>
            <ul class="stock-detail-per-angle">
              {Object.entries(r.perAngle).map(([k, v]) => {
                const ang = getAngle(k);
                return <li key={k}><b>{ang ? ang.label : k}:</b> {v}</li>;
              })}
            </ul>
          </>
        )}
        {r.risks && r.risks.length > 0 && (
          <>
            <div class="stock-detail-section-title">⚠️ 关注点</div>
            <ul class="stock-detail-risks">
              {r.risks.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </>
        )}
        <div class="stock-detail-signal">
          信号: <b class={`signal-${r.signal}`}>{r.signal}</b>
        </div>
      </div>
    );
  }
  return null;
}

export function StockDetailDrawer({ api }) {
  const open = detailOpen.value;
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocDown(e) {
      const card = cardRef.current;
      if (card && card.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest(".stock-detail-open")) return;
      closeDrawer();
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  function closeDrawer() {
    detailOpen.value = false;
  }

  function handleAngleToggle(key) {
    const wasSelected = selectedAngles.value.has(key);
    toggleAngle(key);
    // 若新勾选, 触发 lazy 拉取
    if (!wasSelected && selectedStock.value) {
      void loadAngleData(api, selectedStock.value.code, key);
    }
  }

  function handleGenerate() {
    if (!selectedStock.value) return;
    void requestAiDetail(api, {
      code: selectedStock.value.code,
      angles: Array.from(selectedAngles.value),
      perAngleData: perAngleData.value,
      freeText: "",
    });
  }

  return (
    <BareModalShell
      open={open}
      onClose={closeDrawer}
      usePortal
      ariaLabel="个股 AI 分析"
      overlayClass="stock-detail-overlay"
      cardClass="stock-detail-drawer"
      cardRef={cardRef}
    >
      <div class="stock-detail-header">
        <span class="stock-detail-title">🔍 个股 AI 分析</span>
        <button type="button" class="stock-modal-close" onClick={closeDrawer} aria-label="关闭">×</button>
      </div>
      <div class="stock-detail-subtitle">
        选 1+ 个分析角度, AI 按真实数据客观解读.
        <br />
        <span class="stock-detail-hint">AI 不出具买入/卖出等投资建议, 仅基于数据描述现状。</span>
      </div>
      <div class="stock-detail-body">
        <div class="stock-detail-section">
          <div class="stock-detail-section-title">股票代码</div>
          <StockSearchInput api={api} onSelect={(r) => selectStock(r)} />
          {selectedStock.value && (
            <div class="stock-detail-selected">
              {selectedStock.value.name} · {selectedStock.value.industry}
            </div>
          )}
        </div>
        <div class="stock-detail-section">
          <div class="stock-detail-section-title">选个分析角度 (可多选)</div>
          <div class="stock-detail-chips">
            {ANGLE_DEFS.map((angle) => (
              <AngleChip
                key={angle.key}
                angle={angle}
                selected={selectedAngles.value.has(angle.key)}
                onToggle={() => handleAngleToggle(angle.key)}
              />
            ))}
          </div>
        </div>
        <PerAnglePreview />
        <button
          type="button"
          class="stock-btn stock-btn-primary stock-btn-lg stock-detail-generate"
          disabled={aiResult.value.status === "loading" || selectedAngles.value.size === 0 || !selectedStock.value}
          onClick={handleGenerate}
        >
          {aiResult.value.status === "loading" ? "⏳ 生成中…" : "🚀 开始 AI 分析"}
        </button>
        <AiResultBlock />
      </div>
    </BareModalShell>
  );
}

export default StockDetailDrawer;