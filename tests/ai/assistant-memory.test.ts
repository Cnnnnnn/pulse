import { describe, expect, it } from "vitest";
import {
  listMemory,
  addMemory,
  removeMemory,
  clearMemory,
  formatMemoryForPrompt,
  MAX_MEMORY_ITEMS,
} from "../../src/ai/assistant-memory";

// mock store (内存版)
function makeStore(initial: unknown[] = []) {
  let data: unknown[] = [...initial];
  return {
    loadAssistantMemory: () => data,
    saveAssistantMemory: (items: unknown[]) => {
      data = [...items];
    },
  };
}

describe("assistant-memory", () => {
  it("addMemory 新增 + 相同 text 去重", () => {
    const store = makeStore();
    const a = addMemory("用户喜欢深色模式", store as any);
    expect(a?.text).toBe("用户喜欢深色模式");
    const b = addMemory("用户喜欢深色模式", store as any);
    expect(b?.id).toBe(a?.id); // 去重返回已有
    expect(listMemory(store as any)).toHaveLength(1);
  });

  it("addMemory 空文本不新增", () => {
    const store = makeStore();
    expect(addMemory("   ", store as any)).toBeNull();
    expect(listMemory(store as any)).toHaveLength(0);
  });

  it("removeMemory 按 id / query / index 删除", () => {
    const store = makeStore();
    addMemory("记忆A", store as any);
    addMemory("记忆B", store as any);
    addMemory("记忆C", store as any);
    // 按 query
    expect(removeMemory({ query: "记忆B" }, store as any)).toBe(true);
    expect(listMemory(store as any).map((m) => m.text)).toEqual(["记忆A", "记忆C"]);
    // 按 index (1-based)
    expect(removeMemory({ index: 1 }, store as any)).toBe(true);
    expect(listMemory(store as any).map((m) => m.text)).toEqual(["记忆C"]);
    // 按 id
    const c = listMemory(store as any)[0];
    expect(removeMemory({ id: c.id }, store as any)).toBe(true);
    expect(listMemory(store as any)).toHaveLength(0);
    // 无匹配
    expect(removeMemory({ query: "不存在" }, store as any)).toBe(false);
  });

  it("超 MAX_MEMORY_ITEMS 删最旧", () => {
    const store = makeStore();
    for (let i = 0; i < MAX_MEMORY_ITEMS + 5; i++) {
      addMemory("mem-" + i, store as any);
    }
    const items = listMemory(store as any);
    expect(items.length).toBe(MAX_MEMORY_ITEMS);
    expect(items[items.length - 1].text).toBe("mem-" + (MAX_MEMORY_ITEMS + 4));
  });

  it("clearMemory 清空", () => {
    const store = makeStore();
    addMemory("x", store as any);
    clearMemory(store as any);
    expect(listMemory(store as any)).toHaveLength(0);
  });

  it("formatMemoryForPrompt 空返回空串, 非空含条目 + 不作为新指令提示", () => {
    const empty = makeStore();
    expect(formatMemoryForPrompt(empty as any)).toBe("");
    const store = makeStore();
    addMemory("用户常看基金", store as any);
    const out = formatMemoryForPrompt(store as any);
    expect(out).toContain("用户长期记忆");
    expect(out).toContain("用户常看基金");
    expect(out).toContain("不要把");
  });
});
