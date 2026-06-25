/**
 * src/renderer/components/WatchlistDrawer.jsx
 *
 * I2 v2 — 关注列表: app / 基金 / 关键词 / 贵金属
 */
import { useEffect, useState } from 'preact/hooks';
import {
  watchlistDrawerOpen,
  watchlistItems,
  refreshWatchlist,
  removeWatchlistItem,
  addWatchlistItem,
  itemKey,
} from '../watchlist/watchlist-store.js';
import { getMetalById } from '../../metals/metal-config.js';
import { DrawerShell } from './DrawerShell.jsx';

function fmtTs(ts) {
  if (!ts || typeof ts !== 'number') return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TYPE_LABEL = {
  app: { icon: '⭐', label: 'App' },
  fund: { icon: '💰', label: '基金' },
  keyword: { icon: '🔍', label: '关键词' },
  metal: { icon: '🥇', label: '贵金属' },
};

function entryTitle(w) {
  if (w.type === 'app') return w.ref;
  if (w.type === 'fund') return w.ref;
  if (w.type === 'metal') {
    const m = getMetalById(w.ref);
    return m ? m.shortName : w.ref;
  }
  return `「${w.ref}」`;
}

function entryMeta(w) {
  if (w.type === 'app') {
    return w.lastNotifiedVersion
      ? `上次通知版本: ${w.lastNotifiedVersion}`
      : '尚未通知';
  }
  if (w.type === 'fund') {
    return w.lastNotifiedNav != null
      ? `基准净值: ${Number(w.lastNotifiedNav).toFixed(4)}`
      : '等待首次净值';
  }
  if (w.type === 'metal') {
    return w.lastNotifiedPrice != null
      ? `基准价: ${Number(w.lastNotifiedPrice).toFixed(2)}`
      : '等待首次报价';
  }
  if (w.type === 'keyword') {
    return w.lastMatchKey
      ? `最近匹配: ${w.lastMatchKey}`
      : '等待首次匹配';
  }
  return '';
}

export function WatchlistDrawer() {
  const open = watchlistDrawerOpen.value;
  const items = watchlistItems.value;
  const [keyword, setKeyword] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    refreshWatchlist();
  }, [open]);

  function close() { watchlistDrawerOpen.value = false; }

  async function onAddKeyword(e) {
    e.preventDefault();
    const kw = keyword.trim();
    if (!kw) return;
    setAdding(true);
    await addWatchlistItem({ type: 'keyword', ref: kw });
    setKeyword('');
    setAdding(false);
  }

  return (
    <DrawerShell
      open={open}
      onClose={close}
      title="⭐ 关注列表"
      overlayClass="watchlist-overlay"
      drawerClass="watchlist-drawer"
      ariaLabel="关注列表"
      beforeBody={(
        <>
          <div class="watchlist-drawer__stats">
            共 <b>{items.length}</b> 项
          </div>
          <form class="watchlist-keyword-form" onSubmit={onAddKeyword}>
            <input
              type="text"
              class="watchlist-keyword-input"
              placeholder="添加关键词 (热搜/IT之家)"
              value={keyword}
              onInput={(e) => setKeyword(e.currentTarget.value)}
              maxLength={40}
            />
            <button type="submit" class="btn btn-sm" disabled={adding || !keyword.trim()}>
              添加
            </button>
          </form>
        </>
      )}
    >
      {items.length === 0 && (
        <div class="watchlist-drawer__empty">
          在应用列表、基金/贵金属卡片点 ⭐ 关注，或上方添加关键词
        </div>
      )}
      {items.map((w) => {
        const meta = TYPE_LABEL[w.type] || TYPE_LABEL.app;
        return (
          <div key={itemKey(w)} class="watchlist-entry">
            <div class="watchlist-entry__main">
              <span class="watchlist-entry__name">
                {meta.icon} {meta.label} · {entryTitle(w)}
              </span>
              <div class="watchlist-entry__meta">
                <span>{entryMeta(w)}</span>
                {w.addedAt ? (
                  <span style="margin-left: 8px;">添加: {fmtTs(w.addedAt)}</span>
                ) : null}
              </div>
            </div>
            <button
              class="btn btn-sm"
              onClick={() => removeWatchlistItem({ type: w.type, ref: w.ref })}
              aria-label={`从关注列表移除 ${w.ref}`}
            >
              移除
            </button>
          </div>
        );
      })}
    </DrawerShell>
  );
}
