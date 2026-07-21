/**
 * src/renderer/components/HiddenItemsDrawer.jsx
 *
 * Phase I3 v1: 显示已隐藏 nav item 的抽屉.
 */

import { DrawerShell } from './DrawerShell.jsx';
import { DrawerEmpty } from './EmptyState.jsx';
import { NavIcon } from './icons.jsx';

export function HiddenItemsDrawer({ open, hiddenItems = [], onRestore, onClose }) {
  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title="已隐藏的导航项"
      overlayClass="sidenav-hidden-drawer-overlay"
      drawerClass="sidenav-hidden-drawer"
      ariaLabel="已隐藏的导航项"
      usePortal
    >
      {hiddenItems.length === 0 && (
        <DrawerEmpty message="没有隐藏项" className="sidenav-hidden-drawer__empty" />
      )}
      {hiddenItems.map((item) => (
        <div key={item.key} class="sidenav-hidden-row" data-nav={item.key}>
          <span class="sidenav-hidden-row__icon" aria-hidden="true">
            <NavIcon navKey={item.key} size={16} />
          </span>
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
    </DrawerShell>
  );
}

export default HiddenItemsDrawer;
