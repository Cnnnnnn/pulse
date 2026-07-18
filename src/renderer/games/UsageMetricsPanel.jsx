/**
 * src/renderer/games/UsageMetricsPanel.jsx — 使用回顾面板（P1a · E）。
 *
 * 只读展示本地埋点计数（纯本地、零网络）。
 *  - 数据来自 gamesStore 的 metrics signal（结构 { [event]: { count, firstSeen, lastSeen } }）。
 *  - 数值一律 tabular-nums。
 *  - UI 明确标注「仅本地，不上传」——本组件及底层 bumpMetric 均不产生任何网络出口。
 *
 * 事件名 → 中文标签（与 gamesStore 中 9 处钩子的事件名对应）。
 */
import { metrics } from "./gamesStore.js";

/** 事件名 → 展示标签。 */
const EVENT_LABELS = {
  "wishlist.add": "加入收藏",
  "wishlist.remove": "移除收藏",
  "tag.set": "设置标签",
  "folder.create": "新建收藏夹",
  merge: "合并记录",
  split: "拆分记录",
  "rating.set": "设置评分",
  "note.set": "设置备注",
  "rarity.set": "设置稀有度",
};

/** 固定展示顺序（未列出的事件名落到末尾按计数降序）。 */
const EVENT_ORDER = [
  "wishlist.add",
  "wishlist.remove",
  "tag.set",
  "folder.create",
  "merge",
  "split",
  "rating.set",
  "note.set",
  "rarity.set",
];

export function UsageMetricsPanel() {
  const data = metrics.value || {};
  const names = Object.keys(data);

  const ordered = names.slice().sort((a, b) => {
    const ia = EVENT_ORDER.indexOf(a);
    const ib = EVENT_ORDER.indexOf(b);
    const ka = ia === -1 ? EVENT_ORDER.length : ia;
    const kb = ib === -1 ? EVENT_ORDER.length : ib;
    if (ka !== kb) return ka - kb;
    return (data[b].count || 0) - (data[a].count || 0);
  });

  return (
    <section class="usage-metrics" aria-label="使用回顾（仅本地）">
      <div class="usage-metrics__head">
        <h3 class="usage-metrics__title">使用回顾</h3>
        <span class="usage-metrics__local" title="数据仅存于本机，不会上传任何服务器">
          仅本地 · 不上传
        </span>
      </div>

      {ordered.length === 0 ? (
        <p class="usage-metrics__empty">暂无记录。你的收藏行为会在此汇总统计。</p>
      ) : (
        <ul class="usage-metrics__list">
          {ordered.map((name) => (
            <li class="usage-metrics__row" key={name}>
              <span class="usage-metrics__name">
                {EVENT_LABELS[name] || name}
              </span>
              <span class="usage-metrics__count">{data[name].count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default UsageMetricsPanel;
