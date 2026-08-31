/**
 * src/renderer/components/SettingsPage.jsx
 *
 * v2.79 — P15 设置页 AI 配置深度融入
 *   - 顶部 2-tab 切换: 「常规」(外观 / 最近活动 / 提醒 / 数据) | 「AI 配置」
 *   - 「AI 配置」tab 内嵌完整 AISettingsScene (连接设置 + Prompt 模板)
 *   - 取消 AI 配置弹窗入口: AITasksDrawer config mode 改为
 *     navigateTo('settings') + 切到 'ai-config' 子 tab
 *     (Phase 9 收尾: SideNav 已删, IconRail 没 AI 齿轮入口)
 *   - 取消 AISettingsModal 调用, App.jsx 不再挂载 modal 组件
 *
 * ponytail: single source of truth — 所有 AI 配置修改只在 SettingsPage 'ai-config'
 *          tab 内进行, 移除 Modal 减少状态分裂.
 */
import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { PageHeader } from "./PageHeader.tsx";
import { SubtabList } from "./SubtabList.tsx";
import { AISettingsScene } from "./AISettingsScene.tsx";
import {
  IconBell,
  IconClock,
  IconFilm,
  IconLock,
  IconPalette,
  IconShare,
} from "./icons.tsx";
import { routeTab } from "../store/route-store.ts";
import {
  getThemePreference,
  setThemePreference,
  subscribeTheme,
} from "../theme/theme-manager.ts";
import { showToast } from "../store.ts";
import type { ThemeMode } from "../../shared/ipc-contracts";
import {
  loadGithubSettings,
  downloadGithubBackup, pickGithubBackupFile, githubProjects,
  githubAutoCheck, setGithubAutoCheck,
  githubAutoCheckIntervalMin, setGithubAutoCheckInterval,
  githubNotifyOnNew, setGithubNotifyOnNew,
} from "../store/github-projects-store.ts";
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

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];
const THEME_TOAST = { system: "跟随系统", light: "浅色", dark: "深色" };
const VALID_THEME = new Set<ThemeMode>(["system", "light", "dark"]);
const isThemeMode = (value: string): value is ThemeMode =>
  VALID_THEME.has(value as ThemeMode);

function themeSummary() {
  if (themeMode.value === "system") {
    return `跟随系统 · 当前${themeResolved.value === "dark" ? "深色" : "浅色"}`;
  }
  return themeMode.value === "dark" ? "深色模式" : "浅色模式";
}

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
    const r = await window.api.configExport("");
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

