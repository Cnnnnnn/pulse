/**
 * src/renderer/games/GameCard.jsx — 单条游戏优惠卡（折扣 / 喜+1 / 收藏 自适应）。
 *
 * 阶段1 收集模块增强：
 *  - P0-3 快捷收集：收藏按钮（≥44px 触控、焦点环、已/未对比≥3:1、同 key 去重）。
 *  - P0-4 备注/评分：wishlist 卡片「更多(⋯)」入口 → 备注/评分弹窗 + 卡片小标识。
 *  - P0-2 分类：卡片「更多」可直接打标签 / 移入文件夹。
 *  - P0-6 去重：命中映射显示「可合并」徽标；合并主记录可展开并排各平台价 + 拆分还原。
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { PLATFORM_LABEL, PLATFORM_EMOJI, fmtPrice, fmtCnyReference, fmtDate, promotionTypeLabel } from "./format.js";
import {
  isInWishlist,
  toggleFavorite,
  getWishlistKey,
  getDropInfo,
  lowPriceMap,
  fx,
  currentPriceOf,
  savedOf,
  findMergeCandidates,
  openMerge,
  openMergeManual,
  openNoteRating,
  splitEntry,
  expandedMergeKey,
  setEntryFolder,
  setEntryTags,
  createFolder,
  addTag,
  folders,
  tags,
  wishlist,
  rarityTiers,
  setEntryRarity,
  addRarityTier,
} from "./gamesStore.js";
import { tierColorOf } from "./rarityTiers.js";
import { RarityPicker } from "./RarityPicker.jsx";

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

/**
 * 收藏「更多(⋯)」操作面板：备注/评分、打标签、移入文件夹、合并其他平台。
 * 仅 wishlist 卡片使用。
 */
