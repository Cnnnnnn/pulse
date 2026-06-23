/**
 * src/renderer/components/SideNavItem.jsx
 *
 * Phase I3 v1: 单个 SideNav item 的拖拽 + 右键菜单子组件.
 *
 * Props:
 *   - item: { key, icon, label, tooltip }
 *   - active: boolean
 *   - collapsed: boolean
 *   - onSelect(key): 切 activeNav
 *   - onReorder(fromKey, toKey, position): 调 sidenav-prefs.reorderItems
 *   - onHide(key): 调 sidenav-prefs.hideItem
 *   - onMoveTop(key): onMoveBottom(key): 调 onReorder to 0 / to last
 *
 * 设计 (spec §3.2):
 *   - ondragstart: setData + classList.add('side-nav-item-dragging')
 *   - ondragover: preventDefault + 根据 mouse Y vs target mid 算 before/after, 加 class
 *   - ondragend: 清 dragging class
 *   - ondrop: 调 onReorder, 清 drop-before/-after class
 *   - oncontextmenu: preventDefault, 打开 <dialog>
 */

import { useEffect, useRef, useState } from "preact/hooks";

export function SideNavItem({
  item,
  active = false,
  collapsed = false,
  badge = 0,
  onSelect,
  onReorder,
  onHide,
  onMoveTop,
  onMoveBottom,
  draggable = true,
}) {
  const dialogRef = useRef(null);
  const liRef = useRef(null);
  const [dropPosition, setDropPosition] = useState(null); // 'before' | 'after' | null

  // contextmenu 弹窗: 始终在 li 上右键就开, 不论 active / collapsed
  function handleContextMenu(e) {
    e.preventDefault();
    if (dialogRef.current && typeof dialogRef.current.showModal === "function") {
      dialogRef.current.showModal();
    } else {
      // fallback: 无 dialog API 时弹 alert 风格的简易菜单 (Electron 通常支持 showModal)
      console.warn(`SideNavItem(${item.key}): <dialog> showModal not available`);
    }
  }

  function closeMenu() {
    if (dialogRef.current && typeof dialogRef.current.close === "function") {
      dialogRef.current.close();
    }
  }

  function handleDragStart(e) {
    if (!draggable) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", item.key);
    e.dataTransfer.effectAllowed = "move";
    if (liRef.current) liRef.current.classList.add("side-nav-item-dragging");
  }

  function handleDragOver(e) {
    if (!draggable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!liRef.current) return;
    const rect = liRef.current.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? "before" : "after";
    if (dropPosition !== pos) setDropPosition(pos);
    liRef.current.classList.toggle("side-nav-item-drop-before", pos === "before");
    liRef.current.classList.toggle("side-nav-item-drop-after", pos === "after");
  }

  function clearDropIndicator() {
    setDropPosition(null);
    if (liRef.current) {
      liRef.current.classList.remove("side-nav-item-drop-before");
      liRef.current.classList.remove("side-nav-item-drop-after");
      liRef.current.classList.remove("side-nav-item-dragging");
    }
  }

  function handleDragEnd() {
    clearDropIndicator();
  }

  function handleDrop(e) {
    e.preventDefault();
    const fromKey = e.dataTransfer.getData("text/plain");
    if (!fromKey || fromKey === item.key) {
      clearDropIndicator();
      return;
    }
    const rect = liRef.current ? liRef.current.getBoundingClientRect() : null;
    let pos = dropPosition;
    if (!pos && rect) {
      const midY = rect.top + rect.height / 2;
      pos = e.clientY < midY ? "before" : "after";
    }
    if (onReorder) onReorder(fromKey, item.key, pos || "before");
    clearDropIndicator();
  }

  function handleHide() {
    if (onHide) onHide(item.key);
    closeMenu();
  }
  function handleMoveTop() {
    if (onMoveTop) onMoveTop(item.key);
    closeMenu();
  }
  function handleMoveBottom() {
    if (onMoveBottom) onMoveBottom(item.key);
    closeMenu();
  }

  // dialog 外部点击关闭 (Electron 默认不支持 backdrop click, 我们手动绑)
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return undefined;
    function onCancel(e) {
      e.preventDefault();
      dlg.close();
    }
    dlg.addEventListener("cancel", onCancel);
    return () => dlg.removeEventListener("cancel", onCancel);
  }, []);

  return (
    <li
      ref={liRef}
      key={item.key}
      class={`side-nav-item${active ? " side-nav-item-active" : ""}`}
      data-nav={item.key}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
    >
      <button
        class="side-nav-button"
        onClick={() => onSelect && onSelect(item.key)}
        title={collapsed ? item.tooltip : ""}
        aria-label={item.label}
      >
        <span class="side-nav-icon">{item.icon}</span>
        {badge > 0 && (
          <span class="side-nav-badge" aria-label={`${badge} 条未读`}>
            {badge}
          </span>
        )}
        {!collapsed && <span class="side-nav-label">{item.label}</span>}
      </button>
      <dialog
        ref={dialogRef}
        class="sidenav-context-menu"
        aria-label={`${item.label} 操作`}
      >
        <div class="sidenav-context-menu__title">{item.icon} {item.label}</div>
        <button type="button" class="sidenav-context-menu__btn" onClick={handleMoveTop}>
          ⬆ 移到顶部
        </button>
        <button type="button" class="sidenav-context-menu__btn" onClick={handleMoveBottom}>
          ⬇ 移到底部
        </button>
        <button type="button" class="sidenav-context-menu__btn sidenav-context-menu__btn--danger" onClick={handleHide}>
          🗑 隐藏
        </button>
        <button type="button" class="sidenav-context-menu__btn sidenav-context-menu__btn--cancel" onClick={closeMenu}>
          取消
        </button>
      </dialog>
    </li>
  );
}

export default SideNavItem;