import type { ComponentChildren } from "preact";
import { DrawerShell } from "../components/DrawerShell.tsx";
import { IconGlobe, IconRefresh } from "../components/icons.tsx";
import {
  formatStars,
  hasDistinctHomepage,
  hostnameOf,
} from "../store/github-projects-store.ts";
import { api } from "../api.ts";

export interface GithubDrawerTab {
  key: string;
  label: string;
  icon: (props: { size?: number }) => any;
}

export function GithubDrawerShell({
  project,
  tabs,
  activeTab,
  onTabChange,
  onRefresh,
  onOpenExternal,
  onClose,
  busy,
  children,
}: {
  project: any;
  tabs: GithubDrawerTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  onRefresh: () => void;
  onOpenExternal: () => void;
  onClose: () => void;
  busy: boolean;
  children: ComponentChildren;
}) {
  const header = (
    <header class="github-drawer__topbar">
      <div class="github-drawer__topbar-identity">
        <span class="github-drawer__title">{project.name}</span>
        <div class="github-drawer__meta-line">
          {project.language && <span class="github-drawer__lang">{project.language}</span>}
          {typeof project.stars === "number" && project.stars > 0 && (
            <span class="github-drawer__stars">★ {formatStars(project.stars)}</span>
          )}
          {project.license && <span class="github-drawer__license">{project.license}</span>}
          {hasDistinctHomepage(project) && (
            <a
              class="github-drawer__homepage"
              href={project.homepage}
              onClick={(event) => {
                event.preventDefault();
                api.openUrl(project.homepage);
              }}
            >
              <IconGlobe size={12} /> {hostnameOf(project.homepage)}
            </a>
          )}
        </div>
      </div>
      <div class="github-drawer__actions">
        <button
          type="button"
          class="github-control github-icon-btn"
          title="刷新 README"
          onClick={onRefresh}
          disabled={busy}
        >
          <IconRefresh size={16} />
        </button>
        <button
          type="button"
          class="github-control github-icon-btn"
          title="在 GitHub 打开"
          onClick={onOpenExternal}
        >
          <IconGlobe size={16} />
        </button>
        <button
          type="button"
          class="github-control github-drawer__close"
          onClick={onClose}
          aria-label="关闭"
        >
          ×
        </button>
      </div>
    </header>
  );

  const tabBar = (
    <nav class="github-drawer__tabs" role="tablist" aria-label="项目内容">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          type="button"
          role="tab"
          id={`github-tab-${key}`}
          aria-selected={activeTab === key}
          aria-controls="github-drawer-panel"
          class={`github-tab github-tab--compact${activeTab === key ? " is-active" : ""}`}
          onClick={() => onTabChange(key)}
          key={key}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </nav>
  );

  return (
    <DrawerShell
      open
      onClose={onClose}
      header={header}
      beforeBody={tabBar}
      overlayClass="github-drawer-overlay"
      drawerClass="github-drawer"
      bodyClass="github-drawer__body"
      role="dialog"
      ariaLabel={`${project.name} 项目详情`}
    >
      <div
        class="github-drawer__content"
        data-tab={activeTab}
        id="github-drawer-panel"
        role="tabpanel"
        aria-labelledby={`github-tab-${activeTab}`}
      >
        {children}
      </div>
    </DrawerShell>
  );
}

export default GithubDrawerShell;
