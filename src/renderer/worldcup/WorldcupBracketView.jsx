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
import { IconAlert, IconRefresh, IconLoader } from "../components/icons.jsx";

function formatRelativeTime(ts) {
  if (!ts) return "从未计算";
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return new Date(ts).toLocaleString("zh-CN");
}

// ponytail: v2.61 — 过滤掉 informational warnings.
// bracket_partial / annexC_* / simplified_* 是预期状态提示, 不应该当警告.
// 真正的警告只有 finals_fetch_* (网络拉取失败) 和 group_*_incomplete (小组赛数据缺失).
function isRealWarning(w, snapshot) {
  if (w.startsWith("finals_fetch_")) return true;
  // ponytail: group_X_incomplete 只有当 snapshot.projected=true (R32 没踢) 时才有 — 这时是预期.
  // 等 R32 踢完, projected=false, 此时若有 group_X_incomplete 才是真警告.
  if (w.startsWith("group_") && w.endsWith("_incomplete") && snapshot.projected === false) return true;
  return false;
}

export function WorldcupBracketView() {
  const snapshot = worldcupBracket.value;
  const computing = bracketComputing.value;
  const error = bracketError.value;
  const lastComputedAt = bracketLastComputedAt.value;
  const [squadMatch, setSquadMatch] = useState(null);
  // ponytail: v2.56 stage tab — 默认 R32 (最丰富阶段), 用户点 tab 切换.
  const [currentStage, setCurrentStage] = useState("r32");

  const STAGE_TABS = [
    { id: "r32", label: "1/16" },
    { id: "r16", label: "1/8" },
    { id: "qf", label: "1/4" },
    { id: "sf", label: "半决赛" },
    { id: "final", label: "决赛" },
    { id: "overview", label: "全景" },  // ponytail: v2.62 — 一屏看 5 个 stage 的小卡全景
  ];

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
          <div class="bracket-error-icon"><IconAlert size={24} /></div>
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
          {computing ? <><IconLoader size={14} /> 计算中...</> : <><IconRefresh size={14} /> 尝试计算</>}
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
          {computing ? <><IconLoader size={14} /> 计算中...</> : <><IconRefresh size={14} /> 重新计算</>}
        </button>
        <div class="bracket-meta">
          <span>上次计算: {formatRelativeTime(lastComputedAt)}</span>
          <span> · {projectedBanner}</span>
          {snapshot.warnings && snapshot.warnings.filter((w) => isRealWarning(w, snapshot)).length > 0 && (
            <span class="bracket-warnings"> · <IconAlert size={12} /> {snapshot.warnings.filter((w) => isRealWarning(w, snapshot)).length} 个警告</span>
          )}
        </div>
      </div>
      {/* ponytail: v2.56 stage tab 切换 — 参考小红书 2026 世界杯 UI */}
      <div class="bracket-stage-tabs" role="tablist">
        {STAGE_TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={currentStage === tab.id}
            class={`bracket-stage-tab ${currentStage === tab.id ? "bracket-stage-tab--active" : ""}`}
            onClick={() => setCurrentStage(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {noGroupData ? (
        <div class="bracket-view bracket-view--empty">
          <p class="bracket-empty-msg">小组赛尚未开始，待 6/11 揭幕战后再计算淘汰赛对阵</p>
        </div>
      ) : (
        <BracketTree snapshot={snapshot} onMatchClick={handleMatchClick} currentStage={currentStage} />
      )}
    </div>
  );
}

export default WorldcupBracketView;
