/**
 * src/renderer/components/IconRail.tsx
 *
 * Phase 9 外壳重构 — 48px 常驻图标边栏 (替代 188px SideNav).
 *
 * 范式: VSCode 活动栏风格 — 极窄图标列常驻, hover section 图标弹 NavDrawer 浏览/管理.
 *
 * 结构 (从上到下):
 *   - Home — 回首页仪表盘
 *   - 分隔
 *   - 3 个 section 图标 (资讯/持仓/系统) — 按 NAV_SECTIONS 渲染
 *       · hover → onHoverSection(sectionId) 打开 NavDrawer
 *       · 聚合 section 未读 badge (sectionBadge)
 *       · 当前 activeNav 所属 section 高亮
 *   - 分隔 (flex 撑开, 把 Settings 推到底)
 *   - Settings (⚙) — 固定底部, 跳设置页
 *
 * 折叠态 (navCollapsed): 48px → 0px, 仅留 4px hover 热区唤出 (语义重定义, 见 plan R3).
 *
 * Phase 9 收尾: 去 .side-nav / .side-nav-collapsed 兼容 class, 老 CSS 规则同删.
 * testid 改 icon-rail-settings-btn (老 side-nav-settings-btn 删).
 */
import { activeNav, navCollapsed, setActiveNav } from "../nav/navStore.ts";
import {
  NAV_SECTIONS,
  NAV_REGISTRY_BY_KEY,
  type NavSectionId,
} from "../../shared/nav-keys.ts";
import { collectNavStatusCtx, sectionBadge } from "./nav-status.ts";
import { IconHome, IconSettings, IconTrendingUp, IconGlobe, IconLayers, IconFilm } from "./icons.tsx";
import { navigateTo } from "../store/route-store.ts";

// section → 代表图标组件 (NAV_REGISTRY 无 section-icon 字段, 这里映射).
const SECTION_ICON: Record<NavSectionId, (p: { size?: number }) => any> = {
  news: IconGlobe,
  holdings: IconTrendingUp,
  // Phase 9 收尾: system 改 IconLayers, 避免跟底部 Settings 按钮重复
  system: IconLayers,
  entertainment: IconFilm,
};

export interface IconRailProps {
  /** hover section 图标时触发 (打开 NavDrawer). */
  onHoverSection?: (sectionId: NavSectionId | null) => void;
  /** 鼠标离开 section 图标 (启动关闭延迟). */
  onLeaveSection?: () => void;
  /** 当前 NavDrawer 打开的 section (null=关). 用于同步高亮. */
  openSection?: NavSectionId | null;
}

export function IconRail({ onHoverSection, onLeaveSection, openSection = null }: IconRailProps) {
  const collapsed = navCollapsed.value;
  const current = activeNav.value;

  // 收集 nav 状态 (read signal 注册 Preact 依赖).
  const navCtx = collectNavStatusCtx();

  // 当前 activeNav 所属 section.
  const activeSection = current === "home" ? null : NAV_REGISTRY_BY_KEY[current]?.section ?? null;

  return (
    <nav
      class={`icon-rail${collapsed ? " icon-rail-collapsed" : ""}`}
      aria-label="主导航"
    >
      {/* Home — 回首页仪表盘 */}
      <button
        type="button"
        class={`icon-rail-btn${current === "home" ? " is-active" : ""}`}
        onClick={() => setActiveNav("home")}
        title="首页"
        aria-label="首页"
        aria-current={current === "home" ? "page" : undefined}
      >
        <span class="icon-rail-glyph" aria-hidden="true">
          <IconHome size={20} />
        </span>
      </button>

      <div class="icon-rail-divider" aria-hidden="true" />

      {/* section 图标列 */}
      <div class="icon-rail-sections">
        {NAV_SECTIONS.map((section) => {
          const SectionIcon = SECTION_ICON[section.id];
          const isActiveSection = activeSection === section.id;
          const isOpen = openSection === section.id;
          const badge = sectionBadge(section.id, navCtx);
          return (
            <button
              key={section.id}
              type="button"
              class={`icon-rail-btn icon-rail-section icon-rail-section-${section.id}${isActiveSection ? " is-active" : ""}${isOpen ? " is-open" : ""}`}
              data-nav={section.id}
              data-section={section.id}
              onMouseEnter={() => onHoverSection?.(section.id)}
              onMouseLeave={() => onLeaveSection?.()}
              onFocus={() => onHoverSection?.(section.id)}
              onBlur={() => onLeaveSection?.()}
              title={section.label}
              aria-label={section.label}
              aria-haspopup="dialog"
              aria-expanded={isOpen}
            >
              <span class="icon-rail-glyph" aria-hidden="true">
                <SectionIcon size={20} />
              </span>
              {isOpen && (
                <span class="icon-rail-active-bar" aria-hidden="true" />
              )}
              {badge > 0 && (
                <span class="icon-rail-badge" aria-hidden="true">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* flex 撑开: Settings 推到底 */}
      <div class="icon-rail-spacer" />

      <div class="icon-rail-divider" aria-hidden="true" />

      {/* Settings — 固定底部 */}
      <button
        type="button"
        class="icon-rail-btn icon-rail-settings"
        onClick={() => { setActiveNav("versions"); navigateTo("settings"); }}
        title="设置"
        aria-label="设置"
        data-testid="icon-rail-settings-btn"
      >
        <span class="icon-rail-glyph" aria-hidden="true">
          <IconSettings size={20} />
        </span>
      </button>
    </nav>
  );
}

export default IconRail;
