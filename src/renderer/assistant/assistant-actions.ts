/**
 * src/renderer/assistant/assistant-actions.ts
 *
 * Renderer 侧 AI 助手工具执行（导航、搜索、检查等）.
 */

import { showToast } from "../store/toast-store.ts";
import { openConfirm } from "../store/confirmStore.ts";
import { checkToolPolicy } from "../../shared/assistant-tool-policy.ts";
import { normalizeUiAction } from "../../shared/pulse-href.ts";
import {
  CONFIRM_MESSAGE_BUILDERS,
  RENDERER_ACTION_HANDLERS,
} from "./assistant-action-handlers.ts";
import type { AiChatAction } from "../../shared/ipc-contracts";

export async function executeRendererActions(actions: AiChatAction[]) {
  for (const action of actions) {
    try {
      await executeOne(action);
    } catch (err: unknown) {
      showToast(
        `操作失败 (${action.tool}): ${err instanceof Error ? err.message : String(err)}`,
        "error",
        4000,
      );
    }
  }
}

export async function executeRendererAction(action: AiChatAction) {
  await executeOne(action);
}

async function executeOne(action: AiChatAction) {
  const normalized = normalizeUiAction(action);
  const params = normalized.params || {};
  // 策略校验: deny 拒绝; confirm 弹确认; allow 直接执行.
  // 主进程侧 Agent 循环已过滤一遍, 这里是渲染层第二道闸 —— 队列面板 / 工具卡片 /
  // 系统消息 / 快捷栏等入口直连本函数, 不经过 Agent 循环。
  const verdict = checkToolPolicy(normalized.tool, params);
  if (verdict.kind === "deny") {
    showToast(`操作被拒绝: ${verdict.reason}`, "error", 3000);
    return;
  }
  if (verdict.kind === "confirm") {
    const buildConfirm = CONFIRM_MESSAGE_BUILDERS[normalized.tool];
    const confirmOpts = buildConfirm?.(params);
    if (confirmOpts) {
      const ok = await openConfirm(confirmOpts);
      if (!ok) {
        showToast("已取消操作", "info", 2000);
        return;
      }
    }
  }
  const handler = RENDERER_ACTION_HANDLERS[normalized.tool];
  if (!handler) return;
  await handler(params);
}
