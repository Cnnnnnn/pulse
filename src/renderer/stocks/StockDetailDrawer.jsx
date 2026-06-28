/**
 * src/renderer/stocks/StockDetailDrawer.jsx
 *
 * 阶段四: 个股 AI 分析抽屉. 共享 AIDrawerShell 外壳 (480px 右侧, fade-only).
 *
 * 交互状态机 (按 design-system "Data-Dense Dashboard" 风格):
 *   1. 空状态: 只显示股票代码搜索框 + 提示 "先选 1 只股票"
 *   2. 已选股票: chips 解禁, 默认勾选的 2 个 angle 立即 lazy 拉数据 (chip 上 spinner)
 *   3. 全 ready 或部分 ready: 显示 "开始 AI 分析" 按钮
 *   4. AI 分析中/完成/失败: 显示对应 block
 *
 * ponytail:
 *   - selectStock 自动触发默认 angle 拉取 (用户不必手动点 chip 才能看到数据)
 *   - dropdown 只在用户主动打字时显示, 选中后立刻关闭清空 (避免 "下拉连出两次")
 */
import { useState, useEffect, useRef } from "preact/hooks";
import { AIDrawerShell } from "../components/AIDrawerShell.jsx";
import { Sparkline } from "../components/Sparkline.jsx";
import { IconSparkles, IconBarChart, IconAlert, IconCheck } from "../components/icons.jsx";
import { ANGLE_DEFS, getAngle } from "../../stocks/stock-detail-angles.js";
import {
  codeInput,
  selectedStock,
  selectedAngles,
  perAngleData,
  aiResult,
  detailOpen,
  selectStock,
  toggleAngle,
  loadAngleData,
  requestAiDetail,
  resetDetail,
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

const FETCH_REASON_TEXT = {
  fetch_failed: "网络请求失败",
  parse_failed: "数据格式异常",
  exception: "拉取异常",
  all_fetch_failed: "全部数据源失败",
  invalid_args: "参数错误",
};

function StockSearchInput({ api }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const reqIdRef = useRef(0);

  // 用户打字 → 拉搜索. query 跟 codeInput 分离: 一旦选中 stock, 立刻清 query 关 dropdown,
  // 防止选完股票后 dropdown 又被 codeInput 变化触发出第二次.
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setOpen(false);
      return undefined;
    }
    const myId = ++reqIdRef.current;
    const timer = setTimeout(async () => {
      if (!api || !api.stocksSearch) return;
      const r = await api.stocksSearch(query);
      // 只接受最近一次请求的结果
      if (myId !== reqIdRef.current) return;
      if (r && r.ok) {
        setResults((r.results || []).slice(0, 8));
        setOpen(true);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // click outside 关闭 dropdown
  useEffect(() => {
    function onDoc(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(r) {
    // 先关 dropdown 清 query, 再触发 store (store 内部会异步拉默认 angle 数据)
    setOpen(false);
    setQuery("");
    setResults([]);
    codeInput.value = r.code;
    selectStock(r, api);
  }

  return (
    <div class="stock-detail-search" ref={wrapRef}>
      <input
        class="stock-detail-input"
        type="text"
        value={query}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          codeInput.value = e.currentTarget.value;
        }}
        placeholder="输入 6 位股票代码或名称"
        maxLength={20}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul class="stock-detail-dropdown" role="listbox">
          {results.map((r) => (
            <li
              key={r.code}
              role="option"
              aria-selected="false"
              class="stock-detail-dropdown-item"
              onMouseDown={(e) => e.preventDefault() /* 避免 input blur */}
              onClick={() => pick(r)}
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

function AngleChip({ angle, selected, status, onToggle, disabled, sparkData }) {
  const failed = status === "failed";
  const loading = status === "loading" || status === "ok-loading";
  const ready = status === "ok" || status === "ready";
  const klass = `stock-detail-chip${selected ? " active" : ""}${failed ? " failed" : ""}${loading ? " loading" : ""}${ready ? " ready" : ""}${disabled ? " disabled" : ""}`;
  const title = disabled
    ? "先选 1 只股票"
    : failed
    ? `拉取失败: ${FETCH_REASON_TEXT[angle.error] || angle.error || "未知"}`
    : loading
    ? "拉取中…"
    : ready
    ? "已加载"
    : angle.promptHint;
  return (
    <button
      type="button"
      class={klass}
      onClick={onToggle}
      disabled={disabled}
      title={title}
      aria-pressed={selected}
    >
      <span class="stock-detail-chip-label">{angle.label}</span>
      {sparkData && (
        <Sparkline
          closes={sparkData}
          width={60}
          height={16}
        />
      )}
      {loading && <span class="stock-detail-chip-spinner" aria-hidden="true" />}
      {failed && <span class="stock-detail-chip-mark" aria-hidden="true">!</span>}
      {ready && <span class="stock-detail-chip-check" aria-hidden="true"><IconCheck size={12} /></span>}
    </button>
  );
}

function PerAnglePreview() {
  const angles = Array.from(selectedAngles.value);
  if (angles.length === 0) {
    return <div class="stock-detail-preview-empty">未选择任何分析角度</div>;
  }
  return (
    <ul class="stock-detail-preview">
      {angles.map((k) => {
        const ang = getAngle(k);
        const entry = perAngleData.value[k];
        const status = entry ? entry.status : "idle";
        const klass = `stock-detail-preview-row status-${status}`;
        const text =
          status === "ok" || status === "ready"
            ? "已加载"
            : status === "loading"
              ? "加载中…"
              : status === "failed"
                ? `失败: ${FETCH_REASON_TEXT[entry.reason] || entry.reason || ""}`
                : "等待中";
        const sparkData = (status === "ok" || status === "ready") && ang && typeof ang.sparkline === "function"
          ? ang.sparkline(entry.data)
          : null;
        return (
          <li key={k} class={klass}>
            <span class="stock-detail-preview-label">{ang ? ang.label : k}</span>
            {sparkData && <Sparkline closes={sparkData} width={120} height={24} />}
            <span class="stock-detail-preview-status">{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function AiResultBlock() {
  const state = aiResult.value;
  if (state.status === "loading") {
    return (
      <div class="stock-detail-ai-loading" role="status" aria-live="polite">
        <span class="stock-detail-chip-spinner" />
        <span>AI 解读中…</span>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div class="stock-detail-ai-error" role="alert">
        <div class="stock-detail-ai-error-title"><IconAlert size={14} /> 出错了</div>
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
        {state.fromCache && <div class="stock-detail-cache-tag">缓存命中 (24h)</div>}
        <div class="stock-detail-section-title"><IconSparkles size={14} /> 总结</div>
        <div class="stock-detail-summary">{r.summary}</div>
        {r.perAngle && Object.keys(r.perAngle).length > 0 && (
          <>
            <div class="stock-detail-section-title"><IconBarChart size={14} /> 各角度解读</div>
            <ul class="stock-detail-per-angle">
              {Object.entries(r.perAngle).map(([k, v]) => {
                const ang = getAngle(k);
                return (
                  <li key={k}>
                    <b>{ang ? ang.label : k}:</b> {v}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {r.risks && r.risks.length > 0 && (
          <>
            <div class="stock-detail-section-title"><IconAlert size={14} /> 关注点</div>
            <ul class="stock-detail-risks">
              {r.risks.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
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
  const stock = selectedStock.value;

  // 关闭抽屉时重置状态
  useEffect(() => {
    if (!open) {
      // 延迟到淡出动画结束后 (CSS 0.15s)
      const t = setTimeout(() => resetDetail(), 200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  function handleAngleToggle(key) {
    const wasSelected = selectedAngles.value.has(key);
    toggleAngle(key);
    // 新勾选 → lazy 拉; 已选 → 取消 (下次再勾会重新拉)
    if (!wasSelected && stock) {
      void loadAngleData(api, stock.code, key);
    }
  }

  function handleGenerate() {
    if (!stock) return;
    void requestAiDetail(api, {
      code: stock.code,
      angles: Array.from(selectedAngles.value),
      perAngleData: perAngleData.value,
      freeText: "",
    });
  }

  const readyCount = Array.from(selectedAngles.value).filter((k) => {
    const e = perAngleData.value[k];
    return e && (e.status === "ok" || e.status === "ready");
  }).length;
  const totalCount = selectedAngles.value.size;
  const canGenerate = !!stock && totalCount > 0 && aiResult.value.status !== "loading";

  return (
    <AIDrawerShell
      open={open}
      onClose={() => { detailOpen.value = false; }}
      title="个股 AI 分析"
      subtitle={stock ? `${stock.name} · ${stock.code}` : ""}
    >
      <div class="stock-detail-body">
        <section class="stock-detail-section">
          <label class="stock-detail-section-title" for="stock-detail-input">
            股票
          </label>
          <StockSearchInput api={api} />
          {!stock && (
            <div class="stock-detail-hint">
              输入代码或名称, 从下拉里选一只 (默认勾选 2 个角度, 选完自动拉数据).
            </div>
          )}
        </section>

        <section class="stock-detail-section">
          <div class="stock-detail-section-title">
            分析角度 <span class="stock-detail-section-meta">{readyCount}/{totalCount} 已加载</span>
          </div>
          <div class="stock-detail-chips" role="group" aria-label="分析角度多选">
            {ANGLE_DEFS.map((angle) => {
              const entry = perAngleData.value[angle.key];
              const sparkData = angle.sparkline
                ? angle.sparkline(
                    entry && (entry.status === "ok" || entry.status === "ready")
                      ? entry.data
                      : null
                  )
                : null;
              return (
                <AngleChip
                  key={angle.key}
                  angle={angle}
                  selected={selectedAngles.value.has(angle.key)}
                  status={entry ? entry.status : "idle"}
                  disabled={!stock}
                  sparkData={sparkData}
                  onToggle={() => handleAngleToggle(angle.key)}
                />
              );
            })}
          </div>
        </section>

        <PerAnglePreview />

        <button
          type="button"
          class="stock-btn stock-btn-primary stock-btn-lg stock-detail-generate"
          disabled={!canGenerate}
          onClick={handleGenerate}
        >
          {aiResult.value.status === "loading"
            ? "生成中…"
            : `开始 AI 分析 (${totalCount} 个角度)`}
        </button>

        <AiResultBlock />

        <div class="stock-detail-footer-hint">
          AI 不出具买入/卖出等投资建议, 仅基于数据描述现状.
        </div>
      </div>
    </AIDrawerShell>
  );
}

export default StockDetailDrawer;
