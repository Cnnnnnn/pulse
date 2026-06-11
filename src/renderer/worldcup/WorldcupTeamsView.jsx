/**
 * src/renderer/worldcup/WorldcupTeamsView.jsx
 *
 * v2.9.1 stub — 球队 tab
 *
 * v2.9.2 才实装 (50 队列表 + 搜索过滤 + 点 进 队详情).
 * 现在仅 placeholder, 防 WorldcupLayout 报 import 错.
 */

export function WorldcupTeamsView({ search }) {
  return (
    <div class="worldcup-teams-view worldcup-empty">
      <p>球队列表 (v2.9.2 实装, 50 队 × 1 真实人 + 25 占位)</p>
      <p class="worldcup-meta">当前搜索: "{search || '空'}"</p>
    </div>
  );
}

export default WorldcupTeamsView;
