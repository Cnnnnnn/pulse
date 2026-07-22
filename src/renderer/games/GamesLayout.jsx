/**
 * src/renderer/games/GamesLayout.jsx — 游戏优惠聚合顶级 nav panel 容器。
 * 进入时拉一次数据（按当前筛选条件）；后续切换由 store 内部触发。
 *
 * v3 后台定时检查免费活动：mount 时启动调度器（autoCheck=true 才跑），
 * unmount 时停止。监听 games-settings-changed 事件，设置变更时 restart。
 */
import { useEffect } from "preact/hooks";
import {
  loadGameDeals,
  loadGamesSettings,
  loadWishlist,
  loadFolders,
  loadTags,
  loadCollectionFilter,
  loadFx,
  loadRarityTiers,
  loadMetrics,
  loadBadges,
  loadAchDef,
  loadAchProgress,
  loadEvents,
  loadUnlockHistory,
  initCollectionEngines,
  fetchedAt,
  enrichSteamLowest,
  enrichXboxLowest,
  activeMode,
  clearGamesNewFree,
  clearGamesNewDrop,
} from "./gamesStore.js";
import { GamesPage } from "./GamesPage.jsx";
import { createGamesCheckScheduler } from "./games-check-scheduler.js";
import "./games.css";

export function GamesLayout() {
  useEffect(() => {
    loadGameDeals();
    loadGamesSettings();
    loadWishlist();
    // 收集模块：挂载即载入文件夹 / 标签 / 收藏筛选（纯本地）
    loadFolders();
    loadTags();
    loadCollectionFilter();
    loadFx(); // 独立汇率：wishlist 模式短路了 loadGameDeals，需单独保证 fx 可用

    // P1a / P1b 装配缺口补齐：稀有度档位 / 埋点计数 / 徽章集合载入
    loadRarityTiers();
    loadMetrics();
    loadBadges();

    // P1c 装配补齐：成就定义 / 成就进度 / 活动配置+进度 载入
    loadAchDef();
    loadAchProgress();
    loadEvents();
    loadUnlockHistory(); // Phase 2.6：解锁历史（持久化读取，纯本地）

    // 启动收藏引擎（徽章等），订阅 wishlist 自动重算；卸载时停止避免 effect 泄漏
    const stopEngines = initCollectionEngines();

    // 后台定时检查免费活动 + 桌面通知调度器
    const scheduler = createGamesCheckScheduler();
    scheduler.start();

    // 设置变更（autoCheck/interval）时重启调度器
    const onSettingsChanged = () => scheduler.restart();
    globalThis.addEventListener("games-settings-changed", onSettingsChanged);

    return () => {
      globalThis.removeEventListener("games-settings-changed", onSettingsChanged);
      scheduler.stop();
      if (typeof stopEngines === "function") stopEngines();
    };
  }, []);

  // 用户切到「免费活动」/「心愿单」tab 时清除未读红点
  useEffect(() => {
    if (activeMode.value === "free") clearGamesNewFree();
    if (activeMode.value === "wishlist") clearGamesNewDrop();
  }, [activeMode.value]);

  // 数据加载完成后，后台异步查 Steam/Xbox 史低价（渐进更新徽标）
  useEffect(() => {
    if (!fetchedAt.value) return;
    if (activeMode.value === "deals" || activeMode.value === "compare") {
      enrichSteamLowest();
      enrichXboxLowest();
    }
  }, [fetchedAt.value]);

  return (
    <div class="games-layout">
      <GamesPage />
    </div>
  );
}

export default GamesLayout;
