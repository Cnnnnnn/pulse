/**
 * src/renderer/components/AppAction.tsx
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
 * `installed_newer` (note) 显式 → "本机较新" / cls=info
 *   （自更新 app：本机领先公开安装包，hover 有说明）
 * `incompatible`   (note) 显式 → "需确认" / cls=warning
 */

import { StatusBadge } from './Badge.tsx';
import type { ResultLike } from './appTypes.ts';

const STATUS_MAP: Record<string, { text: string; cls: string }> = {
  update_available: { text: '有更新',   cls: 'update'  },
  up_to_date:       { text: '最新',     cls: 'latest'  },
  no_auto_check:    { text: '无法检测', cls: 'warning' },
  not_installed:    { text: '未安装',   cls: 'warning' },
  error:            { text: '出错',     cls: 'error'   },
};

export function AppAction({
  result,
  onUpgrade,
  isUpgrading,
}: {
  result: ResultLike;
  onUpgrade: (cask: string, appName: string) => void;
  isUpgrading?: boolean;
}) {
  const note = result.note || '';
  const status = result.status;

  // 特殊 note 显式覆盖
  if (note === 'installed_newer') {
    // 自更新 app（如 Marvis）：本机版本来自应用内更新通道，公开下载包可能滞后
    return (
      <StatusBadge
        status="info"
        title="本机版本领先公开安装包（多为应用内自更新）。公开渠道无更新时不必再升。"
      >
        本机较新
      </StatusBadge>
    );
  }
  if (note === 'incompatible') {
    return <StatusBadge status="warning">需确认</StatusBadge>;
  }

  // 有 brew cask 且需要升级 → 升级按钮 (主操作)
  if (result.has_update && result.brew_cask) {
    const cask = result.brew_cask;
    return (
      <button
        class="btn-upgrade-row"
        onClick={() => onUpgrade(cask, result.name)}
        disabled={isUpgrading}
        aria-label={`升级 ${result.name}`}
      >
        {isUpgrading ? '升级中...' : '升级'}
      </button>
    );
  }

  // 其它 → status badge. Phase 15: error_message 当 title (hover tooltip) 让用户知道
  // 为啥 detector 失败. 比如 "timeout — https://api..." "HTTP 404" 等.
  const meta = (status && STATUS_MAP[status]) || { text: status || '', cls: 'warning' };
  const errorMsg = result.error_message;
  const title = errorMsg ? `${meta.text} · ${errorMsg}` : meta.text;
  return <StatusBadge status={meta.cls} title={title}>{meta.text}</StatusBadge>;
}