function CardMenu({ game, onClose }) {
  const ref = useRef(null);
  const entry = game; // wishlist 模式下 game 即条目本身
  const key = entry.key;

  useEffect(() => {
    function onDocDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const otherEntries = wishlist.value.filter(
    (e) => e.key !== key && !(e.mergedMembers && e.mergedMembers.length),
  );
  const canMerge = otherEntries.length > 0;

  function toggleFolder(fid) {
    setEntryFolder(key, entry.folderId === fid ? null : fid);
  }
  function toggleTag(name) {
    const next = entry.tags.includes(name)
      ? entry.tags.filter((x) => x !== name)
      : [...entry.tags, name];
    setEntryTags(key, next);
  }

  return (
    <div class="card-menu" role="menu" ref={ref} aria-label="收藏操作">
      <button
        type="button"
        class="card-menu__item"
        role="menuitem"
        onClick={() => {
          openNoteRating(key);
          onClose();
        }}
      >
        📝 备注 / 评分
      </button>

      <div class="card-menu__group">
        <span class="card-menu__group-label">稀有度</span>
        <RarityPicker
          value={entry.rarity}
          tiers={rarityTiers.value}
          onSelect={(tierId) => setEntryRarity(key, tierId)}
          onAddTier={(name) => {
            const id = addRarityTier(name);
            if (id) setEntryRarity(key, id);
          }}
        />
      </div>

      <div class="card-menu__group">
        <span class="card-menu__group-label">收藏夹</span>
        <div class="card-menu__chips">
          {folders.value.length === 0 && (
            <button
              type="button"
              class="card-menu__chip card-menu__chip--new"
              onClick={() => createFolder("新收藏夹")}
            >
              ＋ 新建
            </button>
          )}
          {folders.value.map((f) => (
            <button
              type="button"
              key={f.id}
              class={`card-menu__chip${entry.folderId === f.id ? " is-on" : ""}`}
              aria-pressed={entry.folderId === f.id}
              onClick={() => toggleFolder(f.id)}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>

      <div class="card-menu__group">
        <span class="card-menu__group-label">标签</span>
        <div class="card-menu__chips">
          {tags.value.length === 0 && (
            <button
              type="button"
              class="card-menu__chip card-menu__chip--new"
              onClick={() => addTag("新标签")}
            >
              ＋ 新建
            </button>
          )}
          {tags.value.map((t) => (
            <button
              type="button"
              key={t.id}
              class={`card-menu__chip${entry.tags.includes(t.name) ? " is-on" : ""}`}
              aria-pressed={entry.tags.includes(t.name)}
              onClick={() => toggleTag(t.name)}
            >
              #{t.name}
            </button>
          ))}
        </div>
      </div>

      {canMerge && (
        <button
          type="button"
          class="card-menu__item"
          role="menuitem"
          onClick={() => {
            openMergeManual(key);
            onClose();
          }}
        >
          🔗 合并其他平台…
        </button>
      )}
    </div>
  );
}

export function GameCard({ game, animate, context }) {
  const isWishlistCard = context === "wishlist";
  const isFree = game.isFree;
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
  const drop = getDropInfo(game);

  const [menuOpen, setMenuOpen] = useState(false);

  function toggleFav(e) {
    e.stopPropagation();
    toggleFavorite(game);
  }
  function toggleMenu(e) {
    e.stopPropagation();
    setMenuOpen((v) => !v);
  }

  const platClass = `game-card__platform is-${game.platform}`;
  const cnyRef = !isFree ? fmtCnyReference(game.salePrice, game.currency, fx.value) : "";
  const saved =
    game.normalPrice != null && game.salePrice != null
      ? game.normalPrice - game.salePrice
      : null;

  // ── P0-6：可合并徽标（仅未合并条目、且命中映射且候选已存在）──
  const mergeCandidates = isWishlistCard && !(game.mergedMembers && game.mergedMembers.length)
    ? findMergeCandidates(game.key)
    : [];
  const showMergeBadge = mergeCandidates.length > 0;

  // ── P0-6：合并展开 ──
  const isExpanded = expandedMergeKey.value === game.key && game.mergedMembers && game.mergedMembers.length;

  // ── P0-4：卡片小标识 ──
  const showNoteFlag = isWishlistCard && game.note && game.note.trim().length > 0;
  const showRatingFlag = isWishlistCard && game.rating > 0;

  // ── P1a（A 稀有度）：未分级不显示角标 ──
  const entryRarity = isWishlistCard ? game.rarity : null;
  const showRarityBadge = !!entryRarity;
  const rarityTier = entryRarity
    ? rarityTiers.value.find((t) => t.id === entryRarity)
    : null;
  const rarityTierName = rarityTier ? rarityTier.name : entryRarity;
  const rarityColor = tierColorOf(rarityTiers.value, entryRarity);

  return (
    <article class={`game-card is-${game.platform}${isFree ? " game-card--free" : ""}${(game.mergedMembers && game.mergedMembers.length) ? " game-card--merged" : ""}${menuOpen ? " game-card--menu-open" : ""}`}>
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
            <span class="ico" aria-hidden="true">{fav ? "♥" : "♡"}</span>
          </button>
        )}
        {isWishlistCard && (
          <button
            type="button"
            class="game-card__more"
            aria-label="更多操作"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
          >
            <span class="ico" aria-hidden="true">⋯</span>
          </button>
        )}
        {showMergeBadge && (
          <button
            type="button"
            class="game-card__merge-badge"
            aria-label="可合并：存在跨平台同游戏收藏"
            onClick={(e) => {
              e.stopPropagation();
              openMerge(mergeCandidates, false);
            }}
          >
            可合并
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
        {showRarityBadge && (
          <span
            class="game-card__rarity"
            style={{ "--rarity-color": rarityColor }}
            title={`稀有度：${rarityTierName}`}
            aria-label={`稀有度：${rarityTierName}`}
          >
            <span class="game-card__rarity-dot" aria-hidden="true" />
            {rarityTierName}
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

        {menuOpen && isWishlistCard && <CardMenu game={game} onClose={() => setMenuOpen(false)} />}
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
          {showNoteFlag && (
            <span class="game-card__flag" title={`备注：${game.note}`} aria-label="有备注">
              📝
            </span>
          )}
          {showRatingFlag && (
            <span class="game-card__flag" title={`评分：${game.rating} 星`} aria-label={`评分 ${game.rating} 星`}>
              {"★".repeat(game.rating)}
            </span>
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

        {/* P0-6：合并主记录展开 — 并排各平台当前价 + 拆分还原 */}
        {isExpanded && (
          <div class="merge-expand">
            <div class="merge-expand__head">
              <span class="merge-expand__title">已合并 {game.mergedMembers.length} 个平台</span>
              <button
                type="button"
                class="merge-expand__split"
                onClick={(e) => {
                  e.stopPropagation();
                  splitEntry(game.key);
                }}
              >
                拆分还原
              </button>
            </div>
            <ul class="merge-expand__list">
              {game.mergedMembers.map((m) => {
                const cur = currentPriceOf(m);
                const sv = savedOf(m);
                const curCode = m.currentCurrency || m.currency;
                return (
                  <li key={m.key} class="merge-expand__row">
                    <span class="merge-expand__plat">
                      {PLATFORM_LABEL[m.platform] || m.platform}
                      {m.isPrimary && <span class="merge-expand__primary">主</span>}
                    </span>
                    <span class="merge-expand__price">{fmtPrice(cur, curCode)}</span>
                    <span class="merge-expand__save">
                      {sv > 0 ? `省 ${fmtPrice(sv, curCode)}` : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* 合并主记录：卡片底部「展开/收起」触发（仅合并态显示） */}
      {isWishlistCard && game.mergedMembers && game.mergedMembers.length > 0 && (
        <button
          type="button"
          class="game-card__expand-toggle"
          aria-expanded={isExpanded}
          onClick={(e) => {
            e.stopPropagation();
            expandedMergeKey.value = isExpanded ? null : game.key;
          }}
        >
          {isExpanded ? "收起各平台价格 ▲" : `展开各平台价格（${game.mergedMembers.length}）▼`}
        </button>
      )}
    </article>
  );
}

export default GameCard;
