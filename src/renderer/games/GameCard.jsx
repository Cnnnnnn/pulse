/**
 * src/renderer/games/GameCard.jsx — 单条游戏优惠卡（折扣 / 喜+1 自适应）。
 */
import { useEffect, useState } from "preact/hooks";
import { api } from "../api.js";
import { PLATFORM_LABEL, PLATFORM_EMOJI, fmtPrice, fmtCnyReference, fmtDate, promotionTypeLabel } from "./format.js";

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

export function GameCard({ game, fx }) {
  const isFree = game.isFree;
  const platClass = `game-card__platform is-${game.platform}`;
  const cnyRef = !isFree ? fmtCnyReference(game.salePrice, game.currency, fx) : "";
  const saved =
    game.normalPrice != null && game.salePrice != null
      ? game.normalPrice - game.salePrice
      : null;
  function open() {
    if (game.dealUrl) api.openUrl(game.dealUrl);
  }
  return (
    <article class={`game-card${isFree ? " game-card--free" : ""}`}>
      <div class="game-card__thumb">
        <GameThumb thumb={game.thumb} platform={game.platform} gameId={game.id} />
        {game.source === "sample" && (
          <span class="game-card__src" title="示例数据（非实时）">
            示例
          </span>
        )}
      </div>

      <div class="game-card__body">
        <div class="game-card__title" title={game.title}>
          {game.title}
        </div>

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
              <span class="game-card__save">-{game.savings}%</span>
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

        <button type="button" class="game-card__cta" onClick={open}>
          查看优惠
        </button>
      </div>
    </article>
  );
}
