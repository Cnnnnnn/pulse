/**
 * src/main/worldcup/match-ai.ts
 *
 * 世界杯场次 AI: 赛前预测 / 赛后总结 (共用 Pulse AI 配置)
 */
"use strict";

const { chatCompletion } = require("../../ai/shared-llm");
const { resolvePrompt } = require("../../ai/prompt-registry");
const { sanitizeLlmOutput } = require("../../ai/sanitize-llm-output");
const stateStore = require("../state-store.ts");
const { matchKey } = require("./match-key.ts");
const { mainLog } = require("../log.ts");

function _formatScorers(scorers: any, team1: any, team2: any): string {
  if (!Array.isArray(scorers) || scorers.length === 0) return "暂无进球记录";
  return scorers
    .map((s) => {
      const team = s.teamSide === "team1" ? team1 : team2;
      const tags: string[] = [];
      if (s.ownGoal) tags.push("乌龙");
      if (s.penalty) tags.push("点球");
      const tag = tags.length ? ` (${tags.join("·")})` : "";
      return `${s.minute || "?"} ${team} — ${s.player}${tag}`;
    })
    .join("\n");
}

export function buildPreMatchPrompt(match: any): any[] {
  const { team1, team2, stage, venue, date, time, timezone } = match;
  const prompt = resolvePrompt("worldcup_prematch");
  return [
    {
      role: "system",
      content: `${prompt.system}\n${prompt.rules}`,
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

export function buildPostMatchPrompt(match: any, scoreEntry: any): any[] {
  const { team1, team2, stage, venue, date } = match;
  const ft = scoreEntry && scoreEntry.ft ? scoreEntry.ft : [0, 0];
  const scorers = _formatScorers(
    scoreEntry && scoreEntry.scorers,
    team1,
    team2,
  );
  const prompt = resolvePrompt("worldcup_postmatch");
  return [
    {
      role: "system",
      content: `${prompt.system}\n${prompt.rules}`,
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

function _insightHash(match: any, type: any, scoreEntry: any): string {
  if (type === "pre") {
    return `${match.date}|${match.team1}|${match.team2}|pre`;
  }
  const ft = scoreEntry && scoreEntry.ft ? scoreEntry.ft.join("-") : "0-0";
  const sc = ((scoreEntry && scoreEntry.scorers) || [])
    .map((s: any) => `${s.minute}:${s.player}`)
    .join(",");
  return `${match.date}|${match.team1}|${match.team2}|post|${ft}|${sc}`;
}

export async function generateMatchInsight(opts: any): Promise<any> {
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