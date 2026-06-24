/**
 * src/renderer/components/AIUsageLayout.jsx
 *
 * AI 用量页面的 layout 容器 (v2.13).
 * 跟 FundLayout 同级 — 完全独立 tab, 切到此 layout 时:
 *   - 订阅 ai-usage-updated 事件
 *   - 加载 last-known snapshot
 */

import { useEffect } from "preact/hooks";
import {
  loadAiUsageCached,
  subscribeAiUsageUpdates,
  aiUsageAlertModalOpen,
} from "../store/ai-usage-store.js";
import { AIUsagePage } from "./AIUsagePage.jsx";
import { AIUsageAlertModal } from "./AIUsageAlertModal.jsx";

export function AIUsageLayout() {
  useEffect(() => {
    subscribeAiUsageUpdates();
    void loadAiUsageCached();
  }, []);

  return (
    <div class="ai-usage-layout">
      <AIUsagePage />
      {aiUsageAlertModalOpen.value && <AIUsageAlertModal />}
    </div>
  );
}

export default AIUsageLayout;
