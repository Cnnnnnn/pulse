/**
 * src/renderer/wechat-hot/components/WechatHotHeader.jsx
 *
 * 标题 + 副标题 + 刷新按钮 + 搜索框 + 错误 banner.
 * 搜索状态由 Layout 持有并通过 props 传入, 其余展示数据全部从 store signals 直接读.
 */
import { useNowTick } from "../../hooks/useNowTick.jsx";
import {
  refreshWechatHot,
  wechatHotError,
  wechatHotItems,
  wechatHotLastFetched,
  wechatHotLastRefreshAt,
  wechatHotLoading,
} from "../store.js";
import { formatCooldown, formatTime } from "../utils.js";
import { IconFlame, IconRefresh } from "../../components/icons.jsx";

const COOLDOWN_MS = 15000;
const SOURCE = "xxapi";

export function WechatHotHeader({ search = "", onSearchChange = () => {} } = {}) {
  const now = useNowTick(1000);

  const itemCount = wechatHotItems.value.length;
  const lastFetched = wechatHotLastFetched.value;
  const error = wechatHotError.value;
  const cooling = now - wechatHotLastRefreshAt.value < COOLDOWN_MS;
  const remaining = cooling
    ? Math.max(1, Math.ceil((COOLDOWN_MS - (now - wechatHotLastRefreshAt.value)) / 1000))
    : 0;

  return (
    <header class="wechat-hot-header">
      <div class="wechat-hot-header-row">
        <h1 class="wechat-hot-header-title"><IconFlame size={18} /> 微博热搜</h1>
      </div>
      <div class="wechat-hot-header-subtitle">
        微博热搜榜 · API: {SOURCE} · {itemCount} 条 · 更新于 {formatTime(lastFetched)}
      </div>
      <div class="wechat-hot-header-toolbar">
        <button
          type="button"
          class="wechat-hot-header-refresh"
          disabled={cooling || wechatHotLoading.value}
          onClick={refreshWechatHot}
        >
          {cooling ? formatCooldown(COOLDOWN_MS - (now - wechatHotLastRefreshAt.value)) : <><IconRefresh size={14} /> 刷新</>}
        </button>
        <input
          id="wechat-hot-search-input"
          type="search"
          placeholder="搜索热搜……"
          value={search}
          onInput={(e) => onSearchChange(e.currentTarget.value)}
        />
      </div>
      {error ? (
        <div class="wechat-hot-header-error" role="alert">
          {error}
        </div>
      ) : null}
    </header>
  );
}

export default WechatHotHeader;
