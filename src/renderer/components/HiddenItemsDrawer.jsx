/**
 * src/renderer/components/HiddenItemsDrawer.jsx
 *
 * Phase I3 v1: 显示已隐藏 nav item 的抽屉.
 *
 * Props:
 *   - open: boolean
 *   - hiddenItems: [{ key, icon, label }]  (父组件传 listHidden 结果)
 *   - onRestore(key): 调 sidenav-prefs.restoreItem + savePrefs
 *   - onClose(): 关闭抽屉
 *
 * 全隐藏状态 (hiddenItems.length === 0): 父组件应展示顶部横幅, 这里不重复
 * (spec §2.5 由 SideNav.jsx 顶层判断).
 */

export function HiddenItemsDrawer({ open, hiddenItems = [], onRestore, onClose }) {
  if (!open) return null;

  return (
    <>
      <div
        class="sidenav-hidden-drawer-overlay"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside class="sidenav-hidden-drawer" role="complementary">
        <header class="sidenav-hidden-drawer__header">
          <span class="sidenav-hidden-drawer__title">已隐藏的导航项</span>
          <button
            type="button"
            class="sidenav-hidden-drawer__close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>
        <div class="sidenav-hidden-drawer__body">
          {hiddenItems.length === 0 && (
            <div class="sidenav-hidden-drawer__empty">没有隐藏项</div>
          )}
          {hiddenItems.map((item) => (
            <div key={item.key} class="sidenav-hidden-row" data-nav={item.key}>
              <span class="sidenav-hidden-row__icon">{item.icon}</span>
              <span class="sidenav-hidden-row__label">{item.label}</span>
              <button
                type="button"
                class="sidenav-hidden-row__restore"
                onClick={() => onRestore && onRestore(item.key)}
              >
                恢复
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

export default HiddenItemsDrawer;