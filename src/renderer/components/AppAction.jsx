/**
 * src/renderer/components/AppAction.jsx
 *
 * 行内操作: 有 brew_cask → "升级" 按钮; 否则 → status badge.
 * Phase 30+1: ⓘ info 按钮从 AppAction 移到 AppInfo (跟 app name 同行),
 * 这里不再渲染. AppAction 只负责主操作 (升级 / 状态 badge).
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

import { StatusBadge } from './Badge.jsx';

const STATUS_MAP = {
  update_available: { text: '有更新',   cls: 'update'  },
  up_to_date:       { text: '最新',     cls: 'latest'  },
  no_auto_check:    { text: '无法检测', cls: 'warning' },
  not_installed:    { text: '未安装',   cls: 'warning' },
  error:            { text: '出错',     cls: 'error'   },
};

export function AppAction({ result, onUpgrade, isUpgrading }) {
  const note = result.note || '';
  const status = result.status;

  // 特殊 note 显式覆盖
  if (note === 'installed_newer') {
    return <StatusBadge status="info">预发布</StatusBadge>;
  }
  if (note === 'incompatible') {
    return <StatusBadge status="warning">需确认</StatusBadge>;
  }

  // 有 brew cask 且需要升级 → 升级按钮 (主操作)
  if (result.has_update && result.brew_cask) {
    return (
      <button
        class="btn-upgrade-row"
        onClick={() => onUpgrade(result.brew_cask, result.name)}
        disabled={isUpgrading}
        aria-label={`升级 ${result.name}`}
      >
        {isUpgrading ? '升级中...' : '升级'}
      </button>
    );
  }

  // 其它 → status badge. Phase 15: error_message 当 title (hover tooltip) 让用户知道
  // 为啥 detector 失败. 比如 "timeout — https://api..." "HTTP 404" 等.
  const meta = STATUS_MAP[status] || { text: status || '', cls: 'warning' };
  const errorMsg = result.error_message;
  const title = errorMsg ? `${meta.text} · ${errorMsg}` : meta.text;
  return <StatusBadge status={meta.cls} title={title}>{meta.text}</StatusBadge>;
}
