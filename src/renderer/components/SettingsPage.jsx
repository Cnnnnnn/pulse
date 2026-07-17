/**
 * src/renderer/components/SettingsPage.jsx
 *
 * v2.79 — P15 设置页 AI 配置深度融入
 *   - 顶部 2-tab 切换: 「常规」(外观 / 最近活动 / 提醒 / 数据) | 「AI 配置」
 *   - 「AI 配置」tab 内嵌完整 AISettingsScene (连接设置 + Prompt 模板)
 *   - 取消 AI 配置弹窗入口: SideNav AI 齿轮 / AITasksDrawer config mode 都改为
 *     navigateTo('settings') + 切到 'ai-config' 子 tab
 *   - 取消 AISettingsModal 调用, App.jsx 不再挂载 modal 组件
 *
 * ponytail: single source of truth — 所有 AI 配置修改只在 SettingsPage 'ai-config'
 *          tab 内进行, 移除 Modal 减少状态分裂.
 */
import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { PageHeader } from "./PageHeader.jsx";
import { SubtabList } from "./SubtabList.jsx";
import { AISettingsScene } from "./AISettingsScene.jsx";
import { routeTab } from "../route-store.js";
import {
  getThemePreference,
  setThemePreference,
  subscribeTheme,
} from "../theme/theme-manager.js";
import { showToast } from "../store.js";
import {
  githubToken, setGithubToken, loadGithubSettings,
  downloadGithubBackup, pickGithubBackupFile, githubProjects,
  githubAutoCheck, setGithubAutoCheck,
  githubAutoCheckIntervalMin, setGithubAutoCheckInterval,
  githubNotifyOnNew, setGithubNotifyOnNew,
} from "../store/github-projects-store.js";

/* ─── theme signal (与 localStorage 同步) ─────────────────────── */
// ponytail: 初始值取 localStorage, 但在 useEffect 里再订阅 data-theme-source
//           变化, 防止 main 进程 / 其它 renderer 改主题时 signal 跟 UI 脱节.
const themeMode = signal(getThemePreference());
/* 当前 system 模式的解析值 (light/dark), 用于设置页提示用户 */
const themeResolved = signal(
  typeof document !== "undefined"
    ? document.documentElement.getAttribute("data-theme") || "light"
    : "light",
);

/* ─── 设置页内部 subtab (常规 / AI 配置) ──────────────────────── */
// ponytail: 初始值用 routeTab (跨组件跳转时由 navigateTo 写入);
//           进入 SettingsPage 后用户手动切换, 不再被 routeTab 覆盖.
const settingsTab = signal(routeTab.value === "ai" ? "ai" : "general");
const SETTINGS_TABS = [
  { key: "general", label: "常规" },
  { key: "github", label: "GitHub" },
  { key: "ai", label: "AI 配置" },
];

const THEME_OPTIONS = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];
const THEME_TOAST = { system: "跟随系统", light: "浅色", dark: "深色" };
const VALID_THEME = new Set(["system", "light", "dark"]);

/* ─── 最近活动 + 提醒 (异步加载) ──────────────────────────────── */
const recentEntries = signal([]); // RecentActivityEntry[]
const reminders = signal([]); // Reminder[]
const dataBusy = signal(false); // 导出/导入按钮 loading

