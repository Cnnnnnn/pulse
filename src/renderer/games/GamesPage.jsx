/**
 * src/renderer/games/GamesPage.jsx — 游戏优惠聚合主页面。
 * 结构：FeatureHeader(动态语境) + 平台分类 Tab + 维度筛选栏 + 筛选上下文条 + 内容区。
 *
 * 收藏(wishlist)模式：渲染「侧栏 + 顶部统计 + 网格」布局，并按 activeCollectionFilter 过滤。
 */
import { useEffect, useRef, useState } from "preact/hooks";
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
  activeSort,
  wishlist,
  minSavings,
  comparePlatforms,
  fetchedAt,
  sortItems,
  filterBySavings,
  searchQuery,
  matchesSearch,
  clearSearchQuery,
  activeCollectionFilter,
  PLATFORMS,
} from "./gamesStore.js";
import { PlatformTabs } from "./PlatformTabs.jsx";
import { GamesFilterBar } from "./GamesFilterBar.jsx";
import { GameCard } from "./GameCard.jsx";
import { CollectionSidebar } from "./CollectionSidebar.jsx";
import { StatsOverview } from "./StatsOverview.jsx";
import { NoteRatingModal } from "./NoteRatingModal.jsx";
import { MergeConfirmModal } from "./MergeConfirmModal.jsx";
import { UsageMetricsPanel } from "./UsageMetricsPanel.jsx";
import { BadgeWall } from "./BadgeWall.jsx";
import { ShareImageModal } from "./ShareImageModal.jsx";
import { rarityTiers } from "./gamesStore.js";

const MODE_HINTS = {
  deals: "各平台折扣 · 限时特惠",
  free: "限时免费 · 试玩 · 赠送",
  wishlist: "我关注的降价提醒",
  compare: "跨平台价格对比",
};
const MODE_LABELS = {
  deals: "折扣力度",
  free: "免费活动",
  wishlist: "心愿单",
  compare: "比价",
};

