/**
 * src/renderer/wechat-hot/components/WechatHotList.jsx
 *
 * 热搜列表：每行一个 button, 点击通过 openExternal 打开原文 URL.
 * 支持 query prop 做大小写不敏感子串过滤.
 * 通过 reason prop 区分 4 种空态: loading / empty / no-match / error.
 * 具体在组件里只渲染提示文案, 状态机由 Header / Layout 编排.
 */

import { openExternal } from "../../utils/external-link.js";

const EMPTY_TEXT = {
  empty: "暂无热搜数据",
  loading: "正在拉取热搜…",
  error: "拉取失败",
};

/** 根据 rank 返回 CSS 修饰类: 1-3 用醒目色, 11+ 用浅色 tail, 其他无修饰 */
function rankClass(rank) {
  if (rank === 1) return "rank-1";
  if (rank === 2) return "rank-2";
  if (rank === 3) return "rank-3";
  if (typeof rank === "number" && rank >= 11) return "rank-tail";
  return "";
}

export function WechatHotList({ items = [], query = "", reason = "empty" } = {}) {
  const q = typeof query === "string" ? query.trim().toLowerCase() : "";
  const filtered = q
    ? items.filter((it) => typeof it?.title === "string" && it.title.toLowerCase().includes(q))
    : items;
  if (filtered.length === 0) {
    let text;
    if (reason === "no-match" && q) {
      text = `未找到「${query}」`;
    } else if (reason === "no-match") {
      text = EMPTY_TEXT.empty;
    } else {
      text = EMPTY_TEXT[reason] || EMPTY_TEXT.empty;
    }
    return <div class="wechat-hot-list-empty">{text}</div>;
  }
  return (
    <ul class="wechat-hot-list">
      {filtered.map((it) => (
        <li key={it.url}>
          <button
            type="button"
            class="wechat-hot-list-row"
            aria-label={`打开热搜：${it.title}`}
            onClick={() => {
              if (it.url) openExternal(it.url);
            }}
          >
            <span class={`wechat-hot-list-rank ${rankClass(it.rank)}`}>{it.rank}</span>
            <span class="wechat-hot-list-title">{it.title}</span>
            {it.tag ? <span class="wechat-hot-list-tag">{it.tag}</span> : null}
            {it.heat ? <span class="wechat-hot-list-heat">{it.heat}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default WechatHotList;