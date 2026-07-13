/**
 * src/renderer/metals/MetalLayout.jsx
 *
 * 纯行情看板: Header + DataBanner + 单栏行情榜 (占满宽).
 * 点某行 → ModalShell 弹窗展示该品种详情 (K线/指标). 不再常驻双栏.
 *
 * 纯行情数据看板 — 不含交易下单 / 持仓记账.
 */
import { useEffect, useState } from "preact/hooks";
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

export function MetalLayout() {
  useEffect(() => {
    initMetalStore();
    return () => cleanupMetalStore();
  }, []);

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

export default MetalLayout;
