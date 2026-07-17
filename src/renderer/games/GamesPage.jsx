/**
 * src/renderer/games/GamesPage.jsx — 游戏优惠聚合主页面。
 * 结构：FeatureHeader + 平台分类 Tab + 维度筛选栏 + 内容区（折扣网格 / 免费活动网格）。
 */
import { FeatureHeader } from "../components/FeatureHeader.jsx";
import {
  items,
  loading,
  error,
  hasSampleSource,
  hasPspricesAttribution,
  hasPsgamespiderAttribution,
  hasGamerPowerAttribution,
  loadGameDeals,
  fx,
  activePlatform,
  activeMode,
  wishlist,
} from "./gamesStore.js";
import { PlatformTabs } from "./PlatformTabs.jsx";
import { GamesFilterBar } from "./GamesFilterBar.jsx";
import { GameCard } from "./GameCard.jsx";

export function GamesPage() {
  const list = items.value;
  const fxSnap = fx.value;
  const isWishlist = activeMode.value === "wishlist";
  const wishList = wishlist.value;
  const isEmpty =
    !loading.value &&
    !error.value &&
    (isWishlist ? wishList.length === 0 : list.length === 0);

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
        <span class="games-header__hint">各平台折扣 · 免费活动</span>
        {hasSampleSource() && (
          <span class="games-header__badge" title="部分平台为示例数据，非实时价格">
            含示例数据
          </span>
        )}
      </FeatureHeader>

      {!isWishlist && (
        <div class="games-toolbar">
          <PlatformTabs />
          <GamesFilterBar />
        </div>
      )}

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
        {isEmpty && (() => {
          if (isWishlist) {
            return (
              <div class="games-state">
                <span class="games-state__icon" aria-hidden="true">💝</span>
                <span>还没有关注任何游戏，去折扣列表点 ♥ 收藏吧</span>
              </div>
            );
          }
          const noFreeSource =
            activeMode.value === "free" &&
            (activePlatform.value === "playstation" ||
              activePlatform.value === "switch");
          return (
            <div class="games-state">
              <span class="games-state__icon" aria-hidden="true">🎯</span>
              {noFreeSource ? (
                <span>
                  该平台暂无公开免费活动数据源
                  <span class="games-state__hint">
                    Epic / Steam / Xbox 的免费活动更稳定，可切换平台查看
                  </span>
                </span>
              ) : (
                <span>该筛选条件下暂无优惠数据</span>
              )}
            </div>
          );
        })()}
        {isWishlist && !isEmpty && (
          <div class="games-grid">
            {wishList.map((g) => (
              <GameCard
                key={g.key}
                game={{ ...g, salePrice: g.addedPrice }}
                fx={fxSnap}
              />
            ))}
          </div>
        )}
        {!isWishlist && !loading.value && !error.value && list.length > 0 && (
          <div class="games-grid">
            {list.map((g) => (
              <GameCard key={g.id} game={g} fx={fxSnap} />
            ))}
          </div>
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
      {hasGamerPowerAttribution() && (
        <footer class="games-attrib">
          Steam 活动数据由{" "}
          <a
            href="https://www.gamerpower.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            GamerPower
          </a>{" "}
          提供
        </footer>
      )}
      {fxSnap.date && (
        <footer class="games-fx-footer">
          汇率日期：{fxSnap.date}
          {fxSnap.stale && "（缓存汇率）"}
        </footer>
      )}
    </div>
  );
}