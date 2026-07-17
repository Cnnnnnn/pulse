/**
 * src/renderer/games/TopRanking.jsx — 热门游戏 Top10 榜单（带名次奖牌）。
 */
import { api } from "../api.js";
import { PLATFORM_LABEL, PLATFORM_EMOJI, fmtPrice } from "./format.js";

export function TopRanking({ games }) {
  return (
    <ol class="games-rank">
      {games.map((g, i) => {
        const isFree = g.isFree;
        const rankNo = i + 1;
        const medalClass =
          rankNo <= 3 ? ` is-top is-${rankNo}` : "";
        return (
          <li class="games-rank__row" key={g.id}>
            <span class={`games-rank__no${medalClass}`}>{rankNo}</span>
            <div class="games-rank__thumb">
              {g.thumb ? (
                <img src={g.thumb} alt="" loading="lazy" />
              ) : (
                <span aria-hidden="true">
                  {PLATFORM_EMOJI[g.platform] || "🎮"}
                </span>
              )}
            </div>
            <div class="games-rank__main">
              <div class="games-rank__title" title={g.title}>
                {g.title}
              </div>
              <div class="games-rank__sub">
                <span class={`game-card__platform is-${g.platform}`}>
                  {PLATFORM_LABEL[g.platform] || g.platform}
                </span>
                {g.rating != null && <span>★ {g.rating}</span>}
                {g.source === "sample" && (
                  <span class="games-rank__sample">示例</span>
                )}
              </div>
            </div>
            <div class="games-rank__metric">
              {isFree ? (
                <span class="game-card__free-tag">喜 +1</span>
              ) : (
                <>
                  <span class="games-rank__sale">
                    {fmtPrice(g.salePrice, g.currency)}
                  </span>
                  <span class="game-card__save">-{g.savings}%</span>
                </>
              )}
              <button
                type="button"
                class="games-rank__cta"
                onClick={() => g.dealUrl && api.openUrl(g.dealUrl)}
              >
                查看
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
