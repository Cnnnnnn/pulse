import { PageHeader } from "./PageHeader.jsx";

export function SettingsPage() {
  return (
    <div class="settings-page">
      <PageHeader title="设置" subtitle="Reminders / Watchlist / Recent / Export" />
      <div class="settings-content">
        <p>TODO: Reminders / Watchlist 管理 / Recent 清除 / Export 按钮</p>
      </div>
    </div>
  );
}

export default SettingsPage;