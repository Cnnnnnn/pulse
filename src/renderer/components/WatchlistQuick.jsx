/**
 * src/renderer/components/WatchlistQuick.jsx
 *
 * 关注列表速览 — Overview 右栏. 读 watchlistQuick signal,
 * "View all" 跳到 library 路由.
 */
import { watchlistQuick } from "../overview-store.js";
import { navigateTo } from "../route-store.js";
import { IconStar } from "./icons.jsx";

export function WatchlistQuick() {
  const items = watchlistQuick.value;
  return (
    <div class="watchlist-quick">
      <h3 class="watchlist-quick-title">
        <IconStar filled size={14} /> 关注列表
      </h3>
      {items.length === 0 ? (
        <div class="watchlist-quick-empty">暂无关注, 去 Library 加几个 app</div>
      ) : (
        <ul class="watchlist-quick-list">
          {items.map((it) => (
            <li key={it.name} class={`watchlist-quick-item${it.has_update ? " has-update" : ""}`}>
              {it.name}
              {it.has_update && <span class="watchlist-quick-badge">有更新</span>}
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="watchlist-quick-view-all" onClick={() => navigateTo("library")}>
        View all →
      </button>
    </div>
  );
}

export default WatchlistQuick;