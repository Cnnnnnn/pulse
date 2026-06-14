/**
 * src/renderer/worldcup/WorldcupBracketView.jsx
 *
 * v2 淘汰赛对阵 - 容器 (toolbar / 空态 / 错误态) + BracketTree 渲染
 *
 * 视觉逻辑: 桌面水平 bracket tree (R32 → Final) + SVG 连线
 * 窗口 < 900px 时: 自动回退到垂直堆叠 (BracketTreeFallback 内部处理)
 */

import { useState, useEffect } from "preact/hooks";
import BracketTree from "./BracketTree.jsx";
import SquadModal from "./SquadModal.jsx";
import {
  worldcupBracket,
  bracketComputing,
  bracketError,
  bracketLastComputedAt,
  loadBracket,
  computeBracket,
  clearBracketError,
} from "./bracketStore.js";
import { trackWorldcupMatchView } from "../recent/track.js";

function formatRelativeTime(ts) {
  if (!ts) return "从未计算";
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return new Date(ts).toLocaleString("zh-CN");
}

export function WorldcupBracketView() {
  const snapshot = worldcupBracket.value;
  const computing = bracketComputing.value;
  const error = bracketError.value;
  const lastComputedAt = bracketLastComputedAt.value;
  const [squadMatch, setSquadMatch] = useState(null);

  useEffect(() => {
    // 进入 tab: 先同步拉 cache 让用户立刻看到上次结果,
    // 然后后台触发 compute 拿到最新 (30s 节流避免 tab 切换重复算).
    loadBracket();
    computeBracket();
  }, []);

  function handleMatchClick(match) {
    trackWorldcupMatchView(match);
    setSquadMatch({
      team1: match.slot1?.team?.name || match.slot1?.source || "未定",
      team2: match.slot2?.team?.name || match.slot2?.source || "未定",
      stage: `Match ${match.matchNum}`,
      venue: "FIFA 2026",
      time: "",
      timezone: "",
      date: "",
      _isBracket: true,
    });
  }

  function handleRefresh() {
    clearBracketError();
    computeBracket({ force: true });
  }

  // 错误态
  if (error) {
    return (
      <div class="bracket-view bracket-view--error">
        <div class="bracket-error-card">
          <div class="bracket-error-icon">⚠️</div>
          <div class="bracket-error-msg">计算失败: {error}</div>
          <button class="btn btn-primary btn-sm" onClick={handleRefresh}>
            重试
          </button>
        </div>
      </div>
    );
  }

  // 空态: snapshot 完全不存在
  if (!snapshot) {
    return (
      <div class="bracket-view bracket-view--empty">
        <p class="bracket-empty-msg">小组赛尚未开始，待小组赛结束后计算淘汰赛对阵</p>
        <button
          class="btn btn-primary btn-sm"
          onClick={handleRefresh}
          disabled={computing}
        >
          {computing ? "计算中..." : "🔄 尝试计算"}
        </button>
      </div>
    );
  }

  // 空态: 有 snapshot 但没有 third-placed 数据 (完全无组赛结果)
  const advancingCount = snapshot.thirdPlacedAdvancing ? snapshot.thirdPlacedAdvancing.length : 0;
  const noGroupData = advancingCount === 0;
  const projectedBanner = snapshot.projected
    ? `基于 ${advancingCount} 个晋级第3名 · 待小组赛完赛`
    : "小组赛已完赛";

  return (
    <div class="bracket-view">
      {squadMatch && <SquadModal match={squadMatch} onClose={() => setSquadMatch(null)} />}
      <div class="bracket-toolbar">
        <button
          class="btn btn-primary btn-sm"
          onClick={handleRefresh}
          disabled={computing}
        >
          {computing ? "⟳ 计算中..." : "🔄 重新计算"}
        </button>
        <div class="bracket-meta">
          <span>上次计算: {formatRelativeTime(lastComputedAt)}</span>
          <span> · {projectedBanner}</span>
          {snapshot.warnings && snapshot.warnings.length > 0 && (
            <span class="bracket-warnings"> · ⚠️ {snapshot.warnings.length} 个警告</span>
          )}
        </div>
      </div>
      {noGroupData ? (
        <div class="bracket-view bracket-view--empty">
          <p class="bracket-empty-msg">小组赛尚未开始，待 6/11 揭幕战后再计算淘汰赛对阵</p>
        </div>
      ) : (
        <BracketTree snapshot={snapshot} onMatchClick={handleMatchClick} />
      )}
    </div>
  );
}

export default WorldcupBracketView;
