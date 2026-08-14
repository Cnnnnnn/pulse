/**
 * src/renderer/ithome/IthomeContent.jsx
 *
 * P-N+ "新闻" tab 用的 IT 分支组件: 仅 sidebar + view, 不含 header.
 * header / 搜索框 / 刷新按钮 / view-mode 切换 都上交给 NewsLayoutHeader 统一渲染.
 *
 * 新闻阅读工作台由 NewsView 负责队列 + 阅读器，侧栏仍负责日期筛选。
 * 搜索词从 NewsLayout 注入，保持跨模块的 Header 结构不变。
 */
import { useEffect } from "preact/hooks";
import { bootstrapIthomeTab } from "./store.ts";
import { NewsSidebar } from "./NewsSidebar.tsx";
import { NewsView } from "./NewsView.tsx";

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
