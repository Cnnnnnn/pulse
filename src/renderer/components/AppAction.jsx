/**
 * src/renderer/components/AppAction.jsx
 *
 * 行内操作: 有 brew_cask → "升级" 按钮; 否则 → status badge.
 * Phase 14: 当 result.changelog / result.changelog_url 非空, 多渲染一个
 * "ℹ️ What's New" 按钮, 点击触发父组件的 onShowChangelog 回调.
 *
 * 状态 badge 文案/颜色跟旧 renderer.js 的 STATUS_MAP 对齐:
 *   update_available → "有更新" / cls=update
 *   up_to_date       → "最新"   / cls=latest
 *   no_auto_check    → "无法检测" / cls=warning
 *   not_installed    → "未安装" / cls=warning
 *   error            → "出错"   / cls=error
 *
 * `installed_newer` (note) 显式 → "预发布" / cls=info
 * `incompatible`   (note) 显式 → "需确认" / cls=warning
 */

const STATUS_MAP = {
  update_available: { text: '有更新',   cls: 'update'  },
  up_to_date:       { text: '最新',     cls: 'latest'  },
  no_auto_check:    { text: '无法检测', cls: 'warning' },
  not_installed:    { text: '未安装',   cls: 'warning' },
  error:            { text: '出错',     cls: 'error'   },
};

export function AppAction({ result, onUpgrade, isUpgrading, onShowChangelog, isChangelogOpen }) {
  const note = result.note || '';
  const status = result.status;

  // 特殊 note 显式覆盖
  if (note === 'installed_newer') {
    return <span class="status-badge info">预发布</span>;
  }
  if (note === 'incompatible') {
    return <span class="status-badge warning">需确认</span>;
  }

  // Phase 20: hasChangelog 包含 release_notes_url — 多数 app 没机器可读 changelog,
  // 但可能配了 release_notes_url. 这种情况也该有 ℹ️ 按钮 (进去看官网 release notes 页)
  const hasChangelog = !!(result.changelog || result.changelog_url || result.release_notes_url);

  // 有 brew cask 且需要升级 → 升级按钮 (可能跟 ℹ️ 按钮并排)
  if (result.has_update && result.brew_cask) {
    return (
      <div class="app-action-group">
        {hasChangelog && (
          <button
            class={`btn-info-row${isChangelogOpen ? ' active' : ''}`}
            onClick={() => onShowChangelog && onShowChangelog()}
            title="查看更新说明"
            aria-label="查看更新说明"
          >
            ℹ️
          </button>
        )}
        <button
          class="btn-upgrade-row"
          onClick={() => onUpgrade(result.brew_cask, result.name)}
          disabled={isUpgrading}
        >
          {isUpgrading ? '升级中...' : '升级'}
        </button>
      </div>
    );
  }

  // 没 brew cask 但有 changelog → 也给 ℹ️ 按钮 (e.g. miniMaxCode 想知道修了啥)
  if (hasChangelog) {
    return (
      <div class="app-action-group">
        <button
          class={`btn-info-row${isChangelogOpen ? ' active' : ''}`}
          onClick={() => onShowChangelog && onShowChangelog()}
          title="查看更新说明"
          aria-label="查看更新说明"
        >
          ℹ️
        </button>
        {(() => {
          const meta = STATUS_MAP[status] || { text: status || '', cls: 'warning' };
          return <span class={`status-badge ${meta.cls}`}>{meta.text}</span>;
        })()}
      </div>
    );
  }

  // 其它 → status badge. Phase 15: error_message 当 title (hover tooltip) 让用户知道
  // 为啥 detector 失败. 比如 "timeout — https://api..." "HTTP 404" 等.
  const meta = STATUS_MAP[status] || { text: status || '', cls: 'warning' };
  const errorMsg = result.error_message;
  const title = errorMsg ? `${meta.text} · ${errorMsg}` : meta.text;
  return <span class={`status-badge ${meta.cls}`} title={title}>{meta.text}</span>;
}
