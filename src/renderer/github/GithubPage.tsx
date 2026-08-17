/**
 * src/renderer/github/GithubPage.tsx
 *
 * GitHub 优秀项目收录 — 主页面：添加表单 + 项目列表 + 详情抽屉。
 * 列表分页、README 与 AI 解析结果在抽屉内以清晰布局呈现。
 */

import { useMemo, useState } from "preact/hooks";
import { FeatureHeader } from "../components/FeatureHeader.tsx";
import {
  githubProjects,
  githubError,
  githubCheckDataState,
  checkGithubUpdates,
  retryFailedGithubUpdates,
  markGithubSeen,
  markGithubAllSeen,
  lastFailedIds,
  removeGithubProject,
  togglePinGithubProject,
  githubReasonText,
} from "../store/github-projects-store.ts";
import { filterGithubProjects, getGithubLibraryStats } from "./github-library-selectors.ts";
import { showToast } from "../store/toast-store.ts";
import { openConfirm } from "../store/confirmStore.ts";
import { GithubAddDialog } from "./GithubAddDialog.tsx";
import { GithubLibraryHeader } from "./GithubLibraryHeader.tsx";
import { GithubLibrarySidebar } from "./GithubLibrarySidebar.tsx";
import { GithubProjectGrid } from "./GithubProjectGrid.tsx";
import { GithubProjectDrawer } from "./GithubProjectDrawer.tsx";