function _humanizeTs(ts) {
  if (!ts || typeof ts !== "number") return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

const RECENT_KIND_LABEL = {
  "app-upgrade": "App 升级",
  "app-check": "检查更新",
  "reminder-create": "新建提醒",
  "reminder-update": "更新提醒",
  "reminder-fire": "提醒触发",
  "reminder-done": "提醒完成",
  "reminder-dismissed": "提醒忽略",
  "fund-view": "查看基金",
  "fund-add": "新增基金",
  "fund-update": "更新基金",
  "fund-remove": "移除基金",
  "ithome-view": "查看新闻",
  "ithome-favorite": "收藏新闻",
  "settings-open": "打开设置",
};

const REPEAT_LABEL = { once: "一次性", daily: "每日", weekdays: "工作日", weekly: "每周" };

async function reloadRecent() {
  try {
    const r = await window.api.recentList();
    if (r && r.ok) recentEntries.value = (r.entries || []).slice(0, 12);
  } catch {
    /* noop */
  }
}

async function reloadReminders() {
  try {
    const r = await window.api.remindersList();
    if (r && r.ok) reminders.value = r.reminders || [];
  } catch {
    /* noop */
  }
}

async function handleMarkDone(id) {
  const r = await window.api.remindersMarkDone(id);
  if (r && r.ok) {
    showToast("已标记完成", "success", 1500);
    reloadReminders();
  } else {
    showToast("操作失败", "error", 2000);
  }
}

async function handleRemove(id) {
  const r = await window.api.remindersRemove(id);
  if (r && r.ok) {
    showToast("已删除", "success", 1500);
    reloadReminders();
  } else {
    showToast("删除失败", "error", 2000);
  }
}

async function handleExport() {
  dataBusy.value = true;
  try {
    const r = await window.api.configExport();
    if (r && r.ok) {
      showToast(`配置已导出到 ${r.path.split("/").pop()}`, "success", 3000);
    } else {
      showToast(`导出失败: ${r && r.reason}`, "error", 3000);
    }
  } finally {
    dataBusy.value = false;
  }
}

async function handleImport() {
  dataBusy.value = true;
  try {
    const load = await window.api.configImportLoad();
    if (!load || !load.ok) {
      if (load && load.reason !== "cancelled") {
        showToast(`导入失败: ${load.reason || "未知"}`, "error", 3000);
      }
      return;
    }
    const applied = await window.api.configImportApply({ fields: load.fields });
    if (applied && applied.ok) {
      const fields = applied.applied.join(" / ");
      showToast(`已导入: ${fields}`, "success", 3000);
      reloadReminders();
      reloadRecent();
    } else {
      showToast(`应用失败: ${applied && applied.reason}`, "error", 3000);
    }
  } finally {
    dataBusy.value = false;
  }
}

/**
 * GitHub 收录 — 访问令牌配置。
 * 令牌仅存于本机 localStorage（pulse.github.settings.v1），不会上传服务器。
 * 用于解除 GitHub API 未登录 60 次/小时限流。
 */
function GithubSettingsSection() {
  const [draft, setDraft] = useState(githubToken.value);
  const [reveal, setReveal] = useState(false);
  const hasSaved = githubToken.value.length > 0;

  // 打开设置时确保从 localStorage 恢复已保存的 Token 并回填输入框，
  // 避免「已保存过 Token、但未访问 GitHub 视图时 githubToken 信号仍为空」导致字段显示空白。
  useEffect(() => {
    loadGithubSettings();
    setDraft(githubToken.value);
  }, []);

  const onSave = () => {
    const v = draft.trim();
    if (!v) return;
    setGithubToken(v);
    showToast("GitHub Token 已保存（仅存于本机）", "success", 2000);
  };
  const onClear = () => {
    setDraft("");
    setGithubToken("");
    showToast("已清除 GitHub Token", "info", 2000);
  };
  const openTokens = (e) => {
    e.preventDefault();
    if (typeof window !== "undefined" && window.api && window.api.openUrl) {
      window.api.openUrl("https://github.com/settings/tokens");
    }
  };

  const handleExport = () => {
    try {
      downloadGithubBackup();
      const n = githubProjects.value.length;
      showToast(`已导出 ${n} 个项目到备份文件`, "success", 3000);
    } catch (err) {
      showToast(`导出失败: ${err && err.message}`, "error", 3000);
    }
  };
  const handleImport = async () => {
    try {
      const r = await pickGithubBackupFile();
      if (!r) return; // 用户取消
      if (!r.ok) {
        showToast(`导入失败：备份文件格式不正确`, "error", 3000);
        return;
      }
      showToast(`已导入 ${r.imported} 个，跳过 ${r.skipped} 个已存在`, "success", 4000);
    } catch (err) {
      showToast(`导入失败: ${err && err.message}`, "error", 3000);
    }
  };

  return (
    <>
    <section class="settings-card">
      <h3 class="settings-card__title">GitHub 访问令牌</h3>
      <p class="settings-row__hint" style="margin:0 0 12px">
        用于解除 GitHub API 未登录 <b>60 次/小时</b> 的限流，认证后提升至{" "}
        <b>5000 次/小时</b>。令牌<b>只保存在本机浏览器</b>，不会上传到任何服务器。
      </p>
      <div class="settings-row">
        <div class="settings-row__label-block">
          <span class="settings-row__label">Personal Access Token</span>
          <span class="settings-row__hint">
            {hasSaved
              ? "当前已保存令牌（已遮挡）。"
              : "尚未配置，使用未登录限流额度。"}
          </span>
        </div>
        <div class="settings-row__buttons github-token-actions">
          <div class="github-token-input-wrap">
            <input
              class="github-token-input"
              type={reveal ? "text" : "password"}
              value={draft}
              placeholder="github_pat_..."
              autocomplete="off"
              spellcheck={false}
              onInput={(e) => setDraft(e.currentTarget.value)}
            />
            <button
              type="button"
              class="settings-btn settings-btn--ghost github-token-reveal"
              onClick={() => setReveal(!reveal)}
              aria-label={reveal ? "隐藏令牌" : "显示令牌"}
            >
              {reveal ? "隐藏" : "显示"}
            </button>
          </div>
          <button
            type="button"
            class="settings-btn settings-btn--primary"
            onClick={onSave}
            disabled={draft.trim().length === 0}
          >
            保存
          </button>
          <button
            type="button"
            class="settings-btn settings-btn--danger-ghost"
            onClick={onClear}
            disabled={!hasSaved}
          >
            清除
          </button>
        </div>
      </div>
      <p class="settings-row__hint" style="margin-top:8px">
        没有令牌？在{" "}
        <a
          href="https://github.com/settings/tokens"
          class="settings-link"
          onClick={openTokens}
        >
          GitHub Token 设置页
        </a>{" "}
        创建一个（读取公开仓库信息无需勾选任何 scope）。
      </p>
    </section>

    <section class="settings-card">
      <h3 class="settings-card__title">数据备份</h3>
      <p class="settings-row__hint" style="margin:0 0 12px">
        收录的项目、README、Release、AI 解析结果与 Token 都只存在本机浏览器，
        换电脑或清理缓存会丢失。建议定期<b>导出备份</b>。
      </p>
      <div class="settings-row">
        <div class="settings-row__label-block">
          <span class="settings-row__label">备份与迁移</span>
          <span class="settings-row__hint">
            当前已收录 {githubProjects.value.length} 个项目。
            导出包含全部数据；导入时已存在的项目会跳过（保留本地）。
          </span>
        </div>
        <div class="settings-row__buttons">
          <button
            type="button"
            class="settings-btn settings-btn--ghost"
            onClick={handleExport}
            disabled={githubProjects.value.length === 0}
          >
            导出备份
          </button>
          <button
            type="button"
            class="settings-btn settings-btn--primary"
            onClick={handleImport}
          >
            导入备份
          </button>
        </div>
      </div>
    </section>

    <section class="settings-card">
      <h3 class="settings-card__title">自动检查</h3>
      <p class="settings-row__hint" style="margin:0 0 12px">
        在应用运行时定时检查新版本，发现更新时弹桌面通知。
        <b>仅在应用开着时检查</b>，关闭应用不会后台运行。
      </p>
      <div class="settings-row">
        <div class="settings-row__label-block">
          <span class="settings-row__label">自动检查新版本</span>
          <span class="settings-row__hint">
            {githubAutoCheck.value ? "已开启" : "已关闭"}
          </span>
        </div>
        <div class="settings-row__buttons">
          <button
            type="button"
            class={`settings-btn ${githubAutoCheck.value ? "settings-btn--primary" : "settings-btn--ghost"}`}
            onClick={() => setGithubAutoCheck(!githubAutoCheck.value)}
          >
            {githubAutoCheck.value ? "已开启" : "已关闭"}
          </button>
        </div>
      </div>
      {githubAutoCheck.value && (
        <div class="settings-row">
          <div class="settings-row__label-block">
            <span class="settings-row__label">检查频率</span>
            <span class="settings-row__hint">过于频繁可能触发 GitHub 限流。</span>
          </div>
          <div class="settings-select">
            <select
              class="settings-select__el"
              value={String(githubAutoCheckIntervalMin.value)}
              onChange={(e) => setGithubAutoCheckInterval(Number(e.currentTarget.value))}
            >
              <option value="60">每 1 小时</option>
              <option value="180">每 3 小时</option>
              <option value="360">每 6 小时（默认）</option>
              <option value="720">每 12 小时</option>
            </select>
          </div>
        </div>
      )}
      <div class="settings-row">
        <div class="settings-row__label-block">
          <span class="settings-row__label">发现新版本时桌面通知</span>
          <span class="settings-row__hint">
            首次发通知时会请求系统通知权限，拒绝后只更新徽标。
          </span>
        </div>
        <div class="settings-row__buttons">
          <button
            type="button"
            class={`settings-btn ${githubNotifyOnNew.value ? "settings-btn--primary" : "settings-btn--ghost"}`}
            onClick={() => setGithubNotifyOnNew(!githubNotifyOnNew.value)}
          >
            {githubNotifyOnNew.value ? "已开启" : "已关闭"}
          </button>
        </div>
      </div>
    </section>
    </>
  );
}

export function SettingsPage() {
  // 进入页面时拉数据, 监听主进程推送
  useEffect(() => {
    reloadRecent();
    reloadReminders();
    const offRecent =
      typeof window.api.onRecentUpdated === "function"
        ? window.api.onRecentUpdated(({ entries }) => {
            recentEntries.value = (entries || []).slice(0, 12);
          })
        : null;
    const offReminder =
      typeof window.api.onRemindersFired === "function"
        ? window.api.onRemindersFired(() => reloadReminders())
        : null;
    // ponytail: 同步 themeMode + themeResolved 跟实际 data-theme 走.
    // 进入设置页时如果 data-theme-source 已经被 init 写过, 用最新值覆盖初始 signal.
    const root =
      typeof document !== "undefined" ? document.documentElement : null;
    if (root) {
      const source = root.getAttribute("data-theme-source");
      if (source && VALID_THEME.has(source)) themeMode.value = source;
      const resolved = root.getAttribute("data-theme");
      if (resolved === "dark" || resolved === "light")
        themeResolved.value = resolved;
    }
    const offTheme = subscribeTheme((mode) => {
      themeMode.value = mode;
      if (root) {
        const resolved = root.getAttribute("data-theme");
        if (resolved === "dark" || resolved === "light")
          themeResolved.value = resolved;
      }
    });
    return () => {
      if (typeof offRecent === "function") offRecent();
      if (typeof offReminder === "function") offReminder();
      if (typeof offTheme === "function") offTheme();
    };
  }, []);

  const recent = recentEntries.value;
  const activeReminders = reminders.value.filter((r) => r.status !== "dismissed");
  const tab = settingsTab.value;

  return (
    <div class="settings-page">
      <PageHeader title="设置" subtitle="常规设置 · AI 配置" />
      <div class="settings-subtabs">
        <SubtabList
          prefix="settings"
          tabs={SETTINGS_TABS}
          activeKey={tab}
          onChange={(key) => (settingsTab.value = key)}
          ariaLabel="设置分类"
        />
      </div>
      <div class="settings-content">
        {tab === "general" ? (
          <>
            {/* ── 外观 ── */}
            <section class="settings-card">
              <h3 class="settings-card__title">外观</h3>
              <div class="settings-row">
                <div class="settings-row__label-block">
                  <span class="settings-row__label">主题</span>
                  <span class="settings-row__hint">选择「跟随系统」自动匹配 macOS / Windows 外观。</span>
                </div>
                <div class="theme-segmented" role="radiogroup" aria-label="主题模式">
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={themeMode.value === opt.value}
                      class={"theme-segmented-item" + (themeMode.value === opt.value ? " is-active" : "")}
                      onClick={() => {
                        themeMode.value = opt.value;
                        setThemePreference(opt.value);
                        // ponytail: system 模式额外提示当前解析值, 让用户清楚
                        //   "跟随系统" 是按 OS 实时状态走的 (含 macOS Auto 时段切换).
                        if (opt.value === "system") {
                          const root =
                            typeof document !== "undefined"
                              ? document.documentElement
                              : null;
                          const resolved =
                            (root && root.getAttribute("data-theme")) || "light";
                          showToast(
                            `主题已切换为「跟随系统」（当前解析为${
                              resolved === "dark" ? "深色" : "浅色"
                            }）`,
                            "success",
                            2200,
                          );
                        } else {
                          showToast(
                            `主题已切换为「${THEME_TOAST[opt.value] || opt.value}」`,
                            "success",
                            1800,
                          );
                        }
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* ── 最近活动 ── */}
            <section class="settings-card">
              <h3 class="settings-card__title">最近活动</h3>
              {recent.length === 0 ? (
                <p class="settings-empty">暂无最近活动。检查更新或操作基金 / 提醒后将自动记录。</p>
              ) : (
                <ul class="settings-list">
                  {recent.map((e, i) => (
                    <li key={`${e.ts}-${i}`} class="settings-list__item">
                      <span class="settings-list__kind">{RECENT_KIND_LABEL[e.kind] || e.kind}</span>
                      <span class="settings-list__label">{e.label}</span>
                      {typeof e.count === "number" && e.count > 1 && (
                        <span class="settings-list__count">×{e.count}</span>
                      )}
                      <span class="settings-list__time">{_humanizeTs(e.ts)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── 提醒 ── */}
            <section class="settings-card">
              <h3 class="settings-card__title">
                提醒
                <span class="settings-card__count">{activeReminders.length}</span>
              </h3>
              {activeReminders.length === 0 ? (
                <p class="settings-empty">当前无活动提醒。在主面板添加提醒后会在此显示。</p>
              ) : (
                <ul class="settings-list">
                  {activeReminders.map((r) => (
                    <li key={r.id} class="settings-list__item">
                      <span class={`settings-list__badge settings-list__badge--${r.status}`}>
                        {r.status === "fired" ? "已触发" : REPEAT_LABEL[r.repeat] || r.repeat}
                      </span>
                      <span class="settings-list__label">{r.title || "(无标题)"}</span>
                      <span class="settings-list__time">
                        {new Date(r.triggerAt).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <div class="settings-list__actions">
                        {r.status === "fired" && (
                          <button
                            type="button"
                            class="settings-btn settings-btn--ghost"
                            onClick={() => handleMarkDone(r.id)}
                          >
                            完成
                          </button>
                        )}
                        <button
                          type="button"
                          class="settings-btn settings-btn--danger-ghost"
                          onClick={() => handleRemove(r.id)}
                          aria-label={`删除提醒 ${r.title}`}
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── 数据 ── */}
            <section class="settings-card">
              <h3 class="settings-card__title">数据</h3>
              <div class="settings-row">
                <div class="settings-row__label-block">
                  <span class="settings-row__label">配置导出 / 导入</span>
                  <span class="settings-row__hint">
                    导出含监控列表、提醒、基金、AI 提示词 → 桌面
                    <code>pulse-config-{`{时间戳}`}.json</code>。
                  </span>
                </div>
                <div class="settings-row__buttons">
                  <button
                    type="button"
                    class="settings-btn settings-btn--primary"
                    onClick={handleExport}
                    disabled={dataBusy.value}
                  >
                    导出配置
                  </button>
                  <button
                    type="button"
                    class="settings-btn settings-btn--ghost"
                    onClick={handleImport}
                    disabled={dataBusy.value}
                  >
                    导入配置…
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : (
          /* ── GitHub 收录 (token 配置) ── */
          tab === "github" ? (
            <GithubSettingsSection />
          ) : (
            /* ── AI 配置 (P16: 不再用 settings-card 包裹, 让外层 .settings-content 滚动接管;
                AISettingsScene 内部已是 settings-card 段, 多包一层会触发 overflow:hidden 把内容切掉.) ── */
            <AISettingsScene compact={false} initialTab="connection" />
          )
        )}
      </div>
    </div>
  );
}

export default SettingsPage;