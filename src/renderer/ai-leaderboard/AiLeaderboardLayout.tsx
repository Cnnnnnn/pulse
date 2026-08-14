/**
 * src/renderer/ai-leaderboard/AiLeaderboardLayout.tsx — AI 榜单顶级 nav panel 容器。
 * 进入时载入偏好 + 拉一次数据（按当前筛选条件）；后续切换由 store 内部触发。
 * 进入时完成一次偏好与数据初始化。
 */
import { useEffect } from "preact/hooks";
import { loadPrefs, loadLeaderboard } from "./aiLeaderboardStore.ts";
import { AiLeaderboardPage } from "./AiLeaderboardPage.tsx";
import "./ai-leaderboard.css";

export function AiLeaderboardLayout() {
  useEffect(() => {
    loadPrefs();
    loadLeaderboard();
  }, []);

  return (
    <div class="ai-leaderboard-layout">
      <AiLeaderboardPage />
    </div>
  );
}

export default AiLeaderboardLayout;
