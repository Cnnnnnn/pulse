/**
 * src/renderer/stocks/AddStockModal.jsx
 *
 * 添加自选股 Modal — 模糊搜代码/名称, 点结果加入自选.
 * 对照 AddFundModal 的搜索下拉套路.
 */
import { useState, useEffect, useRef } from "preact/hooks";
import { closeAddModal, addWatchlist } from "./stockStore.js";
import { api } from "../api.js";
import { BareModalShell } from "../components/ModalShell.jsx";

export function AddStockModal() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const lastRef = useRef("");

  useEffect(() => {
    const code = query.trim();
    if (code.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      lastRef.current = code;
      setSearching(true);
      setError(null);
      try {
        const r = await api.stocksSearch(code);
        if (lastRef.current !== code) return;
        setResults(r && r.ok ? r.results : []);
      } catch (e) {
        if (lastRef.current !== code) return;
        setError(e && e.message ? e.message : String(e));
        setResults([]);
      } finally {
        if (lastRef.current === code) setSearching(false);
      }
    }, 250);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  async function handlePick(code) {
    const r = await addWatchlist(api, code);
    if (r && r.ok) closeAddModal();
  }

  return (
    <BareModalShell
      open
      onClose={closeAddModal}
      usePortal
      ariaLabel="添加自选股"
      overlayClass="stock-modal-overlay"
      cardClass="stock-modal"
    >
      <div class="stock-modal-header">
        <span class="stock-modal-title">添加自选股</span>
        <button
          type="button"
          class="stock-modal-close"
          onClick={closeAddModal}
          aria-label="关闭"
        >
          ×
        </button>
      </div>
      <div class="stock-modal-body">
        <input
          class="stock-modal-input"
          type="text"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder="输入代码或名称 (如 600519 / 茅台)"
          autoComplete="off"
          autoFocus
        />
        {searching && <div class="stock-modal-hint">搜索中…</div>}
        {error && <div class="stock-modal-error">{error}</div>}
        {!searching && !error && results.length === 0 && query.trim().length >= 2 && (
          <div class="stock-modal-hint">没找到匹配股票</div>
        )}
        {results.length > 0 && (
          <ul class="stock-search-list">
            {results.map((r) => (
              <li
                key={r.code}
                class="stock-search-item"
                onClick={() => handlePick(r.code)}
              >
                <span class="stock-search-code">{r.code}</span>
                <span class="stock-search-name">{r.name}</span>
                {r.industry && (
                  <span class="stock-search-industry">{r.industry}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </BareModalShell>
  );
}

export default AddStockModal;
