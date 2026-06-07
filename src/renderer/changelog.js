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

  // 末尾追加 "Full notes ↗" 链接
  if (changelogUrl && /^https?:\/\//.test(changelogUrl)) {
    safe += `<p class="changelog-full-link"><a href="${changelogUrl}" target="_blank" rel="noopener">Full notes ↗</a></p>`;
  }

  return safe;
}
