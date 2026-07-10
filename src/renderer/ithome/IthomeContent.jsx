/**
 * src/renderer/ithome/IthomeContent.jsx
 *
 * P-N+ "新闻" tab 用的 IT 分支组件: 仅 sidebar + view, 不含 header.
 * header / 搜索框 / 刷新按钮 / view-mode 切换 都上交给 NewsLayoutHeader 统一渲染.
 *
 * ponytail: 沿用 NewsSidebar + NewsView 的现有实现, 不改它们的 props 接口,
 * 也不在这里持有 search 状态 — 搜索词从 NewsLayout 注入即可.
 */
import { useEffect } from "preact/hooks";
import { bootstrapIthomeTab } from "./store.js";
import { NewsSidebar } from "./NewsSidebar.jsx";
import { NewsView } from "./NewsView.jsx";

export function IthomeContent({ search = "", onRefresh }) {
  useEffect(() => {
    bootstrapIthomeTab();
  }, []);
  return (
    <div class="ithome-body">
      <NewsSidebar />
      <div class="ithome-main">
        <NewsView search={search} onRefresh={onRefresh} />
      </div>
    </div>
  );
}

export default IthomeContent;
