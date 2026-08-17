/**
 * src/renderer/components/OverviewEmptyState.tsx
 *
 * v2.50 (T4): Overview 首次启动 CTA — 大按钮触发 onRunCheck.
 * 无 state, 无副作用. 纯展示. 输入 onRunCheck + isLoading, 输出 button.
 * 不直连 IPC, 由 LibraryPage 注入统一的 renderer runCheck().
 */
import "./OverviewEmptyState.css";

export function OverviewEmptyState({
  onRunCheck,
  onCancel,
  isLoading,
}: {
  onRunCheck: () => void;
  onCancel?: () => void;
  isLoading: boolean;
}) {
  return (
    <div class="overview-empty-state">
      <div class="empty-content">
        <h2>👋 欢迎使用 Pulse</h2>
        <p>开始监控你的 app 更新情况</p>
        <button
          class="cta-button"
          onClick={onRunCheck}
          disabled={isLoading}
          aria-busy={isLoading}
          aria-label="运行首次检查"
        >
          {isLoading ? "检查中..." : "运行首次检查"}
        </button>
        {isLoading && onCancel && (
          <button type="button" class="btn btn-ghost btn-sm" onClick={onCancel}>
            取消检查
          </button>
        )}
      </div>
    </div>
  );
}

export default OverviewEmptyState;
