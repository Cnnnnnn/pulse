/**
 * src/renderer/news/NewsLayout.tsx
 *
 * P-N+ 「新闻」tab 顶层容器 — 单层 header + sub-tab body.
 * header (品牌/sub-tab/搜索/刷新) 在 NewsLayoutHeader, body 由 IthomeContent 或 WechatHotContent
 * 提供 — 不再嵌整个 IthomeLayout/WechatHotLayout, 避免双层 header 的视觉重复.
 *
 * ponytail: 切走即卸载对应内容组件, 原本两个 Layout 的 useEffect cleanup (wechat-hot 订阅)
 * 自动跑, 不引额外的订阅/清理.
 *
 * search 状态在这里 lift up, 因为搜索框在统一 header 而非内容内部 — 切 sub-tab 会重置.
 */
import { useState } from "preact/hooks";
import { NEWS_SUBTABS } from "./NewsLayoutHeader.tsx";
import { NewsLayoutHeader } from "./NewsLayoutHeader.tsx";
import { IthomeContent as IthomeContentRaw } from "../ithome/IthomeContent.tsx";
import { WechatHotContent as WechatHotContentRaw } from "../wechat-hot/components/WechatHotContent.tsx";

// ponytail: 对端仍是宽松 JSX props；ithome/wechat 组件迁完后去掉 cast。
const IthomeContent = IthomeContentRaw as any;
const WechatHotContent = WechatHotContentRaw as any;
import "./NewsLayout.css";

export { NEWS_SUBTABS };

export function NewsLayout() {
  const [subTab, setSubTab] = useState("ithome");
  // ponytail: search 跨 sub-tab 共用反而割裂体验 (微博搜 IT 文章会全部过滤掉), 切 tab 时重置.
  const [search, setSearch] = useState("");
  function handleSubTabChange(next) {
    setSubTab(next);
    setSearch("");
  }
  return (
    <div class="news-layout" data-subtab={subTab}>
      <NewsLayoutHeader
        subTab={subTab}
        onSubTabChange={handleSubTabChange}
        search={search}
        onSearchChange={setSearch}
      />
      <div class="news-layout-body">
        {subTab === "ithome" ? (
          <IthomeContent search={search} />
        ) : (
          <WechatHotContent search={search} />
        )}
      </div>
    </div>
  );
}

export default NewsLayout;
