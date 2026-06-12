/**
 * src/renderer/worldcup/useMatchAi.js
 *
 * 赛前预测 / 赛后总结 — MatchCard 与 SquadModal 共用
 */

import { useState } from "preact/hooks";
import { matchKey, isMatchUpcoming } from "./match-utils.js";
import { worldcupMatchInsights, generateWorldcupInsight } from "./store.js";
import { refreshAIReadyStatus } from "../store.js";

function insightFor(match, type) {
  const key = matchKey(match);
  const entry = worldcupMatchInsights.value[key];
  return entry && entry[type] ? entry[type] : null;
}

function mapAiError(reason) {
  if (
    reason === "api_key_missing" ||
    reason === "config_missing" ||
    reason === "model_missing"
  ) {
    return "请先在侧栏「AI 配置」中保存 Provider、模型和 API Key";
  }
  if (reason === "match_not_final") {
    return "比赛尚未结束，暂无法生成赛后总结";
  }
  return reason || "生成失败";
}

export function useMatchAi(match, score) {
  const [busyType, setBusyType] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  if (!match || match._isTeam) {
    return { visible: false };
  }

  const isUpcoming = isMatchUpcoming({ ...match, score });
  const isFinal = score && score.status === "final";
  const visible = isUpcoming || isFinal;
  const pre = insightFor(match, "pre");
  const post = insightFor(match, "post");
  const activeType = isFinal ? "post" : isUpcoming ? "pre" : null;
  const activeInsight = activeType === "post" ? post : pre;

  async function handleGenerate(type, force = false) {
    const ready = await refreshAIReadyStatus();
    if (!ready) {
      setError("请先在侧栏「AI 配置」中保存 Provider、模型和 API Key");
      return;
    }
    setError(null);
    setBusyType(type);
    try {
      const r = await generateWorldcupInsight(match, type, {
        force,
        scoreEntry: score,
      });
      if (!r || !r.ok) {
        setError(mapAiError(r && r.reason));
      } else {
        setExpanded(true);
      }
    } finally {
      setBusyType(null);
    }
  }

  return {
    visible,
    isUpcoming,
    isFinal,
    pre,
    post,
    activeType,
    activeInsight,
    busyType,
    error,
    expanded,
    setExpanded,
    handleGenerate,
  };
}
