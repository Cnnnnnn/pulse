/**
 * src/renderer/wechat-hot/components/WechatHotLayout.jsx
 *
 * 顶层容器: bootstrap + subscribe on mount, cleanup on unmount,
 * 持有 search state, 渲染 Header + List.
 *
 * Layout 编排 reason (loading / empty / no-match) 推给 List,
 * 但 "error + items empty" 的失败态 Layout 自己渲染, 避免
 * Header banner 与 List 的 "拉取失败" empty-state 同时出现 (双重重叠).
 *
 * Spec §4.4 期望:
 * - error + items 空 → 仅顶部 banner + body 一个错误空态 (本组件早返回)
 * - error + items 非空 → 顶部 banner, 列表照常显示 (spec 定义的 stale-data 行为)
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

  if (error && items.length === 0) {
    return (
      <div class="wechat-hot-layout">
        <WechatHotHeader search={search} onSearchChange={setSearch} />
        <div class="wechat-hot-body">
          <div class="wechat-hot-list-empty wechat-hot-list-empty-error">
            {error}
          </div>
        </div>
      </div>
    );
  }

  let reason = "empty";
  if (loading && items.length === 0) {
    reason = "loading";
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