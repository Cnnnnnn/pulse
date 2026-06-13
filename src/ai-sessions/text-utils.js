/**
 * src/ai-sessions/text-utils.js
 *
 * cursor / codex / engine 共用的 session title 去噪与抽取.
 */

const GENERIC_QUERY_RE =
  /^(可以|好的|好|ok|okay|yes|no|嗯|啊|哦|行|对|是|不是|继续|接着|然后|下一步|next|continue|go|ok,|好的,|好,|行,)$/i;

/** 跳 markdown / tag / 路径 / URL, 提取 clean 行. */
function stripNoiseLine(line) {
  if (/^#/.test(line)) return null;
  if (/^<[^>]+>$/.test(line)) return null;
  if (/^<[a-z_]+>/i.test(line)) return null;
  if (/^\/Users\//.test(line)) return null;
  if (/^https?:\/\//i.test(line)) return null;
  if (/\/Users\/[^\s]+/.test(line)) return null;
  if (/https?:\/\/\S+/.test(line)) return null;
  return line.replace(/\s+/g, " ");
}

function looksLikePromptNoise(text) {
  const line = String(text || "").trim();
  if (!line) return true;
  if (/^#/.test(line)) return true;
  if (/^<[^>]+>$/.test(line)) return true;
  if (/^You are /i.test(line)) return true;
  if (/AGENTS\.md/i.test(line)) return true;
  if (/instructions?\s+for/i.test(line)) return true;
  if (/^\/Users\//.test(line)) return true;
  if (/^https?:\/\//i.test(line)) return true;
  if (/^\[[^\]]+\]\(.+\)$/.test(line)) return true;
  if (line.split("/").length >= 4) return true;
  return false;
}

function isInformativeLine(line) {
  if (!line || typeof line !== "string") return false;
  const t = line.trim();
  if (t.length < 8) return false;
  if (GENERIC_QUERY_RE.test(t)) return false;
  if (!/[一-龥a-zA-Z]/.test(t)) return false;
  return true;
}

/**
 * @param {string} text
 * @param {number} [maxLen]  有值时截断 (cursor title 用 60)
 */
function firstMeaningfulLine(text, maxLen) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const clean = stripNoiseLine(line);
    if (!clean) continue;
    if (typeof maxLen === "number" && maxLen > 0) {
      return clean.slice(0, maxLen);
    }
    return clean;
  }
  return null;
}

function firstInformativeLine(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const clean = stripNoiseLine(line);
    if (!clean) continue;
    if (isInformativeLine(clean)) return clean;
  }
  return null;
}

function trimTitle(s, maxLen = 48) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

module.exports = {
  GENERIC_QUERY_RE,
  stripNoiseLine,
  looksLikePromptNoise,
  isInformativeLine,
  firstMeaningfulLine,
  firstInformativeLine,
  trimTitle,
};
