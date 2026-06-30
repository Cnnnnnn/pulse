/**
 * src/renderer/changelog.js
 *
 * Phase 14: changelog 渲染 (renderer 侧).
 *
 * 安全注意:
 *   - md 源: 走 marked → DOMPurify.sanitize (防 XSS, 防 image onerror 等)
 *   - html 源: 直接走 DOMPurify.sanitize, 不再过 marked
 *   - 没有 changelog: 返回空串 + 一个 hint
 *
 * 不在浏览器做 DOM 截取 (happy-dom/headless 测试时 DOMParser 行为不可靠,
 * 而且 release notes 截取 5 条靠 CSS max-height + overflow-y: auto 也够).
 * 完整版用 changelogUrl 跳过去看.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * 把 markdown 或 html 渲染成安全的 HTML 字符串.
 * @param {string} src
 * @param {'md'|'html'} [format='md']
 * @param {string} [changelogUrl]  完整 release notes 链接, 渲染在末尾
 * @returns {string} sanitized HTML
 */
export function renderChangelog(src, format = 'md', changelogUrl = '') {
  if (!src) return '';

  let rawHtml;
  if (format === 'html') {
    rawHtml = src;
  } else {
    // md → html
    marked.setOptions({ gfm: true, breaks: true });
    rawHtml = marked.parse(src);
  }

  // XSS 防护: 任何源都过 DOMPurify
  let safe = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','ul','ol','li','strong','em','code','pre','blockquote','a','br','hr','del','img'],
    ALLOWED_ATTR: ['href', 'title', 'src', 'alt'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
  });

  // 纵深防御: happy-dom 20 的 DOMParser 对 <script> 解析行为与真实浏览器
  // 不一致, 导致 DOMPurify 在测试环境无法剥掉 <script>. 生产环境 (Electron
  // Chromium) DOMPurify 本就能处理, 这里加一道正则兜底作为第二防护层,
  // 也让测试在 happy-dom 下能验证 XSS 防护意图. 不处理 <style>/<iframe>:
  // 它们本就不在 ALLOWED_TAGS 里, 且 DOMPurify 在 happy-dom 下对它们工作正常.
  safe = safe.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi, '');

  // 末尾追加完整 changelog 链接
  if (changelogUrl && /^https?:\/\//.test(changelogUrl)) {
    safe += `<p class="changelog-full-link"><a href="${changelogUrl}" target="_blank" rel="noopener">查看完整 release notes</a></p>`;
  }

  return safe;
}
