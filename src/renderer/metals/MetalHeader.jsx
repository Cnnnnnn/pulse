/**
 * src/renderer/metals/MetalHeader.jsx
 *
 * 模块头: 标题块 (medal + 贵金属 + 副标) + 市场状态徽标 (实时行情) + 刷新按钮.
 *
 * 纯行情看板: 不再展示总市值/总盈亏/今日预估 (持仓语义, 已移除).
 * 刷新: 内联 loading (更新中… 禁用) + 完成后 toast「行情已更新 HH:MM」.
 */
import { useState } from "preact/hooks";
import { schedulerState, refreshNow } from "./metalStore.js";
import { IconMedal, IconRefresh } from "../components/icons.jsx";
import { showToast } from "../store.js";

function formatTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit", minute: "2-digit",
  });
}

export function MetalHeader() {
  const state = schedulerState.value;
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshNow();
      const hhmm = formatTime(Date.now());
      showToast(`行情已更新 ${hhmm}`, "info", 2600);
    } catch {
      showToast("刷新失败, 请重试", "warn", 2600);
    } finally {
      setRefreshing(false);
    }
  };

  const running = state.status === "running" || refreshing;

  return (
    <header class="metals-header feature-header">
      <div class="metals-header-title">
        <span class="metals-header-medal">
          <IconMedal size={20} />
        </span>
        <div>
          <h1>贵金属</h1>
          <div class="metals-header-sub">国内积存金 · 国际贵金属行情</div>
        </div>
      </div>

      <div class="metals-header-right">
        <span class="metals-badge open" aria-label="实时行情">
          <span class="metals-badge-led" />
          实时行情
        </span>
        <button
          class="btn btn-ghost btn-sm metals-refresh-btn"
          onClick={handleRefresh}
          disabled={running}
          aria-label={running ? "更新中" : "刷新行情"}
        >
          <IconRefresh size={14} />
          {running ? "更新中…" : "刷新"}
        </button>
      </div>
    </header>
  );
}

export default MetalHeader;
