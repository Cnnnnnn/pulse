/**
 * src/renderer/stocks/StockDetailDrawer.jsx
 *
 * 阶段五: 个股 AI 分析抽屉 (720px) — Hero + 5 tab + 折叠 AI.
 * 共享 AIDrawerShell 外壳 (fade-only).
 *
 * ponytail:
 *   - 5 tab 取代 7 chips: 行情 (含 K 线) / 财务 / 资金 / 技术 / 舆情. Tab 切换不重拉数据 — 数据已在 perAngleData.
 *   - AI 块默认折叠, 用户主动展开看 detail. 折叠/展开状态本地 useState, 不入 store (抽屉外不持久).
 *   - Hero bar 从 perAngleData["price_trend"].data.lastQuote 读, 不重打 IPC.
 */
import { useState, useEffect, useRef } from "preact/hooks";
import { AIDrawerShell } from "../components/AIDrawerShell.jsx";
import { Sparkline } from "../components/Sparkline.jsx";
import { CandlestickChart } from "../components/CandlestickChart.jsx";
import {
  IconSparkles, IconBarChart, IconAlert, IconCheck, IconCopy, IconChevronDown, IconChevronUp,
} from "../components/icons.jsx";
import { ANGLE_DEFS, getAngle } from "../../stocks/stock-detail-angles.js";
import {
  codeInput, selectedStock, selectedAngles, perAngleData, aiResult, detailOpen,
  selectStock, toggleAngle, loadAngleData, requestAiDetail, resetDetail,
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
  no_industry_data: "暂无行业数据",
  no_finance_data: "财务数据缺失",
};

// ===== Tab 配置 =====
const TABS = [
  { key: "market",  label: "行情", angleKey: "price_trend" },
  // ponytail: 财务 tab 合并 2 个 angle (估值 + 盈利能力), ANGLE_DEFS 没"fundamentals"这一档.
  { key: "finance", label: "财务", angleKey: ["valuation", "profitability"] },
  { key: "fund",    label: "资金", angleKey: "capital_flow" },
  { key: "tech",    label: "技术", angleKey: "tech_indicators" },
  { key: "news",    label: "舆情", angleKey: "news_buzz" },
];

function angleEntry(angleKey) {
  const e = perAngleData.value[angleKey];
  return e && (e.status === "ok" || e.status === "ready") ? e.data : null;
}

// ponytail: 角度未勾选 ≠ "加载中". 区分 4 种状态:
//   not_selected: 没勾选 → 引导用户去 chip 区勾选
//   loading:      勾了且在拉 → "加载中…"
//   failed:       拉取失败 → 显示原因
//   ready:        数据到位
// 用 tab 的 angleKey (字符串/数组) 判断, 数组 (财务 tab) 是任一未选都算未选.
function angleStatusForTab(angleKey) {
  const keys = Array.isArray(angleKey) ? angleKey : [angleKey];
  const selected = selectedAngles.value;
  const anySelected = keys.some((k) => selected.has(k));
  if (!anySelected) return { state: "not_selected" };
  const entry = keys
    .map((k) => perAngleData.value[k])
    .find((e) => e && (e.status === "ok" || e.status === "ready" || e.status === "loading" || e.status === "failed"));
  if (!entry || entry.status === "loading") return { state: "loading" };
  if (entry.status === "failed") {
    return { state: "failed", reason: entry.reason, error: entry.error };
  }
  return { state: "ready" };
}

// ===== 子组件 =====

