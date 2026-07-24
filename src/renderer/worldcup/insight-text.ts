/**
 * src/renderer/worldcup/insight-text.js
 *
 * 展示层清理 AI 正文（兼容旧缓存里的思考链）
 */

const THINK_OPEN = "<" + "think" + ">";
const THINK_CLOSE = "<" + "/" + "think" + ">";

function thinkBlockRe() {
  const esc = THINK_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(THINK_OPEN + "[\\s\\S]*?" + esc, "gi");
}

function thinkOpenRe() {
  const esc = THINK_OPEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + esc + "[\\s\\S]*", "i");
}

export function formatInsightText(raw) {
  if (!raw || typeof raw !== "string") return "";
  let text = raw.trim();
  text = text.replace(thinkBlockRe(), "");
  text = text.replace(thinkOpenRe(), "");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}
