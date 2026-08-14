/**
 * src/renderer/components/AppCard.tsx
 *
 * Library Card 视图单卡. ponytail: 跟 AppRow 共用 data source,
 * 但不抽 helper — Card 后续可独立演进 (放更多元数据).
 *
 * 2026-06-28: AppRow 导出列表已删 RowOverflowMenu (依赖的 SnoozeMenu /
 * VersionHistoryDrawer 等 working tree 已删). Card 视图当前只渲染升级按钮;
 * 等 Phase 35+ 决定是否重建 watchlist / snooze / rollback 行级菜单再加回来.
 */
import { useState } from "preact/hooks";
import { getResultSignal } from "../store.ts";
import { api } from "../api.ts";
import { AppAvatar } from "./AppAvatar.tsx";
import { AppAction } from "./AppAction.tsx";
import type { ResultLike } from "./appTypes.ts";

export function AppCard({ name }: { name: string }) {
  const result = getResultSignal(name).value as ResultLike | null;
  const [upgrading, setUpgrading] = useState(false);

  async function onUpgrade(cask: string, appName: string) {
    if (!cask) return;
    setUpgrading(true);
    try {
      await api.brewUpgrade(cask);
    } catch (err) {
      console.warn(`brewUpgrade ${appName} failed:`, err);
    } finally {
      setUpgrading(false);
    }
  }

  if (!result) {
    return (
      <div class="app-card app-card--pending">
        <AppAvatar bundle="" name={name} />
        <div class="app-card-name">{name}</div>
        <div class="app-card-status">检测中...</div>
      </div>
    );
  }

  const installedVersion = result.installed_version || result.current_version || "未知";
  const latestVersion = result.latest_version || "未知";

  return (
    <div class="app-card" data-name={result.name}>
      <AppAvatar bundle={result.bundle} name={result.name} />
      <div class="app-card-name">{result.name}</div>
      <div class="app-card-versions">
        {installedVersion} → {latestVersion}
        {result.has_update ? <span class="app-card-update-badge">有更新</span> : null}
      </div>
      <AppAction result={result} onUpgrade={onUpgrade} isUpgrading={upgrading} />
    </div>
  );
}

export default AppCard;
