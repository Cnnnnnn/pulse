/**
 * src/renderer/components/AppCard.jsx
 *
 * Library Card 视图单卡. ponytail: 跟 AppRow 共用 data source,
 * 但不抽 helper — Card 后续可独立演进 (放更多元数据).
 *
 * ponytail: RowOverflowMenu 的 onPin / onSnooze / onRollback / onShowChangelog
 * 在 Card 视图暂用 no-op; 后续 LibraryPage 接入 watchlist / history store 时再补.
 * 当前 ceiling: 卡片只渲染升级按钮 + 打开菜单, 菜单项点击不触发动作.
 */
import { useState } from "preact/hooks";
import { getResultSignal, getAppPhaseSignal } from "../store.js";
import { api } from "../api.js";
import { AppAvatar } from "./AppAvatar.jsx";
import { RowOverflowMenu } from "./AppRow.jsx"; // 复用

export function AppCard({ name }) {
  const result = getResultSignal(name).value;
  const phase = getAppPhaseSignal(name).value;
  const [upgrading, setUpgrading] = useState(false);

  async function onUpgrade() {
    if (!result || !result.bundle) return;
    setUpgrading(true);
    try { await api.brewUpgrade(result.bundle); } catch {}
    setUpgrading(false);
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

  const noop = () => {};
  return (
    <div class="app-card" data-name={result.name}>
      <AppAvatar bundle={result.bundle} name={result.name} />
      <div class="app-card-name">{result.name}</div>
      <div class="app-card-versions">
        {result.current_version} → {result.latest_version}
        {result.has_update && <span class="app-card-update-badge">有更新</span>}
      </div>
      <button
        type="button"
        class="btn-upgrade-row"
        onClick={onUpgrade}
        disabled={upgrading || !result.has_update}
        aria-label={`升级 ${result.name}`}
      >
        {upgrading ? "升级中…" : result.has_update ? "升级" : "最新"}
      </button>
      <RowOverflowMenu
        name={result.name}
        hasUpdate={result.has_update}
        pinned={false}
        onPin={noop}
        onSnooze={noop}
        onRollback={noop}
        onShowChangelog={noop}
        rollbackCount={0}
      />
    </div>
  );
}

export default AppCard;