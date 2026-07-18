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
  const hotComments = payload?.success && payload.content?.hotComments;
  if (!Array.isArray(hotComments)) return { ok: false, reason: "parse_failed" };
  const comments = [];
  for (const item of hotComments) {
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
