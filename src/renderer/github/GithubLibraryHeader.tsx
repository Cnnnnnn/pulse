import { IconCheck, IconRefresh, IconSparkles } from "../components/icons.tsx";

export function GithubLibraryHeader({
  stats,
  checking,
  progress,
  failedCount = 0,
  onAdd,
  onCheckUpdates,
  onMarkAllSeen,
  onRetryFailed,
}: any) {
  const unread = stats?.unread || 0;
  return (
    <section class="github-library__header" aria-labelledby="github-library-title">
      <div class="github-library__heading">
        <div>
          <p class="github-library__eyebrow">GitHub 收录</p>
          <h2 id="github-library-title">我的开源库</h2>
          <p class="github-library__summary">
            {stats?.total || 0} 个项目 · {unread} 个待处理更新
          </p>
        </div>
        <div class="github-library__primary-actions">
          <button type="button" class="github-control github-btn github-btn--primary" onClick={onAdd}>
            <IconSparkles size={14} /> 添加项目
          </button>
          <button
            type="button"
            class="github-control github-btn github-btn--ghost github-check-btn"
            onClick={onCheckUpdates}
            disabled={checking || !(stats?.total > 0)}
          >
            {checking ? (
              <>
                <span class="github-spinner github-check-btn__spin" aria-hidden="true" />
                {progress?.total ? `检查中 ${progress.done}/${progress.total}` : "检查中…"}
              </>
            ) : (
              <><IconRefresh size={14} /> 检查更新</>
            )}
          </button>
        </div>
      </div>
      <div class="github-library__secondary-actions">
        {failedCount > 0 && (
          <button type="button" class="github-control github-btn github-btn--ghost" onClick={onRetryFailed} disabled={checking}>
            <IconRefresh size={14} /> 重试失败项 {failedCount}
          </button>
        )}
        {unread > 0 && (
          <button type="button" class="github-control github-btn github-btn--ghost" onClick={onMarkAllSeen}>
            <IconCheck size={14} /> 全部已读 {unread}
          </button>
        )}
      </div>
    </section>
  );
}

export default GithubLibraryHeader;
