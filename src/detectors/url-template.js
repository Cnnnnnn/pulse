/**
 * src/detectors/url-template.js
 *
 * URL 模板展开 — 兼容 config.json 里写的 `{arch}` / `{arch_short}` 占位符。
 * 这些占位符在旧 checker.js 里用 expandTemplateUrl 替换, 迁移到新 detector
 * 时漏了 — 导致 api_json (WorkBuddy) / cursor_redirect (Cursor) 用了未替换的
 * URL, server 返回 400/403。
 *
 * 使用:  expandUrl('https://x/v2/update?platform=workbuddy-darwin-{arch}', 'arm64')
 *          → 'https://x/v2/update?platform=workbuddy-darwin-arm64'
 *
 * 兼容占位符:
 *   {arch}         → arm64 / x64
 *   {arch_short}   → arm64 / x64 (跟 {arch} 等价, 旧 schema 兼容)
 *   {version}      → 不动 (留个接口, 实际不展开, 避免误改)
 */

function expandUrl(rawUrl, arch) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  if (!arch) return rawUrl;
  return rawUrl
    .replace(/\{arch\}/g, arch)
    .replace(/\{arch_short\}/g, arch);
}

module.exports = { expandUrl };
