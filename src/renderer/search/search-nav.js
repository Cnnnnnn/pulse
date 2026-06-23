/**
 * src/renderer/search/search-nav.js
 *
 * A3: 搜索结果跳转. 切面板 + 滚动 + 高亮 (复用 .search-highlight class).
 * 找不到目标元素时只切面板, console.warn.
 */
import { setNav } from '../worldcup/navStore.js';
import { closeSearch } from './searchStore.js';

const HIGHLIGHT_CLASS = 'search-highlight';
const HIGHLIGHT_DURATION_MS = 3000;

let highlightTimer = null;

function scrollAndHighlight(selector) {
  const el = document.querySelector(selector);
  if (!el) {
    console.warn(`[search-nav] target not found: ${selector}`);
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add(HIGHLIGHT_CLASS);
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    el.classList.remove(HIGHLIGHT_CLASS);
    highlightTimer = null;
  }, HIGHLIGHT_DURATION_MS);
}

function cssEscape(s) {
  if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(s);
  }
  return String(s).replace(/["\\]/g, '\\$&');
}

export function navigateToResult(result) {
  if (!result) return;
  const { source, nativeId, payload } = result;
  switch (source) {
    case 'news':
      setNav('ithome');
      scrollAndHighlight(`[data-article-id="${cssEscape(nativeId)}"]`);
      break;
    case 'ai-task':
      setNav('ai-tasks');
      scrollAndHighlight(`[data-task-key="${cssEscape(nativeId)}"]`);
      break;
    case 'reminder':
      setNav('reminders');
      scrollAndHighlight(`[data-reminder-id="${cssEscape(nativeId)}"]`);
      break;
    case 'fund':
      setNav('funds');
      scrollAndHighlight(`[data-fund-code="${cssEscape((payload && payload.code) || '')}"]`);
      break;
    case 'app':
      setNav('versions');
      scrollAndHighlight(`[data-name="${cssEscape(nativeId)}"]`); // AppRow 已有 data-name
      break;
    default:
      console.warn(`[search-nav] unknown source: ${source}`);
  }
  closeSearch();
}
