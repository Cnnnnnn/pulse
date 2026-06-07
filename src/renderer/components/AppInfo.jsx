/**
 * src/renderer/components/AppInfo.jsx
 *
 * App 名字 + 副标题 (source/note 派生)
 */

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

export function AppInfo({ result }) {
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

  return (
    <div class="app-info">
      <div class="app-name">{result.name}</div>
      <div class={`app-subtitle${stale ? ' stale' : ''}${errMsg ? ' has-error' : ''}`}>{subtitle}</div>
    </div>
  );
}
