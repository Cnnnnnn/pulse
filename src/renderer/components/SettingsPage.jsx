import { PageHeader } from "./PageHeader.jsx";
import { signal } from "@preact/signals";
import { getThemePreference, setThemePreference } from "../theme/theme-manager.js";
import { showToast } from "../store.js";

/* 当前偏好以 signal 维护, 与 theme-manager 的 localStorage 持久化保持同步 */
const themeMode = signal(getThemePreference());

const OPTIONS = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

const TOAST_LABEL = { system: "跟随系统", light: "浅色", dark: "深色" };

export function SettingsPage() {
  return (
    <div class="settings-page">
      <PageHeader title="设置" subtitle="外观 / Reminders / Watchlist / Recent / Export" />
      <div class="settings-content">
        <section class="settings-section">
          <h3 class="settings-section__title">外观</h3>
          <div class="settings-row--inline">
            <span class="settings-row__label">主题</span>
            <div class="theme-segmented" role="radiogroup" aria-label="主题模式">
              {OPTIONS.map((opt) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={themeMode.value === opt.value}
                  class={"theme-segmented-item" + (themeMode.value === opt.value ? " is-active" : "")}
                  onClick={() => {
                    themeMode.value = opt.value;
                    setThemePreference(opt.value);
                    // P12: 主题切换 toast 反馈 (设置页 + 托盘广播 + Cmd+K 都走这条路径)
                    showToast(`主题已切换为「${TOAST_LABEL[opt.value] || opt.value}」`, "success", 1800);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <p class="settings-hint">
            选择「跟随系统」时，将自动匹配 macOS / Windows 的系统外观设置。
          </p>
        </section>

        <section class="settings-section">
          <h3 class="settings-section__title">其他</h3>
          <p class="settings-todo">TODO: Reminders / Watchlist 管理 / Recent 清除 / Export 按钮</p>
        </section>
      </div>
    </div>
  );
}

export default SettingsPage;