function GithubMark({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * 把 checkGithubUpdates / retryFailedGithubUpdates 的结果翻译成 toast。
 * 两个入口共用此 helper，保证门控逻辑一致。
 * 分支：newCount>0 成功 / 仅永久失败 info「已失效」/ 瞬时失败 warn / 全成功 info。
 */
const KNOWN_REASONS = new Set([
  "invalid_url", "invalid_input", "duplicate", "not_found",
  "auth_invalid", "rate_limited", "network_error", "timeout",
  "parse_error", "no_readme", "server_error",
]);

function _reportCheckResult(r) {
  if (!r || !r.ok) return;
  const errorCount = r.errorCount || 0;
  const skippedCount = r.skippedCount || 0;
  if (r.newCount > 0) {
    const extras = [];
    if (errorCount > 0) extras.push(`${errorCount} 个失败`);
    if (skippedCount > 0) extras.push(`${skippedCount} 个已失效`);
    const extra = extras.length ? `（${extras.join(" / ")}）` : "";
    showToast(`发现 ${r.newCount} 个项目有新版本${extra}`, "success");
    return;
  }
  if (errorCount === 0 && skippedCount > 0) {
    const names = (r.skippedProjects || [])
      .map((f) => f.name)
      .slice(0, 3)
      .join("、");
    const more = skippedCount > 3 ? ` 等 ${skippedCount} 个` : "";
    showToast(
      `${skippedCount} 个项目已失效（仓库不存在或已删除）：${names}${more}`,
      "info",
      6000,
    );
    return;
  }
  if (errorCount > 0) {
    const details = (r.failedProjects || [])
      .map((f) => {
        const text = githubReasonText(f.reason);
        const rlBits = [];
        if (f.reason === "rate_limited") {
          if (typeof f.rateLimitRemaining === "number") {
            rlBits.push(`剩余 ${f.rateLimitRemaining} 次`);
          }
          if (typeof f.retryAfter === "number" && f.retryAfter > 0) {
            const mins = Math.max(1, Math.round(f.retryAfter / 60));
            rlBits.push(`约 ${mins} 分钟后重置`);
          }
        }
        const rl = rlBits.length ? ` · ${rlBits.join(" · ")}` : "";
        const detail =
          f.detail && !KNOWN_REASONS.has(f.reason) ? ` [${f.detail}]` : "";
        return `${f.name}(${text}${rl}${detail})`;
      })
      .join("、");
    const fps = r.failedProjects || [];
    const hint = fps.some((f) => f.reason === "auth_invalid")
      ? " · 请在 设置 → GitHub 中重新生成 Token"
      : fps.some((f) => f.reason === "rate_limited")
        ? " · 可在 设置 → GitHub 配置 Token 解除 60 次/小时限制"
        : fps.some(
            (f) =>
              f.reason === "network_error" ||
              f.reason === "fetch_failed" ||
              f.reason === "timeout",
          )
          ? " · 请检查网络连接"
          : fps.some((f) => f.reason === "server_error")
            ? " · GitHub 服务暂时异常，请稍后重试"
            : "";
    const skipNote = skippedCount > 0 ? `（另有 ${skippedCount} 个已失效）` : "";
    showToast(
      `检查完成，${errorCount} 个失败：${details}${hint}${skipNote}`,
      "warn",
      6000,
    );
    return;
  }
  showToast("已是最新版本", "info");
}

export function GithubPage() {
  const [drawerId, setDrawerId] = useState(null);
  const [drawerTab, setDrawerTab] = useState("overview");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [filters, setFilters] = useState({
    status: "all",
    language: "",
    topic: "",
    query: "",
    sort: "added",
  });

  function handleView(id, tab = "overview") {
    setDrawerTab(tab);
    setDrawerId(id);
    // 通过「新版本」徽标进入更新 tab 时，主动标记为已读（徽标随即消失）
    if (tab === "update") markGithubSeen(id);
  }

  function handleParse(id) {
    setDrawerTab("ai");
    setDrawerId(id);
  }

  async function handleCheckUpdates() {
    if (checking) return null;
    setChecking(true);
    setProgress({ done: 0, total: githubProjects.value.length });
    try {
      const r = await checkGithubUpdates({
        onProgress: (done, total) => setProgress({ done, total }),
      });
      _reportCheckResult(r);
      return r;
    } finally {
      setChecking(false);
      setProgress({ done: 0, total: 0 });
    }
  }

  /** 只重试上次失败的项目（工具栏「重试失败项」按钮触发）。 */
  async function handleRetryFailed() {
    if (checking || lastFailedIds.value.length === 0) return null;
    setChecking(true);
    setProgress({ done: 0, total: lastFailedIds.value.length });
    try {
      const r = await retryFailedGithubUpdates({
        onProgress: (done, total) => setProgress({ done, total }),
      });
      _reportCheckResult(r);
      return r;
    } finally {
      setChecking(false);
      setProgress({ done: 0, total: 0 });
    }
  }

  function handleMarkAllSeen() {
    const n = markGithubAllSeen();
    if (n > 0) showToast(`已将 ${n} 个项目标记为已读`, "info");
    return n;
  }

  async function handleRemove(project) {
    const ok = await openConfirm({
      title: "取消收录该项目？",
      message: `将从你的 GitHub 收录库中移除「${project.name}」，此操作不可撤销。`,
      confirmText: "移除",
      cancelText: "取消",
    });
    if (ok) removeGithubProject(project.id);
  }

  function handleFilterChange(next) {
    setFilters((current) => ({ ...current, ...next }));
  }

  const visibleProjects = useMemo(
    () => filterGithubProjects(githubProjects.value, filters),
    [githubProjects.value, filters],
  );

  const count = githubProjects.value.length;
  const stats = getGithubLibraryStats(githubProjects.value);

  return (
    <div class="github-page">
      <FeatureHeader
        className="github-header"
        brand={
          <>
            <span class="github-brand-icon">
              <GithubMark size={18} />
            </span>
            GitHub 优秀项目收录
          </>
        }
      >
        <span class="github-header__count">
          {count > 0 ? `已收录 ${count} 个项目` : "建立你的开源项目库"}
        </span>
      </FeatureHeader>

      <div class="github-body">
        <GithubLibraryHeader
          stats={stats}
          checking={checking}
          progress={progress}
          failedCount={lastFailedIds.value.length}
          onAdd={() => setAddDialogOpen(true)}
          onCheckUpdates={handleCheckUpdates}
          onRetryFailed={handleRetryFailed}
          onMarkAllSeen={handleMarkAllSeen}
        />
        <div class="github-library">
          <GithubLibrarySidebar stats={stats} filters={filters} onFiltersChange={handleFilterChange} />
          <div class="github-library__content">
            <div class="github-toolbar github-library__toolbar">
              <div class="github-search">
                <span aria-hidden="true">⌕</span>
                <input
                  id="filter-search-input"
                  type="text"
                  class="github-search__input"
                  placeholder="搜索项目、简介或标签…"
                  value={filters.query}
                  onInput={(event) => handleFilterChange({ query: event.currentTarget.value })}
                  aria-label="搜索收录项目"
                />
              </div>
              <div class="github-select">
                <select
                  class="github-select__el"
                  value={filters.sort}
                  onChange={(event) => handleFilterChange({ sort: event.currentTarget.value })}
                  aria-label="排序方式"
                >
                  <option value="added">最近收录</option>
                  <option value="stars">Star 数</option>
                  <option value="name">项目名称</option>
                  <option value="published">最近发布</option>
                  <option value="checked">最近检查</option>
                </select>
              </div>
            </div>
            {githubError.value && <p class="github-page__err">操作失败：{githubError.value}</p>}
            {githubCheckDataState.value.error && (
              <p class="github-page__err">更新检查失败：{githubCheckDataState.value.error}，保留最近一次检查结果。</p>
            )}
            <GithubProjectGrid
              projects={visibleProjects}
              totalProjects={githubProjects.value.length}
              onView={handleView}
              onParse={handleParse}
              onRemove={handleRemove}
              onTogglePin={(project) => togglePinGithubProject(project.id)}
            />
          </div>
        </div>
      </div>

      <GithubAddDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} />

      {drawerId && (
        <GithubProjectDrawer
          projectId={drawerId}
          initialTab={drawerTab}
          onClose={() => setDrawerId(null)}
        />
      )}
    </div>
  );
}

export default GithubPage;
