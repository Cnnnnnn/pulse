/**
 * src/renderer/components/NavDrawer.tsx
 *
 * Phase 9 外壳重构 — hover 弹出的轻量导航抽屉 (替代 SideNav 主体).
 *
 * 触发: IconRail hover section 图标 → onHoverSection → AppShell 设 openSection → 本组件渲染.
 * 交互: 鼠标离开 IconRail+NavDrawer 150ms 后自动关闭 (hover intent, AppShell 层管理).
 *
 * 内容 (针对当前 section):
 *   - section 标题 (资讯/持仓/系统)
 *   - section 下属可见 nav 项列表 (SideNavItem 复用: 拖拽排序 + 右键菜单 + badge)
 *   - 项 status 摘要 (nav-status.getStatus)
 *   - 底部「已隐藏 N 个」→ 打开 HiddenItemsDrawer
 *
 * 定位: position: fixed; left: 48px (IconRail 右缘), overlay 不挤压主区.
 * 不用 DrawerShell (它默认遮罩 + Escape, 太重; hover 浏览要轻量, 无遮罩).
 */
import { useEffect, useState } from "preact/hooks";
import { NavDrawerItem } from "./NavDrawerItem.tsx";
import { HiddenItemsDrawer } from "./HiddenItemsDrawer.tsx";
import { activeNav, setActiveNav, goInvest, effectiveVisibleItems } from "../nav/navStore.ts";
import {
  NAV_REGISTRY,
  NAV_REGISTRY_BY_KEY,
  NAV_SECTIONS,
  NAV_TO_PREFS_SEGMENT,
  type NavSectionId,
} from "../../shared/nav-keys.ts";
import { LEGACY_NAV_ALIAS } from "../../shared/nav-keys.ts";

// NAV_ITEMS 本地派生 (跟 SideNav 同 schema, 避免两处维护 label/tooltip).
const NAV_ITEMS = NAV_REGISTRY.map((e) => ({ key: e.key, label: e.label, tooltip: e.tooltip }));
import { collectNavStatusCtx, getBadge, getStatus } from "./nav-status.ts";
import { trayMenuPrefs } from "../store/trayConfigStore.ts";
import {
  loadPrefs,
  savePrefs,
  listHidden,
  hideItem,
  restoreItem,
  reorderItems,
  moveToTop,
  moveToBottom,
} from "./sidenav-prefs.ts";

export interface NavDrawerProps {
  /** 当前展开的 section; null = 关闭 (不渲染). */
  section: NavSectionId | null;
  /** 鼠标移入抽屉本体 (AppShell 用来维持打开, 取消关闭延迟). */
  onEnter?: () => void;
  /** 鼠标移出抽屉本体 (AppShell 用来启动关闭延迟). */
  onLeave?: () => void;
}

export function NavDrawer({ section, onEnter, onLeave }: NavDrawerProps) {
  const current = activeNav.value;
  void trayMenuPrefs.value; // 订阅 tray prefs (影响可见性过滤)
  const navCtx = collectNavStatusCtx();

  type SidenavPrefs = ReturnType<typeof loadPrefs>;
  const [sidenavPrefs, setSidenavPrefs] = useState<SidenavPrefs>(() => loadPrefs());
  const [hiddenDrawerOpen, setHiddenDrawerOpen] = useState(false);

  if (!section) return null;

  function applyPrefs(next: SidenavPrefs) {
    setSidenavPrefs(next);
    savePrefs(next);
  }

  // 可见性: effectiveVisibleItems (用户 order + hidden) → 按 tray prefs segment 再过滤.
  const visibleKeys = effectiveVisibleItems(sidenavPrefs).filter((key) => {
    const segKey = NAV_TO_PREFS_SEGMENT[key];
    if (!segKey) return true;
    return trayMenuPrefs.value.segments[segKey] !== false;
  });

  // 本 section 下的可见项 (保持全局相对顺序).
  const sectionItems = visibleKeys
    .filter((key) => NAV_REGISTRY_BY_KEY[key]?.section === section)
    .map((key) => NAV_ITEMS.find((it) => it.key === key))
    .filter(Boolean) as { key: string; label: string; tooltip?: string }[];

  const hiddenNavItems = listHidden(sidenavPrefs)
    .map((key) => NAV_ITEMS.find((it) => it.key === key))
    .filter(Boolean) as { key: string; label: string }[];

  const sectionMeta = NAV_SECTIONS.find((s) => s.id === section);
  const sectionLabel = sectionMeta?.label ?? section;

  function handleSelect(key: string) {
    // invest 系子模块 (funds/metals/stocks, legacy alias) 走 goInvest 设 primary.
    if (key === "invest" || LEGACY_NAV_ALIAS[key] === "invest") {
      goInvest(key === "invest" ? undefined : key);
    } else {
      setActiveNav(key);
    }
    onLeave?.(); // 选中后关闭抽屉
  }
  function handleReorder(fromKey: string, toKey: string, position: "before" | "after") {
    applyPrefs(reorderItems(sidenavPrefs, fromKey, toKey, position));
  }
  function handleHide(key: string) {
    applyPrefs(hideItem(sidenavPrefs, key));
  }
  function handleMoveTop(key: string) {
    applyPrefs(moveToTop(sidenavPrefs, key));
  }
  function handleMoveBottom(key: string) {
    applyPrefs(moveToBottom(sidenavPrefs, key));
  }
  function handleRestore(key: string) {
    applyPrefs(restoreItem(sidenavPrefs, key));
  }

  return (
    <>
      <aside
        class="nav-drawer"
        data-section={section}
        role="dialog"
        aria-label={`${sectionLabel} 导航`}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        <div class="nav-drawer-header">
          <span class="nav-drawer-title">{sectionLabel}</span>
          <span class="nav-drawer-count">{sectionItems.length} 项</span>
        </div>
        {sectionItems.length === 0 ? (
          <div class="nav-drawer-empty">
            本组已全部隐藏
            {hiddenNavItems.length > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  class="nav-drawer-empty-link"
                  onClick={() => setHiddenDrawerOpen(true)}
                >
                  恢复
                </button>
              </>
            )}
          </div>
        ) : (
          <ul class="nav-drawer-list">
            {sectionItems.map((item) => {
              const isActive = current === item.key;
              const badge = getBadge(item.key, navCtx) || 0;
              const status = getStatus(item.key, navCtx);
              return (
                <NavDrawerItem
                  key={item.key}
                  item={item}
                  active={isActive}
                  badge={badge}
                  onSelect={handleSelect}
                  onReorder={handleReorder}
                  onHide={handleHide}
                  onMoveTop={handleMoveTop}
                  onMoveBottom={handleMoveBottom}
                />
              );
            })}
          </ul>
        )}

        {/* 项 status 摘要条 (当前 active 项的实时状态) */}
        {current !== "home" && getStatus(current, navCtx) && (
          <div class="nav-drawer-status" aria-live="polite">
            {getStatus(current, navCtx)}
          </div>
        )}

        {/* 底部: 已隐藏入口 */}
        {hiddenNavItems.length > 0 && (
          <div class="nav-drawer-footer">
            <button
              type="button"
              class="nav-drawer-hidden-toggle"
              onClick={() => setHiddenDrawerOpen(true)}
            >
              已隐藏 ({hiddenNavItems.length})
            </button>
          </div>
        )}
      </aside>

      <HiddenItemsDrawer
        open={hiddenDrawerOpen}
        hiddenItems={hiddenNavItems}
        onRestore={handleRestore}
        onClose={() => setHiddenDrawerOpen(false)}
      />
    </>
  );
}

export default NavDrawer;
