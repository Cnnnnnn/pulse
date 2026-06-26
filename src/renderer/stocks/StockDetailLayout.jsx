/**
 * src/renderer/stocks/StockDetailLayout.jsx
 *
 * 个股 AI 分析 tab 容器. 提供一个"打开抽屉"按钮 (抽屉内是核心 UI).
 * 阶段四: 抽屉本体在 StockDetailDrawer.jsx, 这里只负责挂空态 + 抽屉壳.
 */
import { PanelEmpty } from "../components/EmptyState.jsx";
import { IconSearch } from "../components/icons.jsx";
import { api } from "../api.js";
import { detailOpen } from "./stockDetailStore.js";
import { StockDetailDrawer } from "./StockDetailDrawer.jsx";

export function StockDetailLayout() {
  return (
    <div class="stock-layout">
      <PanelEmpty
        className="stock-empty-state"
        icon={<IconSearch size={32} />}
        title="个股 AI 分析"
        hint="选 1+ 个分析角度 (价格/估值/盈利/资金/技术/新闻), AI 按真实数据客观解读该股票."
        action={(
          <button
            type="button"
            class="stock-btn stock-btn-primary stock-btn-lg stock-detail-open"
            onClick={() => { detailOpen.value = true; }}
          >
            🚀 打开分析抽屉
          </button>
        )}
      />
      <StockDetailDrawer api={api} />
    </div>
  );
}

export default StockDetailLayout;
