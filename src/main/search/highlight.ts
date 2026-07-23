/**
 * src/main/search/highlight.ts
 *
 * A3: 从 searchText 里定位首个命中 queryToken, 前后各取 radius 字符,
 * 命中 token 包 <mark>, 被截断处加 "...".
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param searchText
 * @param queryTokens  已 tokenize 过的 tokens
 * @param opts
 * @returns  含 <mark> 的 HTML 片段
 */
export function makeSnippet(
  searchText: unknown,
  queryTokens: string[],
  opts: { radius?: number } = {},
): string {
  const radius = typeof opts.radius === "number" ? opts.radius : 30;
  if (typeof searchText !== "string" || searchText.length === 0) return "";
  if (!Array.isArray(queryTokens) || queryTokens.length === 0) {
    // 无 query token: 返开头截断
    return escapeHtml(searchText.slice(0, radius * 2));
  }

  // 找最早出现的 queryToken 位置
  let hitPos = -1;
  for (const tok of queryTokens) {
    if (!tok) continue;
    const idx = searchText.indexOf(tok);
    if (idx !== -1 && (hitPos === -1 || idx < hitPos)) {
      hitPos = idx;
    }
  }

  if (hitPos === -1) {
    return escapeHtml(searchText.slice(0, radius * 2));
  }

  const start = Math.max(0, hitPos - radius);
  const end = Math.min(searchText.length, hitPos + radius);
  const raw = searchText.slice(start, end);

  // 先 escape 整段, 再对 escape 后的文本做 token 包裹 (token 是纯文本无特殊字符)
  let html = escapeHtml(raw);
  for (const tok of queryTokens) {
    if (!tok) continue;
    const escapedTok = escapeHtml(tok);
    html = html.split(escapedTok).join(`<mark>${escapedTok}</mark>`);
  }

  const prefix = start > 0 ? "..." : "";
  const suffix = end < searchText.length ? "..." : "";
  return prefix + html + suffix;
}

module.exports = { makeSnippet };