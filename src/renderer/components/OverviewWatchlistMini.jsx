/**
 * src/renderer/components/OverviewWatchlistMini.jsx
 *
 * v2.50 (T2): Overview 列 2 — 关注列表 mini 视图.
 * 显示前 4 个 watched apps + "View all →" 链接 + 空态.
 * 无 state, 无副作用. 纯展示. 输入 watchlist signal + onViewAll 回调.
 */
import "./OverviewWatchlistMini.css";

const MAX = 4;

export function OverviewWatchlistMini({ watchlist, onViewAll }) {
  const items = watchlist.value.slice(0, MAX);
  const overflow = Math.max(0, watchlist.value.length - MAX);

  if (watchlist.value.length === 0) {
    return (
      <div class="overview-watchlist-mini empty">
        <p>暂无关注 app</p>
        <button onClick={onViewAll} class="link">在 Library 选 app 加关注 →</button>
      </div>
    );
  }

  return (
    <div class="overview-watchlist-mini">
      <div class="header">
        <h3>★ 关注列表</h3>
        <button onClick={onViewAll} class="link">View all →</button>
      </div>
      <ul role="list">
        {items.map((app) => (
          <li key={app.id} class="watchlist-item" role="listitem">
            <span class={`dot dot-${app.status}`} />
            <span class="name">{app.name}</span>
            {app.status === "upgradable" && <span class="watchlist-badge">升</span>}
          </li>
        ))}
        {overflow > 0 && <li class="watchlist-overflow">+ {overflow} 个</li>}
      </ul>
    </div>
  );
}

export default OverviewWatchlistMini;
