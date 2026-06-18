/**
 * src/renderer/wechat-hot/components/WechatHotLayout.jsx
 *
 * 顶层容器: bootstrap + subscribe on mount, cleanup on unmount,
 * 持有 search state, 渲染 Header + List.
 *
 * 注意: 真正的过滤在 WechatHotList 中执行 (query prop).
 * Layout 只根据 items / loading / error / query 推导出一个 reason,
 * 让 List 决定空态文案. 这避免了双层过滤逻辑.
 */
import { useEffect, useState } from "preact/hooks";
import {
  bootstrapWechatHotTab,
  cleanupWechatHotUpdates,
  subscribeWechatHotUpdates,
  wechatHotError,
  wechatHotItems,
  wechatHotLoading,
} from "../store.js";
import { WechatHotHeader } from "./WechatHotHeader.jsx";
import { WechatHotList } from "./WechatHotList.jsx";

function titleMatches(item, q) {
  return typeof item?.title === "string" && item.title.toLowerCase().includes(q);
}

export function WechatHotLayout() {
  const [search, setSearch] = useState("");

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
  const q = search.trim().toLowerCase();
  const hasAnyMatch = q ? items.some((it) => titleMatches(it, q)) : true;

  let reason = "empty";
  if (loading && items.length === 0) {
    reason = "loading";
  } else if (error && items.length === 0) {
    reason = "error";
  } else if (items.length === 0) {
    reason = "empty";
  } else if (!hasAnyMatch) {
    reason = "no-match";
  }

  return (
    <div class="wechat-hot-layout">
      <WechatHotHeader search={search} onSearchChange={setSearch} />
      <div class="wechat-hot-body">
        <WechatHotList items={items} query={search} reason={reason} />
      </div>
    </div>
  );
}

export default WechatHotLayout;