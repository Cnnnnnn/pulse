/**
 * src/renderer/components/AppVersions.jsx
 *
 * 已安装 → 最新 两栏版本对比
 */

export function AppVersions({ result }) {
  const installed = result.installed_version || '—';
  const latest = result.latest_version || '—';
  const highlight = !!result.has_update;

  return (
    <div class="app-versions">
      <div class="version-block">
        <div class="version-label">已安装</div>
        <div class="version-value">{installed}</div>
      </div>
      <div class="version-arrow">→</div>
      <div class="version-block">
        <div class="version-label">最新</div>
        <div class={`version-value${highlight ? ' highlight' : ''}`}>{latest}</div>
      </div>
    </div>
  );
}
