/**
 * src/renderer/games/CollectibleCard.jsx
 *
 * 收藏物卡片（统一游戏收藏核心组件）。
 *
 * 设计要点（设计文档 §3/§4/§5）：
 *  - 双态：已分级（稀有度微光 + 档位角标）/ 未分级（ghost 压暗 + 「待分级」角标）。
 *  - 收集切换：真实数据里「已收藏 = 在 wishlist」；本项目无 master catalog，
 *    故按钮表达「取消收藏 / 重新收藏」语义（onToggle 由调用方接 toggleFavorite）。
 *  - 键盘可达：卡片内按钮均为原生 <button>，Enter/Space 原生触发；44px 触控热区。
 *  - 游戏感动效：ranked 卡片 hover/聚焦微光回弹；reducedMotion 时不播放。
 *  - 复用既有 NoteRatingModal：onOpen(entry.key) 打开备注/评分/稀有度/标签弹窗。
 *
 * 纯展示组件（除 onToggle/onOpen 回调），不持有状态。
 */
import { useState, useEffect } from "preact/hooks";
import { tierColorOf, DEFAULT_RARITY_TIERS } from "./rarityTiers.js";
import { isRanked } from "./collectionRegistry.js";
import { currentPriceOf, RATING_MAX } from "./types.js";

const PLATFORM_EMOJI = {
  steam: "🎮",
  epic: "🎁",
  xbox: "🟢",
  playstation: "🔵",
  switch: "🔴",
};

/**
 * 收藏物缩略图（真实 thumb 接入 + 容错）。
 * entry.thumb 存在则渲染真实图片；加载失败（onError）或无图时回退为平台 emoji 占位，
 * 占位底色取本卡稀有度色（color-mix 派生），保证视觉连续、不破版。
 */
function CollectibleThumb({ entry, color }) {
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [entry.key, entry.thumb]);

  if (entry.thumb && !imgError) {
    return (
      <img
        class="collectible-card__img"
        src={entry.thumb}
        alt=""
        loading="lazy"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <span class="collectible-card__emoji" style={`--ph-bg:${color}`} aria-hidden="true">
      {PLATFORM_EMOJI[entry.platform] || "🎮"}
    </span>
  );
}

function priceText(entry) {
  const v = currentPriceOf(entry);
  if (!v) return "—";
  const sym = entry.currentCurrency === "CNY" ? "¥" : "$";
  return `${sym}${v.toFixed(2)}`;
}

function Stars({ rating }) {
  const full = Math.max(0, Math.min(RATING_MAX, Math.round(rating)));
  if (full <= 0) return null;
  return (
    <span class="collectible-card__stars" aria-label={`评分 ${full} / ${RATING_MAX}`}>
      {"★".repeat(full)}
      <span class="collectible-card__stars-off">{"★".repeat(RATING_MAX - full)}</span>
    </span>
  );
}

/**
 * @param {object} props
 * @param {object} props.entry  已收藏条目（WishlistEntry）
 * @param {Array} [props.tiers] 稀有度档位
 * @param {string} [props.accent] 类型主题色
 * @param {"grid"|"list"} [props.view="grid"]
 * @param {boolean} [props.collected=true] 是否已收藏（真实数据恒 true）
 * @param {(entry:object)=>void} [props.onToggle]
 * @param {(key:string)=>void} [props.onOpen]  打开备注/评分弹窗
 * @param {boolean} [props.reducedMotion=false]
 */
export function CollectibleCard({
  entry,
  tiers = DEFAULT_RARITY_TIERS,
  accent = "var(--accent-primary)",
  view = "grid",
  collected = true,
  onToggle,
  onOpen,
  reducedMotion = false,
}) {
  const [collecting, setCollecting] = useState(false);
  if (!entry) return null;
  const ranked = isRanked(entry);
  const color = ranked ? tierColorOf(tiers, entry.rarity) : "var(--text-secondary)";
  const tierDef = ranked ? tiers.find((t) => t.id === entry.rarity) : null;

  return (
    <article
      class={`collectible-card collectible-card--${view}${ranked ? " is-ranked" : " is-unranked"}${ranked && entry.rarity === "legendary" ? " is-legendary" : ""}${collecting ? " is-collecting" : ""}${reducedMotion ? " is-reduced" : ""}`}
      style={`--card-accent:${color}`}
    >
      <div class={`collectible-card__thumb${entry.platform ? ` collectible-card__thumb--${entry.platform}` : ""}`} aria-hidden="true">
        <CollectibleThumb entry={entry} color={color} />
        <span class="collectible-card__rarity" title={ranked ? tierDef?.name : "待分级"}>
          {ranked ? tierDef?.name || "稀有" : "待分级"}
        </span>
      </div>

      <div class="collectible-card__body">
        <div class="collectible-card__title-row">
          <span class="collectible-card__title" title={entry.title}>
            {entry.title || "未命名"}
          </span>
          <button
            type="button"
            class="collectible-card__menu"
            aria-label={`${entry.title || "该条目"} 更多操作`}
            aria-haspopup="dialog"
            onClick={() => onOpen && onOpen(entry.key)}
          >
            ⋯
          </button>
        </div>

        <div class="collectible-card__meta">
          <span class="collectible-card__price">{priceText(entry)}</span>
          <Stars rating={entry.rating} />
          {Array.isArray(entry.tags) && entry.tags.length > 0 && (
            <span class="collectible-card__tags">
              {entry.tags.slice(0, 3).map((t) => (
                <span class="collectible-card__tag" key={t}>
                  #{t}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        class={`collectible-card__collect${collected ? " is-on" : ""}`}
        aria-pressed={collected}
        aria-label={collected ? `取消收藏 ${entry.title || ""}` : `收藏 ${entry.title || ""}`}
        onClick={() => {
          if (!reducedMotion) {
            setCollecting(true);
            setTimeout(() => setCollecting(false), 620);
          }
          onToggle && onToggle(entry);
        }}
      >
        {collected ? "♥ 已收藏" : "♡ 收藏"}
      </button>
    </article>
  );
}

export default CollectibleCard;
