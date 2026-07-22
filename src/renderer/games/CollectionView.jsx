/**
 * src/renderer/games/CollectionView.jsx
 *
 * 统一游戏收藏 — 视图容器（Phase 2 落地核心）。
 * 组合 CollectionHeader + 网格/列表双布局；经 deriveCollectionView() 派生数据，
 * 收集/打开弹窗复用既有 store 动作（toggleFavorite / openNoteRating），
 * 不重复实现任何业务逻辑。空态参照既有 GamesPage 收藏空态文案。
 *
 * Phase 2.5 增强：
 *  - data-skin 驱动多皮肤（极简/霓虹/复古）；
 *  - 加载骨架态（collectionLoading，仅空态下展示）；
 *  - 解锁庆祝 toast 栈 + 里程碑粒子动效（挂载于本视图，绝对定位覆盖）；
 *  - reducedMotion 透传至卡片 / 环 / FX 组件，统一尊重 prefers-reduced-motion。
 */
import {
  deriveCollectionView,
  collectionView,
  collectionLoading,
  collectionSkin,
  rarityTiers,
  toggleFavorite,
  openNoteRating,
  activeCollectionFilter,
  searchQuery,
  clearSearchQuery,
} from "./gamesStore.js";
import { CollectionHeader } from "./CollectionHeader.jsx";
import { CollectibleCard } from "./CollectibleCard.jsx";
import { UnlockToastStack } from "./UnlockToastStack.jsx";
import { MilestoneFx } from "./MilestoneFx.jsx";
import { UnlockHistoryPanel } from "./UnlockHistoryPanel.jsx";

/** 是否偏好减少动效（安全降级，无 matchMedia 环境返回 false）。 */
export function prefersReducedMotion() {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/** 加载骨架（仅空态 loading 时展示）。 */
function CollectionSkeleton({ view = "grid", count = 8 }) {
  const wrap = view === "list" ? "collection-list" : "collection-grid";
  return (
    <div class={wrap} aria-hidden="true" aria-label="加载中">
      {Array.from({ length: count }).map((_, i) => (
        <div class={`collectible-card collectible-card--${view} is-skeleton`} key={i}>
          <div class="collectible-card__thumb collectible-card__thumb--sk" />
          <div class="collectible-card__body">
            <div class="collectible-card__sk-line collectible-card__sk-line--title" />
            <div class="collectible-card__sk-line collectible-card__sk-line--meta" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  const q = (searchQuery.value || "").trim();
  const f = activeCollectionFilter.value;
  if (q) {
    return (
      <div class="games-state">
        <span class="games-state__icon" aria-hidden="true">🔍</span>
        <span>没有匹配「{q}」的收藏</span>
        <button type="button" class="games-state__retry" onClick={() => clearSearchQuery()}>
          清除搜索
        </button>
      </div>
    );
  }
  if (f && f.type) {
    return (
      <div class="games-state">
        <span class="games-state__icon" aria-hidden="true">📁</span>
        <span>该分类下还没有收藏，去其它平台点 ♥ 收藏吧</span>
      </div>
    );
  }
  return (
    <div class="games-state">
      <span class="games-state__icon" aria-hidden="true">💝</span>
      <span>还没有关注任何游戏，去折扣列表点 ♥ 收藏吧</span>
    </div>
  );
}

export function CollectionView() {
  const { type, entries, progress } = deriveCollectionView();
  const view = collectionView.value;
  const tiers = rarityTiers.value;
  const reducedMotion = prefersReducedMotion();
  const loading = collectionLoading.value;
  const skinRaw = collectionSkin.value;
  const skin = ["minimal", "neon", "retro"].includes(skinRaw) ? skinRaw : "minimal";

  return (
    <section
      class="collection-view"
      data-skin={skin}
      aria-label={`${type.label}收藏`}
    >
      <CollectionHeader reducedMotion={reducedMotion} />

      {loading && entries.length === 0 ? (
        <CollectionSkeleton view={view} />
      ) : entries.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          class={`collection-${view}`}
          role="list"
          aria-label={`${entries.length} 款收藏`}
        >
          {entries.map((e) => (
            <div role="listitem" key={e.key}>
              <CollectibleCard
                entry={e}
                tiers={tiers}
                accent={type.accent}
                view={view}
                collected
                reducedMotion={reducedMotion}
                onToggle={(entry) => toggleFavorite(entry)}
                onOpen={(key) => openNoteRating(key)}
              />
            </div>
          ))}
        </div>
      )}

      {/* 进度文本对屏幕阅读器播报（与环的 aria-label 互补） */}
      <span class="sr-only" aria-live="polite">
        {type.label}完成度 {Math.round(progress.pct * 100)}%，{progress.caption}
      </span>

      <UnlockToastStack reducedMotion={reducedMotion} />
      <MilestoneFx reducedMotion={reducedMotion} />
      <UnlockHistoryPanel />
    </section>
  );
}

export default CollectionView;
