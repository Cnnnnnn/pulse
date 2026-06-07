/**
 * src/renderer/components/AppInfo.jsx
 *
 * App 名字 + 副标题 (source/note 派生) + Phase 27 mute badge.
 * + Phase 29 上次打开时间 sub-line (按 tier 颜色分类, Phase 30).
 */

import { getLocalTier } from '../store.js';

const SOURCE_LABELS = {
  'brew': 'Brew', 'sparkle': 'Sparkle', 'web(yml)': 'CDN',
  'web(api)': 'API', 'web(redirect)': 'Redirect',
  'web(github)': 'GitHub', 'web(brew)': 'Brew(API)', 'web(cursor)': 'CDN',
  'brew(online)': 'Brew(在线)', 'brew(local)': 'Brew(本地)',
  'app-update(generic)': '内置更新', 'app-update(github)': 'GitHub',
  'App Store': 'App Store',
  // 新 schema (snake_case) — Phase 2 接通 detector 后会出现
  'brew_formulae': 'Brew(API)',
  'brew_local_cask': 'Brew(本地)',
  'sparkle_appcast': 'Sparkle',
  'electron_yml': 'CDN',
  'app_store_lookup': 'App Store',
  'api_json': 'API',
  'redirect_filename': 'Redirect',
  'cursor_redirect': 'CDN',
  'qclaw_api': 'API',
  'app_update_yml': '内置更新',
};

function sourceLabel(s) {
  if (!s) return '';
  return SOURCE_LABELS[s] || s;
}

/**
 * Phase 12: 把 result.ts (ms epoch) 渲染成 "刚刚" / "X 分钟前" / "X 小时前" / "X 天前".
 * > 24h 加 class="stale" 让 UI 显示警告色.
 */
function relativeTime(ts) {
  if (!ts) return '';
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return '刚刚';
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return '刚刚';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

function isStale(ts) {
  if (!ts) return false;
  return (Date.now() - ts) > 24 * 60 * 60 * 1000;
}

/**
 * Phase 26: 把 changelog (markdown/HTML/纯文本) 截成一行 preview.
 *   - strip markdown 装饰字符 (#, *, -, 等) 和 HTML 标签
 *   - 截到 80 字符, 词边界优先
 *   - 末尾加 "…"
 */
function changelogPreview(raw) {
  if (!raw) return '';
  // 简单 HTML strip (我们只关心展示, 严格安全交给 ChangelogPanel)
  let s = raw.replace(/<[^>]+>/g, ' ');
  // 替换 markdown 列表符 / 装饰符 / 多余空白
  s = s.replace(/^[\s#*>\-•·]+/gm, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length <= 80) return s;
  // 截到 80 但尽量在词边界
  const cut = s.slice(0, 80);
  const lastSpace = cut.lastIndexOf(' ');
  const truncated = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return truncated.replace(/[,;:\s]+$/, '') + '…';
}

/**
 * Phase 27: mute badge 文案.
 * @param {number} untilMs  0 = 永远; >0 = 到期 epoch ms
 * @returns {string}
 */
function muteUntilLabel(untilMs) {
  if (!untilMs) return '永远';
  const d = new Date(untilMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppInfo({ result, muted = false, muteUntil = 0, lastOpened = null }) {
  const source = sourceLabel(result.source);
  const note = result.note || '';
  const ts = result.ts;
  const rel = relativeTime(ts);
  const stale = isStale(ts);
  const errMsg = result.error_message;

  let subtitle = source;
  if (note === 'installed_newer')   subtitle = `预发布${source ? ' · ' + source : ''}`;
  else if (note === 'incompatible') subtitle = `版本格式不同${source ? ' · ' + source : ''} · 请在应用内检查更新`;
  else if (note === 'version_unknown') subtitle = `已安装版本无法读取${source ? ' · ' + source : ''} · 最新版本见右侧`;

  // Phase 15: 错误原因副标题 (只在 warning/error 状态有意义)
  //    截断避免太长破坏布局; 完整内容 AppAction 的 title tooltip 里能看到
  if (errMsg && (result.status === 'no_auto_check' || result.status === 'error')) {
    const truncated = errMsg.length > 40 ? errMsg.slice(0, 40) + '…' : errMsg;
    subtitle = subtitle ? `${subtitle} · ${truncated}` : truncated;
  }

  // 副标题末尾附 "· X 分钟前" 时间戳; stale 单独给 class
  if (rel) {
    subtitle = subtitle ? `${subtitle} · ${rel}` : rel;
  }

  // Phase 26: changelog inline preview (点 ℹ️ 看完整 panel)
  const preview = changelogPreview(result.changelog);

  // Phase 29: last-opened sub-line. 三种态 + 按 tier 颜色区分 (Phase 30).
  //   - { ms, source: 'spotlight' } → "上次打开 · 2 天前" — hot/warm/cold
  //   - { ms, source: 'atime' }     → "上次打开 · 估算 · 5 天前"  (不靠谱)
  //   - { ms: null } 或 没数据        → "未使用"
  //   - 没 lastOpened 参数 (初次 render) → 不显示
  //
  // 颜色映射 (跟 mute menu tier 推荐一致, 一眼能看出冷热):
  //   - hot (≤7天)   : 默认 tertiary 浅色, 没"问题感"
  //   - warm (7-30天): 琥珀色, 提示"该用了"
  //   - cold (>30天) : 暗红, 提示"很久没碰"
  //   - unknown      : 灰斜体, 区分数据缺失
  let lastOpenedLine = null;
  if (lastOpened) {
    const tier = getLocalTier(lastOpened.ms);
    if (lastOpened.ms == null) {
      lastOpenedLine = <div class="app-last-opened tier-unknown">未使用</div>;
    } else if (lastOpened.source === 'atime') {
      lastOpenedLine = (
        <div
          class={`app-last-opened tier-${tier}`}
          title="atime 是 fallback, 不是真实启动时间"
        >
          上次打开 · 估算 · {relativeTime(lastOpened.ms)}
        </div>
      );
    } else {
      lastOpenedLine = (
        <div class={`app-last-opened tier-${tier}`}>
          上次打开 · {relativeTime(lastOpened.ms)}
        </div>
      );
    }
  }

  // Phase 27: mute badge. muted=true → 显示 "🔇 静音至 6/14" 或 "🔇 静音 (永远)"
  // muted=false → 不显示. 通过 .muted CSS class 让 AppInfo 整体灰显 (opacity).
  const muteBadge = muted ? (
    <span class="mute-badge" title={`已静音, 跳过通知 / bulk upgrade. 到期: ${muteUntil ? muteUntilLabel(muteUntil) : '永远'}`}>
      🔇 静音{muteUntil ? `至 ${muteUntilLabel(muteUntil)}` : ' (永远)'}
    </span>
  ) : null;

  return (
    <div class={`app-info${muted ? ' muted' : ''}`}>
      <div class="app-name-row">
        <span class="app-name">{result.name}</span>
        {muteBadge}
      </div>
      <div class={`app-subtitle${stale ? ' stale' : ''}${errMsg ? ' has-error' : ''}`}>{subtitle}</div>
      {preview && <div class="app-changelog-preview" title={result.changelog}>{preview}</div>}
      {lastOpenedLine}
    </div>
  );
}
