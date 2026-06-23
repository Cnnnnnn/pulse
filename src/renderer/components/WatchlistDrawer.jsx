/**
 * src/renderer/components/WatchlistDrawer.jsx
 *
 * 2026-06-23: Phase I2 v1 — 关注列表抽屉.
 *
 * 模式: 镜像 DiagnosticsDrawer 的 overlay + aside 模式.
 * 数据流: 打开时 refreshWatchlist() 拉主进程 state.json.watchlist,
 *        列表行显示 appName / 上次通知版本 / 添加时间, 每行 "去 pin" 按钮.
 */
import { useEffect } from 'preact/hooks';
import {
  watchlistDrawerOpen,
  watchlistItems,
  refreshWatchlist,
  removeWatchlist,
} from '../watchlist/watchlist-store.js';

function fmtTs(ts) {
  if (!ts || typeof ts !== 'number') return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function WatchlistDrawer() {
  const open = watchlistDrawerOpen.value;
  const items = watchlistItems.value;

  useEffect(() => {
    if (!open) return;
    refreshWatchlist();
  }, [open]);

  if (!open) return null;

  function close() { watchlistDrawerOpen.value = false; }
  function onRemove(appName) {
    removeWatchlist(appName);
  }

  return (
    <>
      <div
        class={`watchlist-overlay ${open ? 'visible' : ''}`}
        onClick={close}
        aria-hidden="true"
      />
      <aside class="watchlist-drawer" role="complementary">
        <header class="watchlist-drawer__header">
          <span class="watchlist-drawer__title">⭐ 关注列表</span>
          <button class="watchlist-drawer__close" onClick={close} aria-label="关闭">×</button>
        </header>
        <div class="watchlist-drawer__stats">
          共 <b>{items.length}</b> 个 app
        </div>
        <div class="watchlist-drawer__body">
          {items.length === 0 && (
            <div class="watchlist-drawer__empty">
              还没有 pin 的 app,点列表项右侧的 ⭐ 加一个
            </div>
          )}
          {items.map((w) => (
            <div key={w.appName} class="watchlist-entry">
              <div class="watchlist-entry__main">
                <span class="watchlist-entry__name">⭐ {w.appName}</span>
                <div class="watchlist-entry__meta">
                  {w.lastNotifiedVersion ? (
                    <span>上次通知: {w.lastNotifiedVersion}</span>
                  ) : (
                    <span>尚未通知</span>
                  )}
                  {w.addedAt ? <span style="margin-left: 8px;">添加: {fmtTs(w.addedAt)}</span> : null}
                </div>
              </div>
              <button
                class="btn btn-sm"
                onClick={() => onRemove(w.appName)}
                aria-label={`去 pin ${w.appName}`}
              >
                去 pin
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}