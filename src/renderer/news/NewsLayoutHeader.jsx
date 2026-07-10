/**
 * src/renderer/news/NewsLayoutHeader.jsx
 *
 * P-N+ "新闻" tab 顶部统一单层 header — 接管:
 *   - 品牌: 新闻 + 实时 context (条目数 / 上次刷新 / 错误)
 *   - sub-tabs: IT 新闻 / 微博热搜 (主) + IT 分支下的 本月新闻 / 收藏 (二级, 在 sub-tabs 旁)
 *   - search 输入框 (focus id 跟当前 sub-tab 走, 跟 AppShell Cmd+F 拦截对齐)
 *   - refresh 按钮 (派发到当前 sub-tab 的刷新函数)
 *
 * 所有渲染态直接从各自 store 信号读, 不再 props 钻数据 (除 search / 当前 sub-tab).
 *
 * ponytail: 不用 FeatureHeader — 这里需要 2 行 + 自定义布局, 直接 header 元素更紧凑.
 */
import { useNowTick } from "../hooks/useNowTick.jsx";
import {
  ithomeNewsLoading,
  ithomeNewsTs,
  ithomeNewsError,
  ithomeViewMode,
  ithomeFavorites,
  setIthomeViewMode,
  refreshIthomeNews,
} from "../ithome/store.js";
import { currentMonthLabel, favoriteCount } from "../ithome/news-utils.js";
import {
  wechatHotLoading,
  wechatHotItems,
  wechatHotLastFetched,
  wechatHotLastRefreshAt,
  wechatHotError,
  refreshWechatHot,
} from "../wechat-hot/store.js";
import { formatCooldown, formatTime } from "../wechat-hot/utils.js";
import { IconNews, IconRefresh } from "../components/icons.jsx";
import { SubtabList } from "../components/SubtabList.jsx";

const COOLDOWN_MS = 15000;

const NEWS_SUBTABS = [
  { key: "ithome", label: "IT 新闻" },
  { key: "wechat-hot", label: "微博热搜" },
];

const ITHOME_VIEW_TABS = [
  { key: "news", label: "本月新闻" },
  { key: "favorites", label: "收藏" },
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

export function NewsLayoutHeader({
  subTab,
  onSubTabChange,
  search,
  onSearchChange,
}) {
  const now = useNowTick(1000);

  // ponytail: 微博热搜刷新带 15s cooldown, IT 没有 — UI 上同步体现.
  const weiboCooling = now - wechatHotLastRefreshAt.value < COOLDOWN_MS;
  const weiboRemaining = weiboCooling
    ? COOLDOWN_MS - (now - wechatHotLastRefreshAt.value)
    : 0;
  const itLoading = ithomeNewsLoading.value;
  const weiboLoading = wechatHotLoading.value;
  const isFavorites = ithomeViewMode.value === "favorites" && subTab === "ithome";
  const favTotal = favoriteCount(ithomeFavorites.value);

  function handleRefresh() {
    if (subTab === "wechat-hot") refreshWechatHot();
    else refreshIthomeNews();
  }

  // ponytail: 副标题随 sub-tab 切 — 单行内同一个 slot, 不堆叠.
  let subText;
  let error = null;
  if (subTab === "wechat-hot") {
    const items = wechatHotItems.value;
    error = wechatHotError.value || null;
    subText = `微博热搜榜 · ${items.length} 条 · 更新于 ${formatTime(wechatHotLastFetched.value)}`;
  } else if (isFavorites) {
    error = null;
    subText = `收藏 ${favTotal} 篇 · 永久保留`;
  } else {
    error = ithomeNewsError.value || null;
    subText = `IT 之家 · ${currentMonthLabel()} · 更新于 ${formatTs(ithomeNewsTs.value)}`;
  }

  const searchInputId =
    subTab === "wechat-hot" ? "wechat-hot-search-input" : "ithome-search-input";
  const searchPlaceholder =
    subTab === "wechat-hot" ? "搜索热搜……" : "搜索标题、分类…";

  return (
    <header class="news-header">
      <div class="news-header-row">
        <div class="news-header-brand">
          <span class="news-header-icon" aria-hidden="true">
            <IconNews size={18} />
          </span>
          <h2 class="news-header-title">新闻</h2>
          <span class="news-header-sub">{subText}</span>
        </div>
        <div class="news-header-actions">
          <button
            type="button"
            class={`news-refresh-btn${itLoading || weiboLoading ? " is-loading" : ""}${subTab === "wechat-hot" && weiboCooling ? " is-cooling" : ""}`}
            onClick={handleRefresh}
            disabled={itLoading || weiboLoading || (subTab === "wechat-hot" && weiboCooling)}
            title={subTab === "wechat-hot" ? "拉取微博热搜" : "拉取当前日期 IT 新闻"}
            aria-label={subTab === "wechat-hot" ? "拉取微博热搜" : "拉取当前日期 IT 新闻"}
          >
            <span class="news-refresh-icon" aria-hidden="true">
              <IconRefresh size={14} />
            </span>
            {subTab === "wechat-hot" && weiboCooling && (
              <span class="news-refresh-text">{formatCooldown(weiboRemaining)}</span>
            )}
          </button>
          <input
            id={searchInputId}
            class="news-search-input"
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onInput={(e) => onSearchChange(e.currentTarget.value)}
            aria-label="新闻搜索"
          />
        </div>
      </div>

      <div class="news-header-row news-header-row-tabs">
        <SubtabList
          prefix="news"
          tabs={NEWS_SUBTABS}
          activeKey={subTab}
          onChange={onSubTabChange}
          ariaLabel="新闻子视图切换"
        >
          {(t) => <span>{t.label}</span>}
        </SubtabList>
        {subTab === "ithome" && (
          <SubtabList
            prefix="ithome"
            tabs={ITHOME_VIEW_TABS}
            activeKey={isFavorites ? "favorites" : "news"}
            onChange={(k) => setIthomeViewMode(k)}
            ariaLabel="IT 新闻视图切换"
          >
            {(t) => {
              const label =
                t.key === "favorites" && favTotal > 0 ? `${t.label} (${favTotal})` : t.label;
              return <span>{label}</span>;
            }}
          </SubtabList>
        )}
      </div>

      {error && (
        <div class="news-header-error" role="alert">
          {error}
        </div>
      )}
    </header>
  );
}

export { NEWS_SUBTABS };

export default NewsLayoutHeader;
