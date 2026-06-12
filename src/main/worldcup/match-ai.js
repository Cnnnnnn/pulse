/**
 * src/main/worldcup/match-ai.js
 *
 * 世界杯场次 AI: 赛前预测 / 赛后总结 (共用 Pulse AI 配置)
 */

const { chatCompletion } = require("../../ai/shared-llm");
const { sanitizeLlmOutput } = require("../../ai/sanitize-llm-output");
const stateStore = require("../state-store");
const { matchKey } = require("./match-key");
const { mainLog } = require("../log");

function _formatScorers(scorers, team1, team2) {
  if (!Array.isArray(scorers) || scorers.length === 0) return "暂无进球记录";
  return scorers
    .map((s) => {
      const team = s.teamSide === "team1" ? team1 : team2;
      const tags = [];
      if (s.ownGoal) tags.push("乌龙");
      if (s.penalty) tags.push("点球");
      const tag = tags.length ? ` (${tags.join("·")})` : "";
      return `${s.minute || "?"} ${team} — ${s.player}${tag}`;
    })
    .join("\n");
}

const OUTPUT_RULES = [
  "【硬性要求】",
  "1. 全文必须使用简体中文，禁止英文段落。",
  "2. 只输出给用户看的正文，禁止输出思考过程、分析步骤、XML/HTML 标签。",
  "3. 禁止输出思考过程或任何 XML 标签，只写正文。",
  "4. 直接开始写正文，不要前言或元说明。",
].join("\n");

function buildPreMatchPrompt(match) {
  const { team1, team2, stage, venue, date, time, timezone } = match;
  return [
    {
      role: "system",
      content: [
        "你是资深足球分析师。用简体中文写赛前预测，语气专业但易懂，200–350 字。",
        "分三段：对阵看点、关键球员/战术、预测比分与理由。不要编造具体伤病除非用户数据里有。",
        OUTPUT_RULES,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "请为以下世界杯比赛写赛前预测：",
        `对阵：${team1} vs ${team2}`,
        `阶段：${stage || "未知"}`,
        `时间：${date || ""} ${time || ""} (${timezone || "本地"})`,
        `场地：${venue || "待定"}`,
      ].join("\n"),
    },
  ];
}

function buildPostMatchPrompt(match, scoreEntry) {
  const { team1, team2, stage, venue, date } = match;
  const ft = scoreEntry && scoreEntry.ft ? scoreEntry.ft : [0, 0];
  const scorers = _formatScorers(
    scoreEntry && scoreEntry.scorers,
    team1,
    team2,
  );
  return [
    {
      role: "system",
      content: [
        "你是资深足球评论员。用简体中文写赛后总结，250–400 字。",
        "包含：比赛进程、进球/关键瞬间解读、双方表现评价、出线或晋级影响（如适用）。",
        "基于给定比分与进球者，不要编造未提供的进球。",
        OUTPUT_RULES,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "请为以下已结束的世界杯比赛写赛后总结：",
        `对阵：${team1} vs ${team2}`,
        `阶段：${stage || "未知"}`,
        `日期：${date || ""}`,
        `场地：${venue || ""}`,
        `终场比分：${ft[0]} - ${ft[1]}`,
        "进球记录：",
        scorers,
      ].join("\n"),
    },
  ];
}

function _insightHash(match, type, scoreEntry) {
  if (type === "pre") {
    return `${match.date}|${match.team1}|${match.team2}|pre`;
  }
  const ft = scoreEntry && scoreEntry.ft ? scoreEntry.ft.join("-") : "0-0";
  const sc = ((scoreEntry && scoreEntry.scorers) || [])
    .map((s) => `${s.minute}:${s.player}`)
    .join(",");
  return `${match.date}|${match.team1}|${match.team2}|post|${ft}|${sc}`;
}

/**
 * @param {{ match: object, type: 'pre'|'post', scoreEntry?: object, force?: boolean }} opts
 */
async function generateMatchInsight(opts) {
  const match = opts && opts.match;
  const type = opts && opts.type;
  if (!match || (type !== "pre" && type !== "post")) {
    return { ok: false, reason: "invalid_args" };
  }

  const key = matchKey(match);
  const cache = stateStore.loadWorldcupMatchInsights() || { entries: {} };
  const existing = cache.entries[key] || {};
  const scoreEntry =
    opts.scoreEntry ||
    (stateStore.loadWorldcupScores()?.entries || {})[key] ||
    null;

  if (type === "post" && (!scoreEntry || scoreEntry.status !== "final")) {
    return { ok: false, reason: "match_not_final" };
  }

  const contentHash = _insightHash(match, type, scoreEntry);
  const cached = existing[type];
  if (
    !opts.force &&
    cached &&
    cached.contentHash === contentHash &&
    cached.text
  ) {
    return {
      ok: true,
      text: sanitizeLlmOutput(cached.text),
      cached: true,
      matchKey: key,
      type,
    };
  }

  const messages =
    type === "pre"
      ? buildPreMatchPrompt(match)
      : buildPostMatchPrompt(match, scoreEntry);

  const llm = await chatCompletion(messages);
  if (!llm.ok) {
    mainLog.warn("[worldcup/match-ai] llm failed", {
      type,
      key,
      reason: llm.reason,
    });
    return { ok: false, reason: llm.reason || "llm_failed", error: llm.error };
  }

  const cleanText = sanitizeLlmOutput(llm.text);
  const entry = {
    text: cleanText,
    contentHash,
    generatedAt: Date.now(),
    provider: "shared",
  };
  const nextEntries = {
    ...cache.entries,
    [key]: { ...existing, [type]: entry },
  };
  stateStore.saveWorldcupMatchInsights({
    entries: nextEntries,
    ts: Date.now(),
  });

  return { ok: true, text: cleanText, cached: false, matchKey: key, type };
}

module.exports = {
  buildPreMatchPrompt,
  buildPostMatchPrompt,
  generateMatchInsight,
};
