/**
 * src/renderer/games/GamesPage.jsx — 游戏优惠聚合主页面。
 * 结构：FeatureHeader + 平台分类 Tab + 维度筛选栏 + 内容区（网格 / Top10 榜单）。
 */
import { FeatureHeader } from "../components/FeatureHeader.jsx";
import {
  items,
  loading,
  error,
  activeMode,
  hasSampleSource,
  hasPspricesAttribution,
  hasPsgamespiderAttribution,
  loadGameDeals,
} from "./gamesStore.js";
import { PlatformTabs } from "./PlatformTabs.jsx";
import { GamesFilterBar } from "./GamesFilterBar.jsx";
import { GameCard } from "./GameCard.jsx";
import { TopRanking } from "./TopRanking.jsx";

export function GamesPage() {
  const mode = activeMode.value;
  const list = items.value;
  const isEmpty = !loading.value && !error.value && list.length === 0;

  return (
    <div class="games-page">
      <FeatureHeader
        className="games-header"
        brand={
          <>
            <span class="games-header__mark" aria-hidden="true">
              🎮
            </span>
            游戏优惠聚合
          </>
        }
      >
        <span class="games-header__hint">各平台折扣 · 喜+1 · 热门榜</span>
        {hasSampleSource() && (
          <span class="games-header__badge" title="部分平台为示例数据，非实时价格">
            含示例数据
          </span>
        )}
      </FeatureHeader>

      <div class="games-toolbar">
        <PlatformTabs />
        <GamesFilterBar />
      </div>

      <div class="games-body">
        {loading.value && (
          <div class="games-skeleton-grid" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div class="games-skeleton-card" key={i} />
            ))}
          </div>
        )}
        {error.value && (
          <div class="games-state games-state--err" role="alert">
            <span class="games-state__icon" aria-hidden="true">⚠️</span>
            <span>加载失败：{error.value}</span>
            <button
              type="button"
              class="games-state__retry"
              onClick={() => loadGameDeals()}
            >
              重试
            </button>
          </div>
        )}
        {isEmpty && (
          <div class="games-state">
            <span class="games-state__icon" aria-hidden="true">🎯</span>
            <span>该筛选条件下暂无优惠数据</span>
          </div>
        )}
        {!loading.value && !error.value && list.length > 0 && (
          <>
            {mode === "top" ? (
              <TopRanking games={list} />
            ) : (
              <div class="games-grid">
                {list.map((g) => (
                  <GameCard key={g.id} game={g} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {hasPspricesAttribution() && (
        <footer class="games-attrib">
          价格数据由{" "}
          <a
            href="https://psprices.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            PSPrices
          </a>{" "}
          提供
        </footer>
      )}
      {hasPsgamespiderAttribution() && (
        <footer class="games-attrib">
          PS 价格数据由{" "}
          <a
            href="https://github.com/RavelloH/PSGameSpider"
            target="_blank"
            rel="noopener noreferrer"
          >
            PSGameSpider
          </a>{" "}
          开源项目提供（每日更新）
        </footer>
      )}
    </div>
  );
}
