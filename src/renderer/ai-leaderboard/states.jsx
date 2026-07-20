/**
 * src/renderer/ai-leaderboard/states.jsx
 *
 * 三种状态呈现：加载骨架 / 错误 / 空。均为纯展示，重试回调由父层注入。
 * 无网络出口；可访问性：role=status/alert + sr-only 文案。
 */

const SKELETON_ROWS = 8;

export function LoadingState() {
  return (
    <div
      class="ai-lb-state ai-lb-state--loading"
      role="status"
      aria-live="polite"
    >
      <span class="ai-lb-sr-only">加载中…</span>
      <div class="ai-lb-skeleton-wrap">
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <div class="ai-lb-skeleton-row" key={i}>
            <span class="ai-lb-skeleton ai-lb-skeleton--rank" />
            <span class="ai-lb-skeleton ai-lb-skeleton--name" />
            <span class="ai-lb-skeleton ai-lb-skeleton--num" />
            <span class="ai-lb-skeleton ai-lb-skeleton--num" />
            <span class="ai-lb-skeleton ai-lb-skeleton--num" />
            <span class="ai-lb-skeleton ai-lb-skeleton--num" />
            <span class="ai-lb-skeleton ai-lb-skeleton--num" />
            <span class="ai-lb-skeleton ai-lb-skeleton--num" />
            <span class="ai-lb-skeleton ai-lb-skeleton--num" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div class="ai-lb-state ai-lb-state--error" role="alert">
      <div class="ai-lb-state-icon" aria-hidden="true">
        !
      </div>
      <p class="ai-lb-state-text">榜单加载失败</p>
      <p class="ai-lb-state-sub">{message || "请检查网络后重试"}</p>
      {onRetry && (
        <button
          type="button"
          class="ai-lb-btn ai-lb-btn--primary"
          onClick={onRetry}
        >
          重试
        </button>
      )}
    </div>
  );
}

export function EmptyState({ onRetry }) {
  return (
    <div class="ai-lb-state ai-lb-state--empty">
      <div class="ai-lb-state-icon" aria-hidden="true">
        ∅
      </div>
      <p class="ai-lb-state-text">暂无数据</p>
      <p class="ai-lb-state-sub">当前筛选条件下没有匹配的模型</p>
      {onRetry && (
        <button type="button" class="ai-lb-btn ai-lb-btn--ghost" onClick={onRetry}>
          刷新试试
        </button>
      )}
    </div>
  );
}

export default { LoadingState, ErrorState, EmptyState };
