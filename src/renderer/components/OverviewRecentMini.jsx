/**
 * src/renderer/components/OverviewRecentMini.jsx
 *
 * v2.50 (T3): Overview 列 3 — 最近活动 mini 视图.
 * 显示前 5 条 events + View all 链接 + 空态.
 * 无 state, 无副作用. 纯展示. 输入 events signal + onViewAll 回调.
 * 事件 shape 由 prop 传入 (mock 由调用方负责, 不直连 track.js).
 */
import "./OverviewRecentMini.css";

const MAX = 5;
const TYPE_LABELS = { upgrade: "升", check: "查", error: "错", snooze: "静", star: "星" };

function relativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return "昨天";
}

export function OverviewRecentMini({ events, onViewAll }) {
  if (events.value.length === 0) {
    return (
      <div class="overview-recent-mini empty">
        <p>还没有活动</p>
      </div>
    );
  }

  const items = events.value.slice(0, MAX);
  return (
    <div class="overview-recent-mini">
      <div class="header">
        <h3>最近活动</h3>
        <button onClick={onViewAll} class="link">View all →</button>
      </div>
      <ul role="list">
        {items.map((event, i) => (
          <li key={i} class="recent-item" role="listitem">
            <span class={`type type-${event.type}`}>{TYPE_LABELS[event.type] || "·"}</span>
            <span class="description">{event.description}</span>
            <span class="time">{relativeTime(event.timestamp)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default OverviewRecentMini;
