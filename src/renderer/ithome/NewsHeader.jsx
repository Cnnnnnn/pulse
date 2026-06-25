/**
 * src/renderer/ithome/NewsHeader.jsx — 对齐世界杯顶栏结构
 */

import {
  ithomeNewsTs,
  ithomeNewsLoading,
  ithomeViewMode,
  setIthomeViewMode,
  ithomeFavorites,
} from "./store.js";
import { currentMonthLabel, favoriteCount } from "./news-utils.js";
import { IconNews, IconRefresh, IconCalendar, IconStar } from "../components/icons.jsx";

const SUBTABS = [
  { key: "news", label: "本月新闻", Icon: IconCalendar },
  { key: "favorites", label: "收藏", Icon: IconStar },
];

function formatTs(ts) {
  if (!ts) return "尚未刷新";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function NewsHeader({
  search,
  onSearchChange,
  onRefresh,
}) {
  const loading = ithomeNewsLoading.value;
  const ts = ithomeNewsTs.value;
  const mode = ithomeViewMode.value;
  const favTotal = favoriteCount(ithomeFavorites.value);
  const isFavorites = mode === "favorites";

  return (
    <div class="ithome-header">
      <div class="ithome-header-brand">
        <span class="ithome-header-icon"><IconNews size={18} /></span>
        <h2 class="ithome-header-title">IT 新闻</h2>
        <span class="ithome-header-sub">
          {isFavorites
            ? `收藏 ${favTotal} 篇 · 永久保留`
            : `IT之家 · ${currentMonthLabel()} · 更新于 ${formatTs(ts)}`}
        </span>
        {!isFavorites && (
          <button
            type="button"
            class={`ithome-refresh-btn${loading ? " is-loading" : ""}`}
            onClick={() => onRefresh && onRefresh()}
            disabled={loading}
            title="拉取当前日期新闻"
            aria-label="拉取当前日期新闻"
          >
            <span class="ithome-refresh-icon" aria-hidden="true">
              <IconRefresh size={14} />
            </span>
          </button>
        )}
      </div>
      <div class="ithome-header-controls">
        <div class="ithome-subtabs">
          {SUBTABS.map((t) => {
            const active =
              (t.key === "news" && !isFavorites) ||
              (t.key === "favorites" && isFavorites);
            const label =
              t.key === "favorites" && favTotal > 0
                ? `${t.label} (${favTotal})`
                : t.label;
            return (
              <button
                key={t.key}
                type="button"
                class={`ithome-subtab${active ? " ithome-subtab-active" : ""}`}
                onClick={() => setIthomeViewMode(t.key)}
              >
                <span class="ithome-subtab-icon"><t.Icon size={14} /></span>
                <span class="ithome-subtab-label">{label}</span>
              </button>
            );
          })}
        </div>
        <input
          id="ithome-search-input"
          class="ithome-search-input"
          type="search"
          placeholder="搜索标题、分类…"
          value={search}
          onInput={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
}

export default NewsHeader;
