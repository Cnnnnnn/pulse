const MAX_COMMENTS = 20;
const TEXT_ELEMENT_TYPE = 0;

function _attr(tag, name) {
  const match = String(tag || "").match(
    new RegExp(`${name}=["']([^"']+)["']`, "i"),
  );
  return match ? match[1].trim() : "";
}

function extractCommentParams(html) {
  const match = String(html || "").match(
    /<div\b[^>]*\bid=["']post_comm["'][^>]*>/i,
  );
  if (!match) return { ok: false, reason: "comment_params_missing" };
  const sn = _attr(match[0], "data-id");
  const newsId = _attr(match[0], "data-nid");
  if (!sn) return { ok: false, reason: "comment_params_missing" };
  return { ok: true, sn, newsId };
}

function _plainCommentText(elements) {
  if (!Array.isArray(elements)) return "";
  return elements
    .filter((element) => element && element.type === TEXT_ELEMENT_TYPE)
    .map((element) => String(element.content || ""))
    .join("\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCommentResponse(raw) {
  let payload;
  try {
    payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, reason: "parse_failed" };
  }
  if (!payload?.success) return { ok: false, reason: "parse_failed" };
  // IT之家把高赞评论放在 content.hotComments；其余评论放在 content.comments。
  // 多数文章（特别是发布一段时间后）hotComments 为空，但 comments 里有内容。
  // 为避免 UI 一直 暂无热门评论，先读 hotComments，再 fallback 到 comments。
  const hotComments = payload.content?.hotComments;
  const allComments = payload.content?.comments;
  let source;
  if (Array.isArray(hotComments) && hotComments.length > 0) source = hotComments;
  else if (Array.isArray(allComments)) source = allComments;
  else if (Array.isArray(hotComments)) source = hotComments; // 显式空数组，UI 走 空态
  else return { ok: false, reason: "parse_failed" };
  const comments = [];
  for (const item of source) {
    if (!item || Number(item.parentCommentId || 0) !== 0) continue;
    const author = String(item.userInfo?.userNick || "").trim();
    const content = _plainCommentText(item.elements);
    if (!author || !content || item.id == null) continue;
    comments.push({
      id: String(item.id),
      author,
      content,
      createdAt: item.postTime || "",
      likes: Number.isFinite(Number(item.support)) ? Number(item.support) : 0,
    });
    if (comments.length >= MAX_COMMENTS) break;
  }
  return { ok: true, comments };
}

module.exports = {
  MAX_COMMENTS,
  extractCommentParams,
  parseCommentResponse,
};
