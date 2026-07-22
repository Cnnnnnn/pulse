/**
 * src/renderer/games/UnlockHistoryPanel.jsx
 *
 * 解锁庆祝「历史记录」面板（Phase 2.6）。
 * 展示 unlockHistory（徽章/成就/活动解锁的时间线，最新在前）。
 * 经 store 信号 unlockHistoryOpen 控制开合；遮罩点击 / ✕ / Esc 关闭。
 *
 * 可访问性：role=dialog + aria-modal；关闭按钮有焦点环；空态有引导文案。
 */
import { useEffect } from "preact/hooks";
import { unlockHistory, unlockHistoryOpen, setUnlockHistoryOpen } from "./gamesStore.js";

/** 类别 → 图标（仅装饰，另配文字标签）。 */
const KIND_ICON = { badge: "🏅", ach: "🎯", event: "🎉" };
const KIND_LABEL = { badge: "徽章", ach: "成就", event: "活动" };

/** 相对时间（中文），降级到「刚刚 / N 分钟 / N 小时 / N 天前」。 */
function relTime(at) {
  const diff = Date.now() - (at || 0);
  if (!Number.isFinite(diff) || diff < 0) return "刚刚";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

export function UnlockHistoryPanel() {
  const open = unlockHistoryOpen.value;
  const list = unlockHistory.value;

  // Esc 关闭
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") setUnlockHistoryOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div class="unlock-history" role="dialog" aria-modal="true" aria-label="解锁历史">
      <div
        class="unlock-history__backdrop"
        aria-hidden="true"
        onClick={() => setUnlockHistoryOpen(false)}
      />
      <div class="unlock-history__panel">
        <header class="unlock-history__head">
          <h3 class="unlock-history__title">解锁历史</h3>
          <button
            type="button"
            class="unlock-history__close"
            aria-label="关闭解锁历史"
            onClick={() => setUnlockHistoryOpen(false)}
          >
            ✕
          </button>
        </header>

        {list.length === 0 ? (
          <div class="unlock-history__empty">
            <span class="unlock-history__empty-icon" aria-hidden="true">🗝️</span>
            <span>还没有解锁记录</span>
            <span class="unlock-history__empty-hint">
              给收藏分级、凑齐平台、达成目标即可点亮徽章与成就
            </span>
          </div>
        ) : (
          <ul class="unlock-history__list">
            {list.map((h) => (
              <li class="unlock-history__item" key={h.id}>
                <span class="unlock-history__icon" aria-hidden="true">
                  {KIND_ICON[h.kind] || "✨"}
                </span>
                <div class="unlock-history__body">
                  <div class="unlock-history__row">
                    <span class="unlock-history__name">{h.title}</span>
                    <span class="unlock-history__kind">{KIND_LABEL[h.kind] || "解锁"}</span>
                  </div>
                  {h.desc ? <div class="unlock-history__desc">{h.desc}</div> : null}
                </div>
                <span class="unlock-history__time">{relTime(h.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default UnlockHistoryPanel;
