/**
 * src/renderer/games/CollectionHeader.jsx
 *
 * 统一游戏收藏 — 头部：类型切换（注册表驱动）+ 完成度环 + 稀有度分布 + 视图切换。
 * 全部经 store 信号；新增类型只需在注册表加一项，本组件自动出现新入口。
 */
import {
  activeCollectionType,
  collectionView,
  collectionSkin,
  unlockHistoryOpen,
  toggleUnlockHistory,
  setCollectionSkin,
  deriveCollectionView,
  setCollectionType,
  setCollectionView,
  listCollectionTypes,
} from "./gamesStore.js";
import { tierColorOf, DEFAULT_RARITY_TIERS } from "./rarityTiers.js";
import { CompletionRing } from "./CompletionRing.jsx";

/** 是否偏好减少动效（安全降级）。 */
function prefersReducedMotion() {
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

/** 视图切换 segmented 控件（网格 / 列表）。 */
function ViewToggle() {
  const view = collectionView.value;
  return (
    <div class="view-toggle" role="group" aria-label="展示方式">
      <button
        type="button"
        class={`view-toggle__btn${view === "grid" ? " is-active" : ""}`}
        aria-pressed={view === "grid"}
        onClick={() => setCollectionView("grid")}
      >
        ▦ 网格
      </button>
      <button
        type="button"
        class={`view-toggle__btn${view === "list" ? " is-active" : ""}`}
        aria-pressed={view === "list"}
        onClick={() => setCollectionView("list")}
      >
        ☰ 列表
      </button>
    </div>
  );
}

/** 皮肤切换 segmented 控件（极简 / 霓虹 / 复古）。 */
const SKINS = [
  { id: "minimal", label: "极简" },
  { id: "neon", label: "霓虹" },
  { id: "retro", label: "复古" },
];
function SkinToggle() {
  const skin = collectionSkin.value;
  return (
    <div class="skin-toggle" role="group" aria-label="皮肤">
      {SKINS.map((s) => (
        <button
          type="button"
          key={s.id}
          class={`skin-toggle__btn${skin === s.id ? " is-active" : ""}`}
          aria-pressed={skin === s.id}
          onClick={() => setCollectionSkin(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** 类型切换条（注册表驱动）。 */
function TypeSwitch() {
  const active = activeCollectionType.value;
  const types = listCollectionTypes();
  return (
    <div class="collection-type-switch" role="tablist" aria-label="收藏类型">
      {types.map((t) => (
        <button
          type="button"
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          class={`collection-type-switch__btn${active === t.id ? " is-active" : ""}`}
          style={`--type-accent:${t.accent}`}
          onClick={() => setCollectionType(t.id)}
        >
          <span class="collection-type-switch__icon" aria-hidden="true">
            {t.icon}
          </span>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function RarityDistribution({ distribution }) {
  return (
    <div class="collection-dist" aria-label="稀有度分布">
      {distribution.map((d) => (
        <span
          class="collection-dist__chip"
          key={d.id}
          title={`${d.name}：${d.count}`}
          style={`--chip-color:${d.color}`}
        >
          <span class="collection-dist__dot" aria-hidden="true" />
          {d.name}
          <span class="collection-dist__count">{d.count}</span>
        </span>
      ))}
    </div>
  );
}

export function CollectionHeader({ reducedMotion } = {}) {
  const rm = reducedMotion != null ? reducedMotion : prefersReducedMotion();
  // 读信号 → 响应式；deriveCollectionView 串联类型/筛选/搜索 + 完成度 + 分布
  const { type, progress, distribution } = deriveCollectionView();

  return (
    <header class="collection-header">
      <div class="collection-header__top">
        <TypeSwitch />
        <div class="collection-header__controls">
          <button
            type="button"
            class="skin-toggle__btn collection-history-btn"
            aria-label="解锁历史"
            aria-haspopup="dialog"
            aria-expanded={unlockHistoryOpen.value}
            onClick={() => toggleUnlockHistory()}
          >
            🏆 历史
          </button>
          <SkinToggle />
          <ViewToggle />
        </div>
      </div>

      <div class="collection-header__main">
        <CompletionRing
          pct={progress.pct}
          label={`${Math.round(progress.pct * 100)}%`}
          sublabel={progress.caption}
          accent={type.accent}
          size={64}
          stroke={8}
          reducedMotion={rm}
        />
        <div class="collection-header__info">
          <h2 class="collection-header__title">
            <span aria-hidden="true">{type.icon}</span> {type.label}
          </h2>
          <p class="collection-header__caption">{progress.caption}</p>
          <RarityDistribution distribution={distribution} />
        </div>
      </div>
    </header>
  );
}

export default CollectionHeader;
