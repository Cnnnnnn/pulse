/**
 * src/main/ithome/article-page-parser.js
 *
 * 解析 IT之家文章详情页 (https://www.ithome.com/0/.../*.htm)
 * 输出结构化正文，去除装饰/广告/投稿噪音。
 */

const PARAGRAPH_OPEN_RE = /<div\b[^>]*\bid=["']paragraph["'][^>]*>/i;
const REMOVE_BLOCK_PATTERNS = [
  "<div[^>]*class=[\"'][^\"']*\\btougao-user\\b[^\"']*[\"'][^>]*>[\\s\\S]*?<\\/div>",
  "<p[^>]*class=[\"'][^\"']*\\bad-tips\\b[^\"']*[\"'][^>]*>[\\s\\S]*?<\\/p>",
];
const MIN_BODY_CHARS = 80;
const MAX_BODY_CHARS = 12000;

function _stripBlocks(html) {
  let out = html;
  for (const p of REMOVE_BLOCK_PATTERNS) {
    out = out.replace(new RegExp(p, "gi"), " ");
  }
  return out;
}

function _extractParagraphBlock(html) {
  if (!html) return "";
  const m = PARAGRAPH_OPEN_RE.exec(html);
  if (!m) return "";
  const start = m.index + m[0].length;
  // 非贪婪在嵌套 div 处会过早闭合；用 lastIndexOf 拿最深 </div>
  const close = html.lastIndexOf("</div>");
  if (close < start) return "";
  return html.slice(start, close);
}

function _normalizeWhitespace(s) {
  return String(s || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function _blockToText(blockHtml) {
  let s = String(blockHtml || "");
  s = s.replace(
    /<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<noscript\b[\s\S]*?<\/noscript>|<iframe\b[\s\S]*?<\/iframe>|<svg\b[\s\S]*?<\/svg>|<img\b[^>]*>/gi,
    " ",
  );
  s = s.replace(/<br\s*\/?>(?!\n)/gi, "\n");
  s = s.replace(
    /<\/?(p|div|li|blockquote|h[1-6]|tr|td|th|section|article)\b[^>]*>/gi,
    "\n",
  );
  s = s.replace(/<[^>]+>/g, " ");
  return _normalizeWhitespace(s);
}

/**
 * @param {string} html
 * @returns {{ ok: boolean, reason?: string, body: string, wordCount: number }}
 */
function parseIthomeArticlePage(html) {
  if (!html || typeof html !== "string") {
    return { ok: false, reason: "paragraph_missing", body: "", wordCount: 0 };
  }
  const block = _extractParagraphBlock(html);
  if (!block) {
    return { ok: false, reason: "paragraph_missing", body: "", wordCount: 0 };
  }
  const cleaned = _stripBlocks(block);
  const text = _blockToText(cleaned);
  if (text.length < MIN_BODY_CHARS) {
    return {
      ok: false,
      reason: "paragraph_too_short",
      body: "",
      wordCount: 0,
    };
  }
  const body =
    text.length > MAX_BODY_CHARS ? text.slice(0, MAX_BODY_CHARS) : text;
  return { ok: true, body, wordCount: body.length };
}

function hasArticleContent(parsed) {
  return !!(parsed && parsed.ok && parsed.body && parsed.body.length > 0);
}

module.exports = {
  parseIthomeArticlePage,
  hasArticleContent,
  MIN_BODY_CHARS,
  MAX_BODY_CHARS,
};