function TmdbSettingsSection() {
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [source, setSource] = useState("");
  const hasSaved = draft.trim().length > 0;

  useEffect(() => {
    let alive = true;
    window.api
      ?.moviesTmdbKeyGet?.()
      .then((r) => {
        if (!alive || !r || !r.ok) return;
        setDraft(r.key || "");
        setSource(r.source || "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const onSave = async () => {
    const v = draft.trim();
    if (!v) return;
    const res = await window.api.moviesTmdbKeySet(v);
    if (res && !res.ok) {
      showToast("保存失败：系统加密不可用，已拒绝明文保存", "error", 3200);
      return;
    }
    setSource("vault");
    showToast("TMDB API Key 已存入密钥库（加密）", "success", 2000);
  };
  const onClear = async () => {
    setDraft("");
    await window.api.moviesTmdbKeySet("");
    const r = await window.api.moviesTmdbKeyGet();
    setDraft((r && r.key) || "");
    setSource((r && r.source) || "");
    showToast("已清除 TMDB Key", "info", 2000);
  };

  const openTmdb = (e: Event) => {
    e.preventDefault();
    window.api?.openUrl?.("https://www.themoviedb.org/settings/api");
  };

  return (
    <section class="settings-group" aria-labelledby="settings-tmdb-title">
      <div class="settings-action-row">
        <span class="settings-action-row__icon">
          <IconFilm size={18} />
        </span>
        <div class="settings-row__label-block">
          <h3 id="settings-tmdb-title">电影 · TMDB API Key</h3>
          <span class="settings-row__hint">
            香港 / 澳门片单与详情需要此 Key。申请免费 Developer Key。
            {source === "env"
              ? " 当前来自 .env。"
              : source === "vault"
                ? " 当前来自密钥库（加密）。"
                : source === "settings"
                  ? " 当前来自本机设置。"
                  : ""}
          </span>
        </div>
      </div>
      <div class="settings-row" style="margin-top:12px">
        <div class="settings-row__buttons github-token-actions">
          <div class="github-token-input-wrap">
            <input
              class="github-token-input"
              type={reveal ? "text" : "password"}
              value={draft}
              placeholder="TMDB API Key"
              autocomplete="off"
              spellcheck={false}
              onInput={(e: any) => setDraft(e.currentTarget.value)}
            />
            <button
              type="button"
              class="settings-btn settings-btn--ghost github-token-reveal"
              onClick={() => setReveal(!reveal)}
              aria-label={reveal ? "隐藏密钥" : "显示密钥"}
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
            disabled={!hasSaved && source !== "settings" && source !== "vault"}
          >
            清除
          </button>
        </div>
      </div>
      <p class="settings-row__hint" style="margin-top:8px">
        没有 Key？在{" "}
        <a href="https://www.themoviedb.org/settings/api" class="settings-link" onClick={openTmdb}>
          TMDB API 设置页
        </a>{" "}
        申请（选 Developer，用 API Key 不是 Access Token）。
      </p>
    </section>
  );
}

/**
 * GitHub 收录 — 访问令牌配置。
 * v2.83: token 存密钥库（主进程 safeStorage/Keychain 加密，名 "github"），
 * 这里只读掩码状态；旧 localStorage 明文由 migrateLegacyGithubToken() 启动时迁移。
 * 用于解除 GitHub API 未登录 60 次/小时限流。
 */
function GithubSettingsSection() {
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<{ id: string; hint: string } | null>(null);
  const hasSaved = !!vaultStatus;

  const loadVaultStatus = async () => {
    try {
      const list = await window.api?.vaultList?.();
      if (!list || !list.ok) {
        setVaultStatus(null);
        return;
      }
      const found = (list.entries || []).find(
        (e: any) => e.name.toLowerCase() === "github",
      );
      setVaultStatus(found ? { id: found.id, hint: found.hint } : null);
    } catch {
      setVaultStatus(null);
    }
  };

  useEffect(() => {
    // 兜底恢复 density/autoCheck 等设置 + 旧 token 迁移缓存
    loadGithubSettings();
    loadVaultStatus();
  }, []);

  const onSave = async () => {
    const v = draft.trim();
    if (!v) return;
    try {
      const res = await window.api?.vaultSet?.({
        name: "github",
        value: v,
        category: "内置功能",
        note: "GitHub 访问令牌",
        upsert: true,
      });
      if (res && res.ok) {
        setDraft("");
        await loadVaultStatus();
        showToast("GitHub Token 已存入密钥库（加密）", "success", 2200);
      } else {
        showToast(
          res && res.reason === "no_safe_storage"
            ? "系统加密不可用，已拒绝明文保存"
            : "保存失败",
          "error",
          3200,
        );
      }
    } catch (err: any) {
      showToast(`保存失败: ${err && err.message}`, "error", 3200);
    }
  };
  const onClear = async () => {
    if (!vaultStatus) return;
    try {
      const res = await window.api?.vaultDelete?.(vaultStatus.id);
      if (res && res.ok) {
        await loadVaultStatus();
        showToast("已清除 GitHub Token", "info", 2000);
      } else {
        showToast("清除失败", "error", 3000);
      }
    } catch (err: any) {
      showToast(`清除失败: ${err && err.message}`, "error", 3000);
    }
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
        <b>5000 次/小时</b>。令牌经系统 <b>Keychain 加密</b>保存在密钥库，不会上传到任何服务器。
      </p>
      <div class="settings-row">
        <div class="settings-row__label-block">
          <span class="settings-row__label">Personal Access Token</span>
          <span class="settings-row__hint">
            {hasSaved
              ? `已存入密钥库（掩码 ${vaultStatus.hint}）。`
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
        收录的项目、README、Release、AI 解析结果只存在本机浏览器，Token 存在密钥库，
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

    <section class="settings-card settings-card--automation">
      <div class="settings-card__heading">
        <div>
          <h3 class="settings-card__title">自动检查</h3>
          <p class="settings-card__intro">仅在 Pulse 运行时检查新版本；关闭应用不会后台运行。</p>
        </div>
        <span class={`settings-status-pill ${githubAutoCheck.value ? "is-on" : ""}`}>{githubAutoCheck.value ? "运行中" : "已暂停"}</span>
      </div>
      <div class="settings-control-row">
        <div class="settings-row__label-block">
          <span class="settings-row__label">自动检查新版本</span>
          <span class="settings-row__hint">按设置的节奏扫描已收录项目的最新版本。</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={githubAutoCheck.value}
          aria-label="自动检查新版本"
          class={`settings-switch ${githubAutoCheck.value ? "is-on" : ""}`}
          onClick={() => setGithubAutoCheck(!githubAutoCheck.value)}
        >
          <span class="settings-switch__thumb" />
        </button>
      </div>
      {githubAutoCheck.value && (
        <div class="settings-control-row">
          <div class="settings-row__label-block">
            <span class="settings-row__label">检查频率</span>
            <span class="settings-row__hint">建议保持 6 小时；过于频繁可能触发 GitHub 限流。</span>
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
      <div class="settings-control-row">
        <div class="settings-row__label-block">
          <span class="settings-row__label">发现新版本时桌面通知</span>
          <span class="settings-row__hint">
            首次发通知时会请求系统通知权限，拒绝后只更新徽标。
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={githubNotifyOnNew.value}
          aria-label="发现新版本时桌面通知"
          class={`settings-switch ${githubNotifyOnNew.value ? "is-on" : ""}`}
          onClick={() => setGithubNotifyOnNew(!githubNotifyOnNew.value)}
        >
          <span class="settings-switch__thumb" />
        </button>
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
    const offRecent: unknown =
      typeof window.api.onRecentUpdated === "function"
        ? window.api.onRecentUpdated(({ entries }) => {
            recentEntries.value = (entries || []).slice(0, 12);
          })
        : null;
    const offReminder: unknown =
      typeof window.api.onRemindersFired === "function"
        ? window.api.onRemindersFired(() => reloadReminders())
        : null;
    // ponytail: 同步 themeMode + themeResolved 跟实际 data-theme 走.
    // 进入设置页时如果 data-theme-source 已经被 init 写过, 用最新值覆盖初始 signal.
    const root =
      typeof document !== "undefined" ? document.documentElement : null;
    if (root) {
      const source = root.getAttribute("data-theme-source");
      if (source && isThemeMode(source)) themeMode.value = source;
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
            <section class="settings-overview" aria-label="设置概览">
              <div class="settings-overview-card">
                <span class="settings-overview-card__icon"><IconPalette size={20} /></span>
                <span class="settings-overview-card__eyebrow">外观</span>
                <strong>{themeSummary()}</strong>
                <span>选择适合当前环境的界面主题</span>
              </div>
              <div class="settings-overview-card">
                <span class="settings-overview-card__icon"><IconClock size={20} /></span>
                <span class="settings-overview-card__eyebrow">最近活动</span>
                <strong>{recent.length ? `${recent.length} 条已记录` : "等待新的记录"}</strong>
                <span>检查更新或完成操作后会自动显示</span>
              </div>
              <div class="settings-overview-card">
                <span class="settings-overview-card__icon"><IconLock size={20} /></span>
                <span class="settings-overview-card__eyebrow">数据安全</span>
                <strong>仅保存在本机</strong>
                <span>配置不会同步到云端服务</span>
              </div>
            </section>

            <section class="settings-group" aria-labelledby="settings-common-title">
              <div class="settings-group__header">
                <h3 id="settings-common-title">常用设置</h3>
                <span>修改后立即生效</span>
              </div>
              <div class="settings-action-list">
                <div class="settings-action-row">
                  <span class="settings-action-row__icon"><IconPalette size={18} /></span>
                  <div class="settings-row__label-block">
                    <span class="settings-row__label">外观主题</span>
                    <span class="settings-row__hint">选择 Pulse 的外观模式。</span>
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
                          if (opt.value === "system") {
                            const root = typeof document !== "undefined" ? document.documentElement : null;
                            const resolved = (root && root.getAttribute("data-theme")) || "light";
                            showToast(`主题已切换为「跟随系统」（当前解析为${resolved === "dark" ? "深色" : "浅色"}）`, "success", 2200);
                          } else {
                            showToast(`主题已切换为「${THEME_TOAST[opt.value] || opt.value}」`, "success", 1800);
                          }
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div class="settings-workspace-grid">
                  <div class="settings-context-panel">
                    <div class="settings-context-panel__heading">
                      <IconClock size={16} />
                      <h4>最近活动</h4>
                    </div>
                    {recent.length === 0 ? (
                      <p class="settings-empty">暂无最近活动。检查更新或操作基金 / 提醒后将自动记录。</p>
                    ) : (
                      <ul class="settings-list">
                        {recent.map((e, i) => (
                          <li key={`${e.ts}-${i}`} class="settings-list__item">
                            <span class="settings-list__kind">{RECENT_KIND_LABEL[e.kind] || e.kind}</span>
                            <span class="settings-list__label">{e.label}</span>
                            {typeof e.count === "number" && e.count > 1 && <span class="settings-list__count">×{e.count}</span>}
                            <span class="settings-list__time">{_humanizeTs(e.ts)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div class="settings-context-panel">
                    <div class="settings-context-panel__heading">
                      <IconBell size={16} />
                      <h4>提醒 <span>{activeReminders.length}</span></h4>
                    </div>
                    {activeReminders.length === 0 ? (
                      <p class="settings-empty">当前无活动提醒。在主面板添加提醒后会在此显示。</p>
                    ) : (
                      <ul class="settings-list">
                        {activeReminders.map((r) => (
                          <li key={r.id} class="settings-list__item">
                            <span class={`settings-list__badge settings-list__badge--${r.status}`}>{r.status === "fired" ? "已触发" : REPEAT_LABEL[r.repeat] || r.repeat}</span>
                            <span class="settings-list__label">{r.title || "(无标题)"}</span>
                            <span class="settings-list__time">{new Date(r.triggerAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                            <div class="settings-list__actions">
                              {r.status === "fired" && <button type="button" class="settings-btn settings-btn--ghost" onClick={() => handleMarkDone(r.id)}>完成</button>}
                              <button type="button" class="settings-btn settings-btn--danger-ghost" onClick={() => handleRemove(r.id)} aria-label={`删除提醒 ${r.title}`}>删除</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <TmdbSettingsSection />

            <section class="settings-group settings-group--migration" aria-labelledby="settings-data-title">
              <div class="settings-action-row">
                <span class="settings-action-row__icon"><IconShare size={18} /></span>
                <div class="settings-row__label-block">
                  <h3 id="settings-data-title">数据与迁移</h3>
                  <span class="settings-row__hint">导出监控列表、提醒、基金与 AI 提示词；也可从备份文件恢复。</span>
                </div>
                <div class="settings-row__buttons">
                  <button type="button" class="settings-btn settings-btn--primary" onClick={handleExport} disabled={dataBusy.value}>导出配置</button>
                  <button type="button" class="settings-btn settings-btn--ghost" onClick={handleImport} disabled={dataBusy.value}>导入配置…</button>
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
