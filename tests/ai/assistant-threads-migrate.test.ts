/**
 * tests/ai/assistant-threads-migrate.test.ts
 *
 * 历史会话读取迁移 — 清洗旧版本持久化的 MiniMax 原生工具标记.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const { requireAi } = _require("../_setup/require-main.cjs");
const { sanitizePersistedThreads } = requireAi("assistant-threads-migrate");

describe("sanitizePersistedThreads", () => {
  it("清洗 assistant 消息里的完整标记块与杂散残片", () => {
    const threads = [
      {
        id: "t1",
        title: "测试",
        messages: [
          { role: "user", content: "有哪些应用需要更新?", ts: 1 },
          {
            role: "assistant",
            content:
              '我再试一次:<minimax:tool_call>[{"name":"query_apps"}]</minimax:tool_call>:]<minimax>[[]',
            ts: 2,
          },
        ],
      },
    ];
    const out = sanitizePersistedThreads(threads);
    // 残留 = "我再试一次:" + ":#"前的"]" + "[[]" 去掉标记后的散括号
    expect(out[0].messages[1].content).toBe("我再试一次::][[]");
    // user 消息不动
    expect(out[0].messages[0].content).toBe("有哪些应用需要更新?");
  });

  it("无标记的线程原样返回 (不产生新对象)", () => {
    const threads = [
      { id: "t1", messages: [{ role: "assistant", content: "正常回复", ts: 1 }] },
    ];
    const out = sanitizePersistedThreads(threads);
    expect(out[0]).toBe(threads[0]);
  });

  it("非数组 / 畸形条目安全兜底", () => {
    expect(sanitizePersistedThreads(null)).toEqual([]);
    expect(sanitizePersistedThreads(["not-a-thread"])).toEqual(["not-a-thread"]);
    expect(sanitizePersistedThreads([{ id: "t1" }])).toEqual([{ id: "t1" }]);
  });
});
