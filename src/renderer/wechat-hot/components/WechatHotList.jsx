/**
 * src/renderer/wechat-hot/components/WechatHotList.jsx
 *
 * 热搜列表：每行一个 button, 点击通过 openExternal 打开原文 URL.
 * 支持 query prop 做大小写不敏感子串过滤. 空数据 / 过滤为空时显示 "暂无数据".
 */

import { openExternal } from "../../utils/external-link.js";

const EMPTY_TEXT = "暂无数据";

export function WechatHotList({ items = [], query = "" } = {}) {
  const q = typeof query === "string" ? query.trim().toLowerCase() : "";
  const filtered = q
    ? items.filter((it) => typeof it?.title === "string" && it.title.toLowerCase().includes(q))
    : items;
  if (filtered.length === 0) {
    return <div className="wechat-hot-list-empty">{EMPTY_TEXT}</div>;
  }
  return (
    <ul className="wechat-hot-list">
      {filtered.map((it) => (
        <li key={it.url}>
          <button
            type="button"
            className="wechat-hot-list-row"
            onClick={() => {
              if (it.url) openExternal(it.url);
            }}
          >
            <span className="wechat-hot-list-rank">{it.rank}</span>
            <span className="wechat-hot-list-title">{it.title}</span>
            {it.tag ? <span className="wechat-hot-list-tag">{it.tag}</span> : null}
            {it.heat ? <span className="wechat-hot-list-heat">{it.heat}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default WechatHotList;