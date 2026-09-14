/**
 * src/renderer/goofish/store.ts
 *
 * 闲鱼嵌入的全局信号 (v3.3): 未读消息数。
 *
 * 为什么独立于 GoofishLayout: 用户切到别的 tab 时面板会卸载, 但 guest 视图
 * (主进程 WebContentsView) 仍活着, 标题未读数变化经 goofish:unread 推到这里 —
 * 侧栏「闲鱼」徽标在任何 tab 下都要能亮。
 */

import { signal } from "@preact/signals";
import { api } from "../api.ts";
import { showToast } from "../store/toast-store.ts";

/** 闲鱼未读消息数 (来自 guest 页 document.title 的 "(N)" 前缀) */
export const goofishUnreadBadge = signal(0);

export function clearGoofishUnreadBadge() {
  goofishUnreadBadge.value = 0;
}

let installed = false;

/**
 * 订阅主进程的未读数推送。全局装一次 — 与 GoofishLayout 的挂载解耦,
 * 用户在任何 tab 下有新消息时侧栏徽标都会亮。
 */
export function installGoofishUnreadWatch() {
  if (installed) return;
  if (!api || typeof api.onGoofishUnread !== "function") return;
  installed = true;
  api.onGoofishUnread((count: number) => {
    goofishUnreadBadge.value = Number(count) || 0;
  });
  // 系统通知点击 → 切到闲鱼 tab (动态 import 避免 goofish store ← navStore 环)
  if (typeof api.onGoofishOpenRequest === "function") {
    api.onGoofishOpenRequest(() => {
      import("../nav/navStore.ts").then(({ setActiveNav }) =>
        setActiveNav("goofish"),
      );
    });
  }
  // 主进程判定「有新消息该提醒」→ 应用内 toast
  // (macOS 前台常吞掉系统横幅, toast 保证你一定看得到)
  if (typeof api.onGoofishAlert === "function") {
    api.onGoofishAlert((payload: { title?: string; body?: string }) => {
      const msg =
        (payload && payload.body) ||
        (payload && payload.title) ||
        "闲鱼有新消息";
      showToast(msg, "info", 6000);
    });
  }
}
