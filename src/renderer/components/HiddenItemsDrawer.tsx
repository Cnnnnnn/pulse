/**
 * src/renderer/components/HiddenItemsDrawer.tsx
 *
 * Phase 9: 类名从 sidenav-* 改为 nav-drawer-* (跟新 IconRail/NavDrawer 命名对齐).
 * Phase I3 v1: 显示已隐藏 nav item 的抽屉.
 */

import { DrawerShell } from './DrawerShell.tsx';
import { DrawerEmpty } from './EmptyState.tsx';
import { NavIcon } from './icons.tsx';

export function HiddenItemsDrawer({ open, hiddenItems = [], onRestore, onClose }) {
  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title="已隐藏的导航项"
      overlayClass="nav-drawer-hidden-drawer-overlay"
      drawerClass="nav-drawer-hidden-drawer"
      ariaLabel="已隐藏的导航项"
      usePortal
    >
      {hiddenItems.length === 0 && (
        <DrawerEmpty message="没有隐藏项" className="nav-drawer-hidden-drawer__empty" />
      )}
      {hiddenItems.map((item) => (
        <div key={item.key} class="nav-drawer-hidden-row" data-nav={item.key}>
          <span class="nav-drawer-hidden-row__icon" aria-hidden="true">
            <NavIcon navKey={item.key} size={16} />
          </span>
          <span class="nav-drawer-hidden-row__label">{item.label}</span>
          <button
            type="button"
            class="nav-drawer-hidden-row__restore"
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
