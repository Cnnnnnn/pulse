/**
 * src/renderer/games/GamesLayout.jsx — 游戏优惠聚合顶级 nav panel 容器。
 * 进入时拉一次数据（按当前筛选条件）；后续切换由 store 内部触发。
 */
import { useEffect } from "preact/hooks";
import { loadGameDeals } from "./gamesStore.js";
import { GamesPage } from "./GamesPage.jsx";
import "./games.css";

export function GamesLayout() {
  useEffect(() => {
    loadGameDeals();
  }, []);
  return (
    <div class="games-layout">
      <GamesPage />
    </div>
  );
}

export default GamesLayout;
