/**
 * src/renderer/wechat-hot/components/WechatHotContent.jsx
 *
 * P-N+ "新闻" tab 用的微博热搜分支: 仅 List, 不含 header.
 * 跟旧 WechatHotLayout 的区别: 去掉 header, error banner 上交 NewsLayoutHeader.
 *
 * ponytail: 沿用 WechatHotList, 理由态 (loading/empty/no-match) 还在 List 里渲染,
 * 这里只负责订阅 + 错误早期返回 (spec §4.4: error + items 空 → 仅顶部 banner).
 */
import { useEffect } from "preact/hooks";
import {
  bootstrapWechatHotTab,
  cleanupWechatHotUpdates,
  subscribeWechatHotUpdates,
  wechatHotError,
  wechatHotItems,
  wechatHotLoading,
  wechatHotReadIds,
  markWechatHotRead,
} from "../store.js";
import { WechatHotList } from "./WechatHotList.jsx";

function titleMatches(item, q) {
  return typeof item?.title === "string" && item.title.toLowerCase().includes(q);
}

export function WechatHotContent({ search = "" }) {
  useEffect(() => {
    bootstrapWechatHotTab();
    subscribeWechatHotUpdates();
    return () => {
      cleanupWechatHotUpdates();
    };
  }, []);

  const items = wechatHotItems.value;
  const loading = wechatHotLoading.value;
  const error = wechatHotError.value;
  const readIds = wechatHotReadIds.value;
  const q = search.trim().toLowerCase();
  const hasAnyMatch = q ? items.some((it) => titleMatches(it, q)) : true;

  if (error && items.length === 0) {
    return (
      <div class="wechat-hot-list-empty wechat-hot-list-empty-error">
        {error}
      </div>
    );
  }

  let reason = "empty";
  if (loading && items.length === 0) reason = "loading";
  else if (items.length === 0) reason = "empty";
  else if (!hasAnyMatch) reason = "no-match";

  return (
    <WechatHotList
      items={items}
      query={search}
      reason={reason}
      readIds={readIds}
      onMarkRead={markWechatHotRead}
    />
  );
}

export default WechatHotContent;
