/**
 * src/renderer/stocks/StockSearchInput.jsx
 *
 * 个股分析 tab 顶部搜索框 (输入代码/名称 → 联想下拉 → 选中诊断).
 *
 * API 契约: api.stocksSearch(query) → { ok, results: [{code,name,industry?}], fromCache }
 * 选中后调 openDiagnosis(code) (它会切到 diagnosis tab 并设 stockDiagnosisCode).
 *
 * 样式照搬 worldcup 搜索框但用 stock- 前缀 (见 styles.css .stock-search-*).
 */
import { useState, useEffect, useRef } from "preact/hooks";
import { openDiagnosis } from "./diagnosisStore.js";

const DEBOUNCE_MS = 250;
const MIN_QUERY_LEN = 1;

export function StockSearchInput({ api }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const reqIdRef = useRef(0);

  // debounce 搜索: 输入变化 250ms 后调 api.stocksSearch.
  useEffect(() => {
    const q = query.trim();
    // 空查询: 清结果关下拉, 不打接口.
    if (q.length < MIN_QUERY_LEN) {
      setResults([]);
      setLoading(false);
      setError(null);
      setOpen(false);
      return;
    }
    setLoading(true);
    setError(null);
    setOpen(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      // 防竞态: 只采纳最后一次请求的结果.
      const myReqId = ++reqIdRef.current;
      try {
        const resp = await api.stocksSearch(q);
        if (myReqId !== reqIdRef.current) return; // 被更新的请求覆盖, 丢弃
        if (!resp || !resp.ok) {
          setResults([]);
          setError((resp && resp.reason) || "search_failed");
        } else {
          setResults(Array.isArray(resp.results) ? resp.results : []);
          setError(null);
        }
      } catch (e) {
        if (myReqId !== reqIdRef.current) return;
        setResults([]);
        setError(e && e.message ? e.message : "search_failed");
      } finally {
        if (myReqId === reqIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, api]);

  const handleSelect = (item) => {
    openDiagnosis(api, item);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const handleBlur = () => {
    // 延迟关闭, 让 click 先触发 (mousedown 在 blur 前).
    setTimeout(() => setOpen(false), 150);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showDropdown = open && query.trim().length >= MIN_QUERY_LEN;

  return (
    <div class="stock-search-wrap">
      <input
        type="text"
        class="stock-search-input"
        placeholder="输入股票代码或名称，如 600519 / 茅台"
        value={query}
        onInput={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (query.trim().length >= MIN_QUERY_LEN) setOpen(true);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autocomplete="off"
        aria-label="搜索个股"
      />
      {showDropdown && (
        <div class="stock-search-dropdown" role="listbox">
          {loading && <div class="stock-search-empty">搜索中…</div>}
          {!loading && error && (
            <div class="stock-search-empty">搜索失败，请重试</div>
          )}
          {!loading && !error && results.length === 0 && (
            <div class="stock-search-empty">无匹配结果</div>
          )}
          {!loading &&
            !error &&
            results.map((item) => (
              <div
                key={item.code}
                class="stock-search-item"
                role="option"
                aria-selected="false"
                onMouseDown={(e) => {
                  // mousedown 先于 blur, 阻止默认防止失焦.
                  e.preventDefault();
                  handleSelect(item);
                }}
              >
                <span class="stock-search-item-name">{item.name}</span>
                <span class="stock-search-item-code">{item.code}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default StockSearchInput;
