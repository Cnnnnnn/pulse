/**
 * tests/main/finance/ipc-contract.test.ts
 *
 * QA 独立验证：财经 IPC 四端命名一致性。
 * 直接读取源码文本，断言 9 个 invoke 通道 + 2 个广播通道在
 * register-finance.ts（主进程 handler）/ preload.ts（桥）/ api.ts（封装层）/
 * 渲染层（financeStore.ts + FinanceArticleView.tsx）四端命名完全一致。
 *
 * 注：get-article 由 FinanceArticleView.tsx 消费（详情页懒加载），
 * 不由 financeStore.ts 消费；get-quotes 在 store 中跨行书写（api\n.financeGetQuotes()），
 * 故渲染端匹配统一在「store ∪ view」上做空白归一化后比对。
 *
 * 另：preload ↔ api 顶层 key 覆盖由 tests/main/preload-api-contract.test.ts 保证。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "../../../");
const regSrc = readFileSync(resolve(root, "src/main/ipc/register-finance.ts"), "utf-8");
const preSrc = readFileSync(resolve(root, "preload.ts"), "utf-8");
const apiSrc = readFileSync(resolve(root, "src/renderer/api.ts"), "utf-8");
const storeSrc = readFileSync(resolve(root, "src/renderer/finance/financeStore.ts"), "utf-8");
const viewSrc = readFileSync(resolve(root, "src/renderer/finance/FinanceArticleView.tsx"), "utf-8");

// 渲染端源码（store ∪ view），空白归一化，便于匹配跨行书写
const rendererNorm = `${storeSrc}\n${viewSrc}`.replace(/\s+/g, " ");

// channel -> 渲染侧 api key（驼峰）
const INVOKE: [string, string][] = [
  ["finance:refresh-news", "financeRefreshNews"],
  ["finance:get-news", "financeGetNews"],
  ["finance:get-article", "financeGetArticle"],
  ["finance:refresh-quotes", "financeRefreshQuotes"],
  ["finance:get-quotes", "financeGetQuotes"],
  ["finance:toggle-favorite", "financeToggleFavorite"],
  ["finance:mark-read", "financeMarkRead"],
  ["finance:categories", "financeGetCategories"],
  ["finance:get-related", "financeGetRelated"],
  ["finance:interpret", "financeInterpret"],
  ["finance:interpret-clear", "financeInterpretClear"],
  ["finance:aggregate", "financeAggregate"],
];
const BROADCAST: [string, string][] = [
  ["finance:news-updated", "onFinanceNewsUpdated"],
  ["finance:quotes-updated", "onFinanceQuotesUpdated"],
];

function rendererWires(apiKey: string): boolean {
  // 渲染层以 `.<apiKey>` 形式调用（兼容 api.financeXxx 与 api\n.financeXxx 跨行书写）
  return rendererNorm.includes(`.${apiKey}`);
}

describe("finance IPC 四端契约一致性", () => {
  for (const [channel, apiKey] of INVOKE) {
    it(`invoke 通道 ${channel} 四端一致`, () => {
      // 1) 主进程 handler 注册
      expect(regSrc).toContain(`safeHandle("${channel}"`);
      // 2) preload 桥 invoke
      expect(preSrc).toContain(`ipcRenderer.invoke("${channel}"`);
      // 3) api.ts 封装层暴露同名 key
      expect(apiSrc).toContain(`pick(overrides, "${apiKey}"`);
      // 4) 渲染层调用（store 或 详情页）
      expect(rendererWires(apiKey)).toBe(true);
    });
  }

  for (const [channel, apiKey] of BROADCAST) {
    it(`广播通道 ${channel} 四端一致`, () => {
      // 1) 主进程常量定义
      expect(regSrc).toContain(`= "${channel}"`);
      // 2) preload 桥 on 订阅
      expect(preSrc).toContain(`ipcRenderer.on("${channel}"`);
      // 3) api.ts 封装层暴露同名 key
      expect(apiSrc).toContain(`pick(overrides, "${apiKey}"`);
      // 4) 渲染层订阅
      expect(rendererWires(apiKey)).toBe(true);
    });
  }

  it("财经通道总数：12 invoke + 2 广播", () => {
    expect(INVOKE.length).toBe(12);
    expect(BROADCAST.length).toBe(2);
  });
});
