/**
 * src/renderer/ithome/NewsLayout.jsx
 *
 * 顶栏 + 左侧日期栏 + 右侧资讯列表（对齐世界杯/基金模块结构）
 */

import { useEffect, useState } from "preact/hooks";
import { NewsHeader } from "./NewsHeader.jsx";
import { NewsSidebar } from "./NewsSidebar.jsx";
import { NewsView } from "./NewsView.jsx";
import { bootstrapIthomeTab, refreshIthomeNews } from "./store.js";

export function NewsLayout() {
  const [search, setSearch] = useState("");

  useEffect(() => {
    bootstrapIthomeTab();
  }, []);

  return (
    <div class="ithome-layout">
      <NewsHeader
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => refreshIthomeNews()}
      />
      <div class="ithome-body">
        <NewsSidebar />
        <div class="ithome-main">
          <NewsView
            search={search}
            onRefresh={() => refreshIthomeNews()}
          />
        </div>
      </div>
    </div>
  );
}

export default NewsLayout;
