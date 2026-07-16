/**
 * src/renderer/github/GithubReleasesView.jsx
 *
 * GitHub 优秀项目收录 — 抽屉「更新」tab：版本对比条 + Release 时间线。
 * 复用 README/AI 解析的骨架屏 / 错误态 / 空态视觉语言，新增第三语义轴（更新=蓝）。
 *
 * 2026-07-16 Release 更新追踪。
 */

import { useState, useEffect } from "preact/hooks";
import { api } from "../api.js";
import {
  IconTag,
  IconRefresh,
  IconExternalLink,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconAlert,
} from "../components/icons.jsx";
import {
  githubDensity,
  fetchGithubRelease,
  hasGithubUpdate,
  markGithubSeen,
  formatRelativeTime,
} from "../store/github-projects-store.js";

function absoluteDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 月份分组键（YYYY-M），无日期归为 unknown 单独成组。 */
function monthKeyOf(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime()) || !(ts > 0)) return "unknown";
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

/** 月份分组标题（中文「YYYY 年 M 月」）。 */
function monthLabelOf(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime()) || !(ts > 0)) return "日期不明";
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

function ReleasesSkeleton() {
  return (
    <div class="github-rel" role="status" aria-live="polite">
      <span class="github-skel__sr">加载更新信息…</span>
      <div class="github-rel-skel">
        <div class="github-skel__block github-rel-skel__bar" />
        <div class="github-rel-skel__list">
          {[0, 1, 2].map((i) => (
            <div class="github-rel-skel__item" key={i}>
              <span class="github-skel__block github-rel-skel__node" />
              <div class="github-rel-skel__lines">
                <span class="github-skel__block github-rel-skel__line" />
                <span class="github-skel__block github-rel-skel__line github-skel__short" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReleasesError({ reason, onRetry }) {
  return (
    <div class="github-ai-error">
      <IconAlert size={18} />
      <span>
        {reason === "rate_limited"
          ? "GitHub API 频率受限（未登录 60 次/小时），请稍后再试"
          : reason === "not_found"
            ? "未找到该仓库的 Release 信息"
            : "更新信息加载失败，请重试"}
      </span>
      <button type="button" class="github-btn github-btn--ghost github-rel-reparse" onClick={onRetry}>
        <IconRefresh size={14} /> 重试
      </button>
    </div>
  );
}

export function GithubReleasesView({ project, onMarkSeen }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});

  const needsFetch = !project.releaseFetchedAt;
  const hasUpdate = hasGithubUpdate(project);

  useEffect(() => {
    if (!needsFetch) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGithubRelease(project.id)
      .then((r) => {
        if (!cancelled && !r.ok) setError(r.reason);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, needsFetch]);

  function handleRetry() {
    setLoading(true);
    setError(null);
    fetchGithubRelease(project.id)
      .then((r) => {
        if (!r.ok) setError(r.reason);
      })
      .finally(() => setLoading(false));
  }

  function handleMarkSeen() {
    markGithubSeen(project.id);
    if (onMarkSeen) onMarkSeen();
  }

  function toggleNotes(i) {
    setExpanded((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  if (loading) return <ReleasesSkeleton />;
  if (error) return <ReleasesError reason={error} onRetry={handleRetry} />;

  const releases = Array.isArray(project.releases) ? project.releases : [];
  if (!project.latestVersion || releases.length === 0) {
    return (
      <div class="github-ai-empty">
        <IconTag size={28} />
        <p>该项目还没有发布 Release</p>
      </div>
    );
  }

  const density = githubDensity.value;
  const timelineItems = releases.map((r, i) => ({
    r,
    originalIndex: i,
    isLatest: i === 0,
  }));
  const groups = [];
  const groupIndex = new Map();
  for (const it of timelineItems) {
    const key = monthKeyOf(it.r.publishedAt);
    let g = groupIndex.get(key);
    if (!g) {
      g = { key, label: monthLabelOf(it.r.publishedAt), items: [] };
      groupIndex.set(key, g);
      groups.push(g);
    }
    g.items.push(it);
  }
  // 默认展开条数由密度决定：紧凑仅展开最新，舒适展开全部
  function isOpen(i) {
    const def = density === "compact" ? i === 0 : true;
    return expanded[i] ?? def;
  }

  return (
    <div class="github-rel">
      <div class={`github-rel-bar ${hasUpdate ? "is-update" : ""}`}>
        <div class="github-rel-bar__ver">
          <span class="github-rel-bar__tag">最新</span>
          <span class="github-rel-ver">v{project.latestVersion}</span>
          {project.latestVersionPublishedAt > 0 && (
            <span
              class="github-rel-bar__date"
              title={absoluteDate(project.latestVersionPublishedAt)}
            >
              发布于 {formatRelativeTime(project.latestVersionPublishedAt)}
            </span>
          )}
        </div>
        {hasUpdate && (
          <button
            type="button"
            class="github-rel-markseen"
            onClick={handleMarkSeen}
          >
            <IconCheck size={14} /> 标记已读
          </button>
        )}
      </div>

      <div class={`github-rel-timeline ${density === "compact" ? "github-rel-timeline--compact" : ""}`}>
        {groups.map((g) => (
          <div class="github-rel-group" key={g.key}>
            <div class="github-rel-month">{g.label}</div>
            {g.items.map(({ r, originalIndex, isLatest }) => (
              <div
                class={`github-rel-item ${isLatest ? "is-latest" : ""}`}
                key={r.tagName || r.version || originalIndex}
              >
                <span class="github-rel-node" aria-hidden="true" />
                <div class="github-rel-item__body">
                  <div class="github-rel-item__head">
                    <span class="github-rel-ver">v{r.version}</span>
                    {r.publishedAt > 0 && (
                      <span
                        class="github-rel-item__date"
                        title={absoluteDate(r.publishedAt)}
                      >
                        {formatRelativeTime(r.publishedAt)}
                      </span>
                    )}
                    {r.notesUrl && (
                      <a
                        class="github-rel-link"
                        href={r.notesUrl}
                        title="打开 Release 页面"
                        onClick={(e) => {
                          e.preventDefault();
                          api.openUrl(r.notesUrl);
                        }}
                      >
                        <IconExternalLink size={13} /> Release
                      </a>
                    )}
                  </div>
                  {r.body && r.body.trim() && (
                    <>
                      <p
                        class={`github-rel-notes ${isOpen(originalIndex) ? "is-open" : ""}`}
                      >
                        {r.body.trim()}
                      </p>
                      <button
                        type="button"
                        class="github-rel-toggle"
                        aria-expanded={!!isOpen(originalIndex)}
                        onClick={() => toggleNotes(originalIndex)}
                      >
                        {isOpen(originalIndex) ? "收起说明" : "展开说明"}
                        {isOpen(originalIndex) ? (
                          <IconChevronUp size={13} />
                        ) : (
                          <IconChevronDown size={13} />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default GithubReleasesView;