function platformLabel(k) {
  return (PLATFORMS.find((p) => p.key === k) || {}).label || k;
}
function fmtClock(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function GamesPage() {
  const list = items.value;
  const fxSnap = fx.value;
  const mode = activeMode.value;
  const isWishlist = mode === "wishlist";
  const isCompare = mode === "compare";

  // 入场动画仅首屏播放一次
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAnimate(false), 450);
    return () => clearTimeout(t);
  }, []);

  // 「生成分享图」弹窗开关（P1b · F）
  const [shareOpen, setShareOpen] = useState(false);

  // 全局 `/` 快捷键聚焦搜索
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "/") return;
      const el = document.activeElement;
      const tag = el && el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (el && el.isContentEditable) return;
      const input = document.getElementById("games-search-input");
      if (input) {
        e.preventDefault();
        input.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // 滚动性能优化
  const bodyRef = useRef(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    let t = 0;
    function onScroll() {
      el.classList.add("is-scrolling");
      clearTimeout(t);
      t = setTimeout(() => el.classList.remove("is-scrolling"), 120);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(t);
    };
  }, []);

  // 比价模式：API 已返回全平台，本地过滤；deals：本地排序/阈值
  let shown = list;
  if (isCompare) {
    shown = list.filter((g) => comparePlatforms.value.includes(g.platform));
  } else if (!isWishlist) {
    shown = sortItems(filterBySavings(list, minSavings.value), activeSort.value);
  }

  // 标题搜索：本地过滤（wishlist / 普通列表都生效）
  const q = (searchQuery.value || "").trim();
  const matches = (g) => matchesSearch(g, q);
  if (q) shown = shown.filter(matches);

  // ── 收藏(wishlist)视图：按 activeCollectionFilter + 搜索过滤 ──
  const filter = activeCollectionFilter.value;
  let collectionList = wishlist.value;
  if (filter && filter.type === "folder") {
    collectionList = collectionList.filter((e) => e.folderId === filter.id);
  } else if (filter && filter.type === "tag") {
    collectionList = collectionList.filter((e) => e.tags.includes(filter.id));
  }
  // ── P1a（A）：收藏网格按稀有度降序排列；unranked 恒排末尾 ──
  if (isWishlist) {
    const weightOf = {};
    for (const t of rarityTiers.value) weightOf[t.id] = t.weight;
    collectionList = [...collectionList].sort((a, b) => {
      const wa = a.rarity != null && weightOf[a.rarity] != null ? weightOf[a.rarity] : -1;
      const wb = b.rarity != null && weightOf[b.rarity] != null ? weightOf[b.rarity] : -1;
      return wb - wa; // 降序；unranked(-1) 自然落至末尾
    });
  }
  if (q) collectionList = collectionList.filter(matches);

  const isEmpty =
    !loading.value &&
    !error.value &&
    (isWishlist ? collectionList.length === 0 : shown.length === 0);

  const crumb = (() => {
    const plat = isCompare
      ? `跨平台比价（${[...comparePlatforms.value].map(platformLabel).join(" / ")}）`
      : platformLabel(activePlatform.value);
    let c = `${plat} · ${MODE_LABELS[mode]}`;
    if (mode === "deals" && minSavings.value > 0) c += ` · ≥${minSavings.value}%`;
    return c;
  })();
  const count = isWishlist ? collectionList.length : shown.length;
  const clock = fmtClock(fetchedAt.value);

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
        <span class="games-header__hint">{MODE_HINTS[mode]}</span>
        {hasSampleSource() && (
          <span class="games-header__badge" title="部分平台为示例数据，非实时价格">
            含示例数据
          </span>
        )}
      </FeatureHeader>

      <div class="games-toolbar">
        {!isWishlist && <PlatformTabs />}
        <GamesFilterBar />
        {isWishlist && (
          <button
            type="button"
            class="games-share-btn"
            aria-haspopup="dialog"
            onClick={() => setShareOpen(true)}
          >
            🖼 生成分享图
          </button>
        )}
      </div>

      <div class="games-context">
        <span class="games-context__crumb">{crumb}</span>
        <span class="games-context__count" aria-live="polite">共 {count} 款</span>
        {clock && <span class="games-context__time">更新于 {clock}</span>}
      </div>

      <div class="games-body" ref={bodyRef}>
        {loading.value && (
          <div class="games-skeleton-grid" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div class="games-skeleton-card" key={i}>
                <div class="games-skeleton-card__thumb" />
                <div class="games-skeleton-card__body">
                  <div class="games-skeleton-line games-skeleton-line--title" />
                  <div class="games-skeleton-line games-skeleton-line--title2" />
                  <div class="games-skeleton-line games-skeleton-line--meta" />
                  <div class="games-skeleton-line games-skeleton-line--price" />
                </div>
              </div>
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
          if (q) {
            return (
              <div class="games-state">
                <span class="games-state__icon" aria-hidden="true">🔍</span>
                <span>没有匹配「{q}」的游戏</span>
                <button
                  type="button"
                  class="games-state__retry"
                  onClick={() => clearSearchQuery()}
                >
                  清除搜索
                </button>
              </div>
            );
          }
          if (isWishlist) {
            if (filter && filter.type) {
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

        {/* 收藏(wishlist)模式：侧栏 + 顶部统计 + 网格 */}
        {isWishlist && !isEmpty && (
          <div class="collection-layout">
            <CollectionSidebar />
            <div class="collection-main">
              <StatsOverview />
              <UsageMetricsPanel />
              <BadgeWall />
              <div class="games-grid">
                {collectionList.map((g) => (
                  <GameCard
                    key={g.key}
                    game={{ ...g, salePrice: g.addedPrice }}
                    context="wishlist"
                    animate={animate}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 非收藏模式：普通网格 */}
        {!isWishlist && !loading.value && !error.value && shown.length > 0 && (
          <div class="games-grid" id="games-grid">
            {shown.map((g) => (
              <GameCard key={g.id} game={g} animate={animate} />
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

      {/* 收藏模块弹窗（纯本地） */}
      <NoteRatingModal />
      <MergeConfirmModal />
      <ShareImageModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}

export default GamesPage;
