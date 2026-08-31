/**
 * 抽屉打开时实时同步 proactive 横幅与 system 消息.
 */
import { effect } from "@preact/signals";
import { globalChatOpen, refreshProactiveState } from "./assistant-store.ts";
import { proactiveSignalToken } from "./assistant-proactive.ts";

let started = false;

export function startAssistantProactiveWatch() {
  if (started) return;
  started = true;
  effect(() => {
    if (!globalChatOpen.value) return;
    proactiveSignalToken.value;
    refreshProactiveState();
  });
}