function StockSearchInput({ api }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const reqIdRef = useRef(0);

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
      if (myId !== reqIdRef.current) return;
      if (r && r.ok) {
        setResults((r.results || []).slice(0, 8));
        setOpen(true);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onDoc(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(r) {
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
              onMouseDown={(e) => e.preventDefault()}
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

function HeroBar({ stock, lastQuote }) {
  if (!stock) return null;
  const change = lastQuote?.change;
  const changePct = lastQuote?.changePct;
  const up = change != null && change >= 0;
  return (
    <header class="stock-hero">
      <div class="stock-hero-left">
        <div class="stock-hero-name">{stock.name}</div>
        <div class="stock-hero-code">{stock.code}{stock.industry ? ` · ${stock.industry}` : ""}</div>
      </div>
      <div class="stock-hero-right">
        <div class={`stock-hero-price ${up ? "stock-up" : "stock-down"}`}>
          {lastQuote?.price?.toFixed(2) ?? "—"}
        </div>
        {change != null && (
          <div class={`stock-hero-change ${up ? "stock-up" : "stock-down"}`}>
            {up ? "▲" : "▼"} {Math.abs(change).toFixed(2)} ({changePct?.toFixed(2)}%)
          </div>
        )}
      </div>
    </header>
  );
}

function TabBar({ activeTab, onChange }) {
  return (
    <div role="tablist" class="stock-detail-tablist" aria-label="分析视图">
      {TABS.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          class={`stock-detail-tab ${activeTab === t.key ? "active" : ""}`}
          aria-selected={activeTab === t.key}
          aria-controls={`stock-tabpanel-${t.key}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function MarketPanel({ hidden }) {
  const data = angleEntry("price_trend");
  if (!data) {
    return <div class="stock-tab-panel-empty">行情数据加载中…</div>;
  }
  return (
    <div role="tabpanel" id="stock-tabpanel-market" aria-hidden={hidden} hidden={hidden} class="stock-tab-panel">
      <div class="stock-candle-chart">
        <CandlestickChart klines={data.klines || []} closes={data.closes || []} width={680} />
      </div>
      <div class="stock-market-metrics">
        <MetricChip label="5日" value={data.change5d} suffix="%" />
        <MetricChip label="20日" value={data.change20d} suffix="%" />
        <MetricChip label="振幅" value={data.amplitude} suffix="%" />
      </div>
    </div>
  );
}

function FinancePanel({ hidden }) {
  // ponytail: 财务 tab 拼 2 个 angle (估值 + 盈利能力), 各 angle 独立加载, 单边缺失时
  // 仍渲染另一边 (graceful partial loading). 字段名照搬 detail-fetchers/{valuation,profitability}.js.
  const val = angleEntry("valuation");
  const prof = angleEntry("profitability");
  if (!val && !prof) return <div class="stock-tab-panel-empty">财务数据加载中…</div>;
  const items = [];
  if (val) {
    items.push({ label: "动态 PE", value: val.pe });
    items.push({ label: "PB", value: val.pb });
    if (val.pePercentile3y != null) {
      items.push({ label: "近 3 年分位", value: val.pePercentile3y, suffix: "%" });
    }
  }
  if (prof) {
    items.push({ label: "ROE", value: prof.roe, suffix: "%" });
    items.push({ label: "毛利率", value: prof.grossMargin, suffix: "%" });
    items.push({ label: "净利率", value: prof.netMargin, suffix: "%" });
  }
  return (
    <div role="tabpanel" id="stock-tabpanel-finance" aria-hidden={hidden} hidden={hidden} class="stock-tab-panel stock-metric-grid">
      {items.map((it) => (
        <MetricCard key={it.label} label={it.label} value={it.value} suffix={it.suffix} />
      ))}
      <PeerCompareSubblock />
      <MoatScoreSubblock />
    </div>
  );
}

function FundPanel({ hidden }) {
  const data = angleEntry("capital_flow");
  if (!data) return <div class="stock-tab-panel-empty">资金数据加载中…</div>;
  return (
    <div role="tabpanel" id="stock-tabpanel-fund" aria-hidden={hidden} hidden={hidden} class="stock-tab-panel">
      <MetricCard label="主力净流入" value={formatYi(data.mainNetInflow)} large />
      {data.sparkline && (
        <div class="stock-sparkline-wrap">
          <Sparkline closes={data.sparkline} width={680} height={60} />
        </div>
      )}
    </div>
  );
}

function TechPanel({ hidden }) {
  const data = angleEntry("tech_indicators");
  if (!data) return <div class="stock-tab-panel-empty">技术指标加载中…</div>;
  return (
    <div role="tabpanel" id="stock-tabpanel-tech" aria-hidden={hidden} hidden={hidden} class="stock-tab-panel stock-metric-grid">
      <MetricCard label="MACD Hist" value={data.macdHist} />
      <MetricCard label="RSI" value={data.rsi} />
      <MetricCard label="KDJ-K" value={data.kdj?.k} />
      <MetricCard label="KDJ-D" value={data.kdj?.d} />
      <MetricCard label="KDJ-J" value={data.kdj?.j} />
    </div>
  );
}

function NewsPanel({ hidden }) {
  const data = angleEntry("news_buzz");
  if (!data) return <div class="stock-tab-panel-empty">舆情加载中…</div>;
  const items = data.items || [];
  if (items.length === 0) return <div class="stock-tab-panel-empty">暂无舆情</div>;
  return (
    <div role="tabpanel" id="stock-tabpanel-news" aria-hidden={hidden} hidden={hidden} class="stock-tab-panel">
      <ul class="stock-news-list">
        {items.map((n, i) => (
          <li key={i} class="stock-news-item">
            {n.url ? (
              <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a>
            ) : (
              <span>{n.title}</span>
            )}
            <span class="stock-news-date">{n.date || ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricChip({ label, value, suffix }) {
  if (value == null) return <span class="stock-metric-chip empty"><span class="stock-metric-chip-label">{label}</span><span class="stock-metric-chip-value">—</span></span>;
  const up = value > 0;
  return (
    <span class={`stock-metric-chip ${up ? "stock-up" : value < 0 ? "stock-down" : ""}`}>
      <span class="stock-metric-chip-label">{label}</span>
      <span class="stock-metric-chip-value">{typeof value === "number" ? value.toFixed(2) : value}{suffix || ""}</span>
    </span>
  );
}

function MetricCard({ label, value, suffix, large }) {
  return (
    <div class={`stock-metric-card ${large ? "large" : ""}`}>
      <div class="stock-metric-card-label">{label}</div>
      <div class="stock-metric-card-value">
        {value == null ? "—" : `${typeof value === "number" ? value.toFixed(2) : value}${suffix || ""}`}
      </div>
    </div>
  );
}

// ponytail: 财务 tab 里挂的 2 个折叠子区 — peer_compare / moat_score.
// 字段名照搬 detail-fetchers/{peer-compare,moat-score}.js. 复用 angleStatusForTab
// 状态机 (not_selected → null, loading/failed → SubblockSkeleton, ready → 8 个 mini metric).
function PeerCompareSubblock() {
  const status = angleStatusForTab("peer_compare");
  if (status.state === "not_selected") return null;
  if (status.state === "loading" || status.state === "failed") {
    return <SubblockSkeleton title="📊 同业对比" status={status} />;
  }
  const data = angleEntry("peer_compare");
  return (
    <details class="stock-finance-subblock" open>
      <summary>📊 同业对比 · {data.industry || "—"}</summary>
      <div class="stock-finance-subblock-grid">
        <SubblockMetric label="PE 这只" value={data.pe} suffix="倍" />
        <SubblockMetric label="PE 行业中位" value={data.peIndustryMedian} suffix="倍" />
        <SubblockMetric label="PE 排名" value={data.peRank != null ? `${data.peRank}/${data.peTotal || "?"}` : "—"} />
        <SubblockMetric label="PE 偏差" value={data.peDeviationPct} suffix="%" colored />
        <SubblockMetric label="PB 这只" value={data.pb} suffix="倍" />
        <SubblockMetric label="PB 行业中位" value={data.pbIndustryMedian} suffix="倍" />
        <SubblockMetric label="PB 排名" value={data.pbRank != null ? `${data.pbRank}/${data.pbTotal || "?"}` : "—"} />
        <SubblockMetric label="PB 偏差" value={data.pbDeviationPct} suffix="%" colored />
      </div>
    </details>
  );
}

function MoatScoreSubblock() {
  const status = angleStatusForTab("moat_score");
  if (status.state === "not_selected") return null;
  if (status.state === "loading" || status.state === "failed") {
    return <SubblockSkeleton title="🏰 护城河评分" status={status} />;
  }
  const data = angleEntry("moat_score");
  return (
    <details class="stock-finance-subblock" open>
      <summary>🏰 护城河评分 · {data.score}/9</summary>
      <div class="stock-finance-subblock-grid">
        <SubblockMetric label="毛利优势" value={data.breakdown.marginEdge} suffix="/3" />
        <SubblockMetric label="ROIC 优势" value={data.breakdown.roicEdge} suffix="/3" />
        <SubblockMetric label="营收稳定" value={data.breakdown.revenueStability} suffix="/3" />
        <SubblockMetric label="毛利率" value={data.metrics.grossMargin} suffix="%" />
        <SubblockMetric label="ROIC" value={data.metrics.roic} suffix="%" />
        <SubblockMetric label="营收 5y CAGR" value={data.metrics.revenueCagr5y} suffix="%" />
        <SubblockMetric label="行业排名" value={data.metrics.revenueRankInIndustry != null ? `${data.metrics.revenueRankInIndustry}/${data.metrics.industryTotal || "?"}` : "—"} />
        <SubblockMetric label="护城河" value={data.score} suffix="/9" colored />
      </div>
      {data.note && <div class="stock-finance-subblock-note">{data.note}</div>}
    </details>
  );
}

// ponytail: 折叠子区的骨架/失败态共用组件. loading 显示文案 "拉取中…";
// failed 用 FETCH_REASON_TEXT 字典翻译 reason (fetch_failed / parse_failed / ...).
function SubblockSkeleton({ title, status }) {
  const hint = status.state === "loading"
    ? "拉取中…"
    : `拉取失败: ${FETCH_REASON_TEXT[status.reason] || status.reason || "未知"}`;
  return (
    <details class="stock-finance-subblock">
      <summary>{title}</summary>
      <div class="stock-finance-subblock-skeleton">{hint}</div>
    </details>
  );
}

// ponytail: 8 格 mini metric. colored: 数字 > 0 用红 (overvalued), < 0 用绿 (undervalued) — A 股涨跌色惯例.
function SubblockMetric({ label, value, suffix, colored }) {
  const v = value == null ? "—" : (typeof value === "number" ? value.toFixed(1) : value);
  const klass = `stock-finance-subblock-metric${colored && typeof value === "number" && value > 0 ? " up" : colored && typeof value === "number" && value < 0 ? " down" : ""}`;
  return (
    <div class={klass}>
      <div class="stock-finance-subblock-metric-label">{label}</div>
      <div class="stock-finance-subblock-metric-value">{v}{suffix || ""}</div>
    </div>
  );
}

function AiFoldable({ state, onCopy, onGenerate }) {
  const [expanded, setExpanded] = useState(false);
  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return (
      <div class="stock-ai-foldable" aria-expanded="false">
        <div class="stock-ai-foldable-header" role="status" aria-live="polite">
          <span class="stock-detail-chip-spinner" />
          <span>AI 解读中…</span>
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div class="stock-ai-foldable" aria-expanded="true">
        <button type="button" class="stock-ai-foldable-header" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          <IconAlert size={14} />
          <span>AI 失败</span>
          {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </button>
        {expanded && (
          <div class="stock-ai-foldable-body" role="alert">
            {ERROR_REASON_TEXT[state.reason] || state.error || state.reason || "未知错误"}
          </div>
        )}
      </div>
    );
  }
  if (state.status === "ready" && state.result) {
    const r = state.result;
    return (
      <div class="stock-ai-foldable" aria-expanded={expanded}>
        <button
          type="button"
          class="stock-ai-foldable-header"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <IconSparkles size={14} />
          <span class="stock-ai-foldable-summary">{r.summary}</span>
          <span class="stock-ai-foldable-meta">
            {state.fromCache && <small class="stock-detail-cache-tag">(缓存)</small>}
            {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </span>
        </button>
        {expanded && (
          <div class="stock-ai-foldable-body">
            <div class="stock-detail-section-title">总结</div>
            <div class="stock-detail-summary">{r.summary}</div>
            <button type="button" class="stock-btn stock-btn-ghost" onClick={() => onCopy(r.summary)}>
              <IconCopy size={12} /> 复制总结
            </button>
            {selectedAngles.value.size > 0 && (
              <>
                <div class="stock-detail-section-title"><IconBarChart size={14} /> 各角度解读</div>
                <ul class="stock-detail-per-angle">
                  {Array.from(selectedAngles.value).map((k) => {
                    const ang = getAngle(k);
                    const label = ang ? ang.label : k;
                    const raw = r.perAngle ? r.perAngle[k] : null;
                    const text = typeof raw === "string" && raw.trim() ? raw.trim() : "暂无解读";
                    return (<li key={k}><b>{label}:</b> {text}</li>);
                  })}
                </ul>
              </>
            )}
            {r.risks && r.risks.length > 0 && (
              <>
                <div class="stock-detail-section-title"><IconAlert size={14} /> 关注点</div>
                <ul class="stock-detail-risks">
                  {r.risks.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </>
            )}
            <div class="stock-detail-signal">信号: <b class={`signal-${r.signal}`}>{r.signal}</b></div>
          </div>
        )}
      </div>
    );
  }
  return null;
}

function formatYi(n) {
  if (n == null) return "—";
  const yi = n / 1e8;
  if (Math.abs(yi) >= 1) return `${yi.toFixed(2)}亿`;
  return `${(n / 1e4).toFixed(2)}万`;
}

// ===== 主组件 =====

export function StockDetailDrawer({ api }) {
  const open = detailOpen.value;
  const stock = selectedStock.value;
  const [activeTab, setActiveTab] = useState("market");

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => resetDetail(), 200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  function handleAngleToggle(key) {
    const wasSelected = selectedAngles.value.has(key);
    toggleAngle(key);
    if (!wasSelected && stock) void loadAngleData(api, stock.code, key);
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

  function handleCopy(text) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text || "");
    }
  }

  const readyCount = Array.from(selectedAngles.value).filter((k) => {
    const e = perAngleData.value[k];
    return e && (e.status === "ok" || e.status === "ready");
  }).length;
  const totalCount = selectedAngles.value.size;
  const canGenerate = !!stock && totalCount > 0 && aiResult.value.status !== "loading";
  const lastQuote = angleEntry("price_trend")?.lastQuote ?? null;

  return (
    <AIDrawerShell
      open={open}
      onClose={() => { detailOpen.value = false; }}
      title="个股 AI 分析"
      subtitle={stock ? `${stock.name} · ${stock.code}` : ""}
    >
      <div class="stock-detail-body">
        <section class="stock-detail-section">
          <label class="stock-detail-section-title" for="stock-detail-input">股票</label>
          <StockSearchInput api={api} />
          {!stock && (
            <div class="stock-detail-hint">
              输入代码或名称, 从下拉里选一只 (默认勾选 2 个角度, 选完自动拉数据).
            </div>
          )}
        </section>

        {stock && <HeroBar stock={stock} lastQuote={lastQuote} />}

        {stock && (
          <TabBar activeTab={activeTab} onChange={setActiveTab} />
        )}

        {stock && (
          <div class="stock-tab-panels">
            {/* ponytail: 所有 5 个 panel 都渲染, 通过 aria-hidden / hidden 隐藏非 active. 避免 mount/unmount 切换造成的图表丢失焦点 + 滚动位置.
                role="tabpanel" + id 放在 Panel 自身, 这样 (a) a11y 树里只有一个 tabpanel / id; (b) outer 容器只是 hidden wrapper. */}
            <MarketPanel hidden={activeTab !== "market"} />
            <FinancePanel hidden={activeTab !== "finance"} />
            <FundPanel hidden={activeTab !== "fund"} />
            <TechPanel hidden={activeTab !== "tech"} />
            <NewsPanel hidden={activeTab !== "news"} />
          </div>
        )}

        <section class="stock-detail-section">
          <div class="stock-detail-section-title">
            分析角度 <span class="stock-detail-section-meta">{readyCount}/{totalCount} 已加载</span>
          </div>
          <div class="stock-detail-chips" role="group" aria-label="分析角度多选">
            {ANGLE_DEFS.map((angle) => {
              const entry = perAngleData.value[angle.key];
              const status = entry ? entry.status : "idle";
              const failed = status === "failed";
              const loading = status === "loading";
              const ready = status === "ok" || status === "ready";
              const klass = `stock-detail-chip${selectedAngles.value.has(angle.key) ? " active" : ""}${failed ? " failed" : ""}${loading ? " loading" : ""}${ready ? " ready" : ""}${!stock ? " disabled" : ""}`;
              const title = !stock
                ? "先选 1 只股票"
                : failed ? `拉取失败: ${FETCH_REASON_TEXT[angle.error] || angle.error || "未知"}`
                : loading ? "拉取中…"
                : ready ? "已加载"
                : angle.promptHint;
              return (
                <button
                  key={angle.key}
                  type="button"
                  class={klass}
                  onClick={() => handleAngleToggle(angle.key)}
                  disabled={!stock}
                  title={title}
                  aria-pressed={selectedAngles.value.has(angle.key)}
                >
                  <span class="stock-detail-chip-label">{angle.label}</span>
                  {loading && <span class="stock-detail-chip-spinner" aria-hidden="true" />}
                  {failed && <span class="stock-detail-chip-mark" aria-hidden="true">!</span>}
                  {ready && <span class="stock-detail-chip-check" aria-hidden="true"><IconCheck size={12} /></span>}
                </button>
              );
            })}
          </div>
        </section>

        <button
          type="button"
          class="stock-btn stock-btn-primary stock-btn-lg stock-detail-generate"
          disabled={!canGenerate}
          onClick={handleGenerate}
        >
          {aiResult.value.status === "loading" ? "生成中…" : `开始 AI 分析 (${totalCount} 个角度)`}
        </button>

        <AiFoldable state={aiResult.value} onCopy={handleCopy} onGenerate={handleGenerate} />

        <div class="stock-detail-footer-hint">
          AI 不出具买入/卖出等投资建议, 仅基于数据描述现状.
        </div>
      </div>
    </AIDrawerShell>
  );
}

export default StockDetailDrawer;