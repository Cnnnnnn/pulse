/**
 * src/renderer/wechat-hot/components/WechatHotHeader.jsx
 *
 * 标题 + 副标题 + 刷新按钮 + 搜索框 + 错误 banner.
 * 冷却计时器: 1s tick, 用 setInterval 监听 now().
 */
import { useEffect, useState } from "preact/hooks";
import {
  refreshWechatHot,
  wechatHotError,
  wechatHotLastRefreshAt,
  wechatHotLoading,
} from "../store.js";

const COOLDOWN_MS = 15000;

function formatTime(ms) {
  if (!ms || typeof ms !== "number") return "—";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function WechatHotHeader({
  itemCount = 0,
  source = "tenhot",
  lastFetched = 0,
  query = "",
  onQueryChange = () => {},
} = {}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cooling = now - wechatHotLastRefreshAt.value < COOLDOWN_MS;
  const remaining = cooling
    ? Math.max(1, Math.ceil((COOLDOWN_MS - (now - wechatHotLastRefreshAt.value)) / 1000))
    : 0;

  const error = wechatHotError.value;

  return (
    <header class="wechat-hot-header">
      <div class="wechat-hot-header-row">
        <h1 class="wechat-hot-header-title">📈 微信热搜</h1>
      </div>
      <div class="wechat-hot-header-subtitle">
        微信指数 · API: {source} · {itemCount} 条 · 更新于 {formatTime(lastFetched)}
      </div>
      <div class="wechat-hot-header-toolbar">
        <button
          type="button"
          class="wechat-hot-header-refresh"
          disabled={cooling || wechatHotLoading.value}
          onClick={() => { refreshWechatHot(); }}
        >
          {cooling ? `冷却 ${remaining}s` : "↻ 刷新"}
        </button>
        <input
          id="wechat-hot-search-input"
          type="search"
          placeholder="搜索热搜……"
          value={query}
          onInput={(e) => onQueryChange(e.currentTarget.value)}
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