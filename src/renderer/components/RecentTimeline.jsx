/**
 * src/renderer/components/RecentTimeline.jsx
 *
 * 最近活动时间线 — Overview 右栏. 读 recentActivity signal,
 * 每条渲染 kind icon + "appName · kind" + 时间.
 */
import { recentActivity } from "../overview-store.js";
import { RecentActivityIcon } from "./icons.jsx";

export function RecentTimeline() {
  const items = recentActivity.value;
  return (
    <div class="recent-timeline">
      <h3 class="recent-timeline-title">最近活动</h3>
      {items.length === 0 ? (
        <div class="recent-timeline-empty">暂无活动</div>
      ) : (
        <ul class="recent-timeline-list">
          {items.map((it, i) => (
            <li key={i} class="recent-timeline-item">
              <RecentActivityIcon kind={it.kind} size={12} />
              <span class="recent-timeline-text">{it.appName} · {it.kind}</span>
              <time class="recent-timeline-ts">{new Date(it.ts).toLocaleTimeString()}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default RecentTimeline;