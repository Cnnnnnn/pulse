/**
 * src/renderer/wechat-hot/components/WechatHotLayout.jsx
 *
 * 顶层容器: bootstrap + subscribe on mount, cleanup on unmount,
 * 持有 search state, 渲染 Header + List.
 */
import { useEffect, useState } from "preact/hooks";
import {
  bootstrapWechatHotTab,
  subscribeWechatHotUpdates,
  cleanupWechatHotUpdates,
  wechatHotItems,
} from "../store.js";
import { WechatHotHeader } from "./WechatHotHeader.jsx";
import { WechatHotList } from "./WechatHotList.jsx";

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
  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((it) => it?.title && it.title.toLowerCase().includes(q)) : items;

  let reason = "empty";
  if (items.length === 0) reason = "empty";
  else if (filtered.length === 0) reason = "no-match";

  return (
    <div class="wechat-hot-layout">
      <WechatHotHeader search={search} onSearchChange={setSearch} />
      <div class="wechat-hot-list">
        <WechatHotList items={filtered} query={search} reason={reason} />
      </div>
    </div>
  );
}

export default WechatHotLayout;