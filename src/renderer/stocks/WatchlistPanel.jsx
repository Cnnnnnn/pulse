/**
 * src/renderer/stocks/WatchlistPanel.jsx
 *
 * 自选股 tab — 列表 + 行情 + 刷新 + 加自选 Modal.
 * 对照 spec §6. 空态引导添加.
 */
import { useEffect } from "preact/hooks";
import {
  watchlist,
  watchlistQuotes,
  removeWatchlist,
  openAddModal,
  refreshWatchlistQuotes,
  addModalOpen,
} from "./stockStore.js";
import { AddStockModal } from "./AddStockModal.jsx";
import { PanelEmpty } from "../components/EmptyState.jsx";
import { IconStar, IconRefresh, IconX } from "../components/icons.jsx";
import { api } from "../api.js";

export function WatchlistPanel() {
  const items = watchlist.value || [];
  const quotes = watchlistQuotes.value || {};

  useEffect(() => {
    void refreshWatchlistQuotes(api);
  }, []);

  if (items.length === 0) {
    return (
      <div class="stock-layout">
        <PanelEmpty className="stock-empty-state">
          <div class="stock-empty-title">还没有自选股</div>
          <div class="stock-empty-sub">搜索代码或名称, 添加关注</div>
          <button
            type="button"
            class="stock-btn stock-btn-primary stock-btn-lg"
            onClick={() => openAddModal()}
          >
            + 添加第一只
          </button>
        </PanelEmpty>
        {addModalOpen.value && <AddStockModal />}
      </div>
    );
  }

  return (
    <div class="stock-layout">
      <div class="stock-header">
        <div class="stock-header-left">
          <span class="stock-title"><IconStar size={14} /> 自选股</span>
          <span class="stock-market-tag">{items.length} 只</span>
        </div>
        <div class="stock-header-right">
          <button
            type="button"
            class="stock-btn"
            onClick={() => refreshWatchlistQuotes(api)}
          >
            <IconRefresh size={14} /> 刷新
          </button>
          <button
            type="button"
            class="stock-btn stock-btn-primary"
            onClick={() => openAddModal()}
          >
            + 添加
          </button>
        </div>
      </div>
      <div class="stock-watchlist">
        {items.map((w) => {
          const q = quotes[w.code] || {};
          return (
            <div key={w.code} class="stock-wl-row">
              <div class="stock-wl-info">
                <div class="stock-name">{w.name || w.code}</div>
                <div class="stock-code">
                  {w.code}
                  {w.industry ? ` · ${w.industry}` : ""}
                </div>
              </div>
              <div class="stock-wl-quote">
                <span class="stock-wl-price">
                  {q.price != null ? q.price : "—"}
                </span>
                {q.changePct != null && (
                  <span
                    class={`stock-wl-chg ${
                      q.changePct >= 0 ? "up" : "down"
                    }`}
                  >
                    {q.changePct >= 0 ? "+" : ""}
                    {q.changePct}%
                  </span>
                )}
              </div>
              <button
                type="button"
                class="stock-wl-remove"
                onClick={() => removeWatchlist(api, w.code)}
                aria-label="删除"
              >
                <IconX size={12} />
              </button>
            </div>
          );
        })}
      </div>
      {addModalOpen.value && <AddStockModal />}
    </div>
  );
}

export default WatchlistPanel;
