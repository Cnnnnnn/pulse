/**
 * src/renderer/games/GameCard.jsx — 单条游戏优惠卡（折扣 / 喜+1 自适应）。
 */
import { useEffect, useState } from "preact/hooks";
import { PLATFORM_LABEL, PLATFORM_EMOJI, fmtPrice, fmtCnyReference, fmtDate, promotionTypeLabel } from "./format.js";
import {
  isInWishlist,
  addToWishlist,
  removeFromWishlist,
  getWishlistKey,
  getDropInfo,
  lowPriceMap,
  fx,
} from "./gamesStore.js";

function GameThumb({ thumb, platform, gameId }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [gameId, thumb]);

  if (!thumb || imgError) {
    return (
      <div class="game-card__thumb-ph" aria-hidden="true">
        {PLATFORM_EMOJI[platform] || "🎮"}
      </div>
    );
  }

  return (
    <img
      src={thumb}
      alt=""
      loading="lazy"
      onError={() => setImgError(true)}
    />
  );
}

export function GameCard({ game, animate }) {
  const isFree = game.isFree;
  // 史低判定：deal 自带 lowestPrice（PS 同步路径）优先，否则读 lowPriceMap（Steam/Xbox 异步增强）。
  // 严格 salePrice <= lowest；sample 数据排除（与示例徽标互斥）。
  const lowestFromDeal = game.lowestPrice;
  const lowestFromMap = lowPriceMap.value[game.id];
  const lowest = lowestFromDeal != null ? lowestFromDeal : lowestFromMap;
  const showLowest =
    lowest != null &&
    game.salePrice != null &&
    Number(game.salePrice) <= Number(lowest) &&
    game.source !== "sample";
  const favKey = getWishlistKey(game);
  const fav = isInWishlist(favKey);
  function toggleFav(e) {
    e.stopPropagation();
    if (fav) removeFromWishlist(favKey);
    else addToWishlist(game);
  }
  const platClass = `game-card__platform is-${game.platform}`;
  const cnyRef = !isFree ? fmtCnyReference(game.salePrice, game.currency, fx.value) : "";
  const saved =
    game.normalPrice != null && game.salePrice != null
      ? game.normalPrice - game.salePrice
      : null;
  // 降价信号：www 关注且当前价低于关注价（仅 deals/free 模式自然命中；wishlist 模式 salePrice 已覆写 addedPrice → 返回 null）
  const drop = getDropInfo(game);
  return (
    <article class={`game-card is-${game.platform}${isFree ? " game-card--free" : ""}`}>
      <div class="game-card__thumb">
        <GameThumb thumb={game.thumb} platform={game.platform} gameId={game.id} />
        {!isFree && (
          <button
            type="button"
            class={`game-card__fav${fav ? " game-card__fav--on" : ""}`}
            aria-label={fav ? "取消关注" : "关注降价"}
            aria-pressed={fav}
            onClick={toggleFav}
          >
            {fav ? "♥" : "♡"}
          </button>
        )}
        {drop && (
          <span
            class="game-card__drop"
            role="status"
            aria-label={`你关注的 · 降 ${fmtPrice(drop.delta, drop.currency)}（${Math.round(drop.pct * 100)}%）`}
          >
            🎯 降 {fmtPrice(drop.delta, drop.currency)}
          </span>
        )}
        {game.source === "sample" && (
          <span class="game-card__src" title="示例数据（非实时）">
            示例
          </span>
        )}
        {showLowest && (
          <span
            class="game-card__lowest"
            title={`史低价 ${fmtPrice(lowest, "USD")}`}
          >
            史低
          </span>
        )}
      </div>

      <div class="game-card__body">
        {game.dealUrl ? (
          <a
            class="game-card__title"
            href={game.dealUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={game.title}
          >
            {game.title}
          </a>
        ) : (
          <span class="game-card__title" title={game.title}>
            {game.title}
          </span>
        )}

        <div class="game-card__meta">
          <span class={platClass}>
            {PLATFORM_LABEL[game.platform] || game.platform}
          </span>
          {game.rating != null && (
            <span class="game-card__rating">★ {game.rating}</span>
          )}
        </div>

        <div class="game-card__price-row">
          {isFree ? (
            <span class="game-card__free-tag">
              {promotionTypeLabel(game.promotionType)}
            </span>
          ) : (
            <>
              <span class="game-card__sale">
                {fmtPrice(game.salePrice, game.currency)}
                {cnyRef && (
                  <span class="game-card__cny-ref">{cnyRef}</span>
                )}
              </span>
              {game.normalPrice != null && (
                <span class="game-card__normal">
                  {fmtPrice(game.normalPrice, game.currency)}
                </span>
              )}
              {game.savings != null && (
                <span class={`game-card__save${animate ? " game-card__save--pop" : ""}`}>
                  -{game.savings}%
                </span>
              )}
            </>
          )}
        </div>

        {!isFree && saved != null && saved > 0 && (
          <div class="game-card__save-amt">
            省 {fmtPrice(saved, game.currency)}
          </div>
        )}

        {isFree && game.freeUntil && (
          <div class="game-card__free-until">
            限时免费至 {fmtDate(game.freeUntil)}
          </div>
        )}

        {isFree && game.requirements && (
          <div class="game-card__free-until">{game.requirements}</div>
        )}
      </div>
    </article>
  );
}
