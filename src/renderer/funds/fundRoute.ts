/**
 * src/renderer/funds/fundRoute.js
 *
 * 2026-07-14 计划 §1.2 / §3 Phase 1 — 基金模块内部页面路由 signals.
 *
 * 设计分解 (与现有 fundView 共存, 不合并):
 *   - fundPage         ∈ 'dashboard' | 'list'                顶级子视图 (InvestLayoutHeader 二级 tab)
 *   - fundView         ∈ 'all' | 'watch'                     列表页内的次级筛选 (保持旧 API)
 *   - selectedFundCode ∈ string | null                      列表行下钻到 detail 的目标 code
 *
 * 2026-07-14 后续调整: 移除原计划中的「交易」tab (当前环境不下单, 也无手动记账需求),
 *   保留 dashboard / list 两个 tab.
 *
 * 单一真相: 三个 signal 都在这里, 其它模块读 signal, 调 action.
 *   切换 fundPage 时自动清掉 selectedFundCode, 避免 detail 残留到 dashboard.
 *
 * ponytail: detail 不是一个独立 fundPage, 而是 list 的下钻 — 通过 selectedFundCode
 *   进入, FundList 检查到非空就渲染 FundDetail, 返回时把 selectedFundCode 清掉.
 *   避免 fundPage 加 'detail' 分支导致 Header tab 与 detail 不同步.
 */

import { signal } from "@preact/signals";

export const fundPage = signal("dashboard");
export const selectedFundCode = signal(null);

export function setFundPage(page) {
  if (page !== "dashboard" && page !== "list") return;
  fundPage.value = page;
  // 切页时清掉下钻状态 — detail 严格属于 list 内部
  if (selectedFundCode.value) selectedFundCode.value = null;
}

export function openFundDetail(code) {
  if (!code) return;
  selectedFundCode.value = String(code);
}

export function closeFundDetail() {
  selectedFundCode.value = null;
}

export const FUND_PAGE_TABS = [
  { key: "dashboard", label: "概览" },
  { key: "list", label: "列表" },
];
