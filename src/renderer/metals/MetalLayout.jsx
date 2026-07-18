/**
 * src/renderer/metals/MetalLayout.jsx
 *
 * 纯行情看板: Header + DataBanner + 单栏行情榜 (占满宽).
 * 点某行 → ModalShell 弹窗展示该品种详情 (K线/指标). 不再常驻双栏.
 *
 * 纯行情数据看板 — 不含交易下单 / 持仓记账.
 *
 * 投资 nav 合并 (2026-07-13): 拆出 MetalContent (无副作用) 给 InvestLayout 用,
 * MetalLayout 保留为 (init effect + MetalContent) 复合 wrapper.
 */
import { useEffect, useState } from "preact/hooks";
// ponytail 2026-07-18 P7-audit-fix: metals 模块专属 CSS (T7 fixup 误进 stocks.css
//   的 580 行 + 补 3 个缺失 class). import 模式同 src/renderer/stocks/stocks.css.
import "./metals.css";
import { MetalHeader } from "./MetalHeader.jsx";
import { MetalWatchlist } from "./MetalWatchlist.jsx";
import { MetalDetail } from "./MetalDetail.jsx";
import {
  initMetalStore, cleanupMetalStore,
} from "./metalStore.js";

/** 示例数据中性提示 (常驻, 非交易向沙箱横幅). */
function DataBanner() {
  return (
    <div class="metals-databanner" role="note">
      <span class="metals-databanner-pill">示例数据</span>
      <span>行情为演示/抓取数据, 仅用于界面展示, 不构成任何交易建议</span>
    </div>
  );
}

/**
 * 投资 nav 合并 (2026-07-13): MetalContent 不再触发 init/cleanup,
 * 由 InvestLayout 统一负责. 保留 local state (openMetalId) 给 Modal 弹窗用.
 */
export function MetalContent() {
  // 点行 → 打开详情弹窗 (openMetalId = 选中的品种 id, null = 关闭)
  const [openMetalId, setOpenMetalId] = useState(null);

  return (
    <div class="metals-layout">
      <DataBanner />
      <MetalHeader />
      <main class="metals-main">
        <MetalWatchlist onSelect={setOpenMetalId} />
      </main>
      {openMetalId && (
        <MetalDetail metalId={openMetalId} onClose={() => setOpenMetalId(null)} />
      )}
    </div>
  );
}

export function MetalLayout() {
  useEffect(() => {
    initMetalStore();
    return () => cleanupMetalStore();
  }, []);

  return <MetalContent />;
}

export default MetalLayout;
