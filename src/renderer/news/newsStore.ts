/**
 * 新闻 tab 全局状态 — 助手跳转 sub-tab 用.
 */
import { signal } from "@preact/signals";

export type NewsSubTabId = "ithome" | "finance" | "wechat-hot";

export const newsSubTab = signal<NewsSubTabId>("ithome");

export function setNewsSubTab(tab: string) {
  if (tab === "ithome" || tab === "finance" || tab === "wechat-hot") {
    newsSubTab.value = tab;
  }
}
