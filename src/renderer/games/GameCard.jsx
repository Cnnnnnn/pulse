/**
 * src/renderer/games/GameCard.jsx — 单条游戏优惠卡（折扣 / 喜+1 自适应）。
 */
import { api } from "../api.js";
import { PLATFORM_LABEL, PLATFORM_EMOJI, fmtPrice, fmtDate } from "./format.js";

export function GameCard({ game }) {
  const isFree = game.isFree;
  const platClass = `game-card__platform is-${game.platform}`;
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
        {game.thumb ? (
          <img src={game.thumb} alt="" loading="lazy" />
        ) : (
          <div class="game-card__thumb-ph" aria-hidden="true">
            {PLATFORM_EMOJI[game.platform] || "🎮"}
          </div>
        )}
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
            <span class="game-card__free-tag">喜 +1 · 免费</span>
          ) : (
            <>
              <span class="game-card__sale">
                {fmtPrice(game.salePrice, game.currency)}
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

        <button type="button" class="game-card__cta" onClick={open}>
          查看优惠
        </button>
      </div>
    </article>
  );
}
