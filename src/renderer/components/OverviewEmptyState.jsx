/**
 * src/renderer/components/OverviewEmptyState.jsx
 *
 * v2.50 (T4): Overview 首次启动 CTA — 大按钮触发 onRunCheck.
 * 无 state, 无副作用. 纯展示. 输入 onRunCheck + isLoading, 输出 button.
 * 不直连 IPC (T5 接线到 api.versionsRunCheck()).
 */
import "./OverviewEmptyState.css";

export function OverviewEmptyState({ onRunCheck, isLoading }) {
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
      </div>
    </div>
  );
}

export default OverviewEmptyState;