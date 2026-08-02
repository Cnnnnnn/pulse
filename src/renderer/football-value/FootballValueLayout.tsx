/**
 * src/renderer/football-value/FootballValueLayout.tsx — 足球球员身价榜顶级 nav panel 容器。
 * 进入时拉一次数据；后续刷新由 store 内部触发。镜像 AiLeaderboardLayout 挂载范式。
 */
import { useEffect } from "preact/hooks";
import { loadBoard } from "./footballValueStore.ts";
import { FootballValuePage } from "./FootballValuePage.tsx";
import "./football-value.css";

export function FootballValueLayout() {
  useEffect(() => {
    loadBoard();
  }, []);

  return (
    <div class="football-value-layout">
      <FootballValuePage />
    </div>
  );
}

export default FootballValueLayout;
