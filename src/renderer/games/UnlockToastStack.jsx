/**
 * src/renderer/games/UnlockToastStack.jsx
 *
 * 解锁庆祝 — toast 栈（Phase 2.5）。
 * 读取 store.unlockToasts（由收藏引擎 effect 在「新解锁徽章/成就/活动」时推入）。
 *
 * 可访问性：容器 aria-live="polite" 让屏幕阅读器播报解锁；
 * 每条 4s 自动消失（也可手动关闭）；reducedMotion 时关闭滑入动画。
 * 纯展示 + 回调（dismissUnlockToast），不持有状态。
 */
import { useEffect } from "preact/hooks";
import { unlockToasts, dismissUnlockToast } from "./gamesStore.js";

const KIND_ICON = { badge: "🏅", ach: "🎯", event: "🎉" };
const KIND_LABEL = { badge: "徽章解锁", ach: "成就达成", event: "活动完成" };

function Toast({ toast }) {
  useEffect(() => {
    const t = setTimeout(() => dismissUnlockToast(toast.uid), 4000);
    return () => clearTimeout(t);
  }, [toast.uid]);

  return (
    <div class={`unlock-toast unlock-toast--${toast.kind}`} role="status">
      <span class="unlock-toast__icon" aria-hidden="true">
        {KIND_ICON[toast.kind] || "✨"}
      </span>
      <div class="unlock-toast__body">
        <span class="unlock-toast__kind">{KIND_LABEL[toast.kind] || "解锁"}</span>
        <span class="unlock-toast__title">{toast.title}</span>
        {toast.desc && <span class="unlock-toast__desc">{toast.desc}</span>}
      </div>
      <button
        type="button"
        class="unlock-toast__close"
        aria-label="关闭提醒"
        onClick={() => dismissUnlockToast(toast.uid)}
      >
        ×
      </button>
    </div>
  );
}

/**
 * @param {boolean} [reducedMotion=false]
 */
export function UnlockToastStack({ reducedMotion = false }) {
  const toasts = unlockToasts.value;
  if (!toasts || toasts.length === 0) return null;
  return (
    <div
      class={`unlock-toast-stack${reducedMotion ? " is-reduced" : ""}`}
      aria-live="polite"
      aria-label="解锁提醒"
    >
      {toasts.map((t) => (
        <Toast key={t.uid} toast={t} />
      ))}
    </div>
  );
}

export default UnlockToastStack;
