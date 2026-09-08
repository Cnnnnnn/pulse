/**
 * tests/ai/assistant-agent.test.ts
 *
 * Agent 循环集成测试 (mock LLM 边界, 真实 splitActions/validateToolCall/
 * appendFcToolResults):
 *   - 续轮继续走 FC (chatWithTools), tool 消息按调用序对齐回注
 *   - 同名并行调用 / 校验被拒调用的结果对齐
 *   - 末轮不再把工具结果原文拼进用户可见回复
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../src/ai/chat-with-tools.ts", () => ({
  chatWithTools: vi.fn(),
}));
vi.mock("../../src/ai/shared-llm.ts", () => ({
  chatCompletion: vi.fn(async () => ({ ok: false, reason: "mocked_off" })),
  resolveSharedAiConfig: vi.fn(() => ({
    ok: true,
    providerId: "openai",
    model: "gpt-mock",
    config: { providerId: "openai", model: "gpt-mock", apiKey: "k" },
  })),
}));
vi.mock("../../src/ai/assistant-tools.ts", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    executeMainTool: vi.fn(),
  };
});

import { MAX_ROUNDS, runAssistantAgent } from "../../src/ai/assistant-agent.ts";
import { chatWithTools } from "../../src/ai/chat-with-tools.ts";
import { executeMainTool } from "../../src/ai/assistant-tools.ts";

const mockedFc = vi.mocked(chatWithTools);
const mockedExec = vi.mocked(executeMainTool);

function fcOk(opts: {
  text?: string;
  calls?: Array<{ id: string; tool: string; params?: Record<string, unknown> }>;
}) {
  const toolCalls = opts.calls?.map((c) => ({
    tool: c.tool,
    params: c.params || {},
  }));
  const fcMeta = opts.calls
    ? {
        protocol: "openai" as const,
        toolCalls: opts.calls.map((c) => ({
          id: c.id,
          tool: c.tool,
          params: c.params || {},
        })),
      }
    : undefined;
  return { ok: true as const, text: opts.text || "", toolCalls, fcMeta };
}

beforeEach(() => {
  mockedFc.mockReset();
  mockedExec.mockReset();
  mockedExec.mockImplementation(async (action: any) => ({
    tool: action.tool,
    ok: true,
    summary: `结果[${JSON.stringify(action.params || {})}]`,
  }));
});

const USER_MSG = [{ role: "user", content: "查一下应用更新明细, 全部和待更新的都要" }];

describe("assistant-agent", () => {
  it("MAX_ROUNDS is 4 for multi-step tool chains", () => {
    expect(MAX_ROUNDS).toBe(4);
  });

  it("续轮继续走 FC (chatWithTools), tool 结果按调用序对齐回注", async () => {
    let call = 0;
    mockedFc.mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return fcOk({
          calls: [
            { id: "c1", tool: "query_apps", params: { filter: "all" } },
            { id: "c2", tool: "query_apps", params: { filter: "pending" } },
          ],
        });
      }
      return fcOk({ text: "汇总:全部 13 个,待更新 2 个" });
    });

    const result = await runAssistantAgent(USER_MSG, {}, {});
    expect(result.ok).toBe(true);
    expect(result.text).toBe("汇总:全部 13 个,待更新 2 个");
    expect(mockedFc).toHaveBeenCalledTimes(2);

    // 第二轮 (续轮) 收到的线程: assistant tool_calls + 两条按位对齐的 tool 消息
    const secondArg: any = mockedFc.mock.calls[1][0];
    const assistantMsg = secondArg.find(
      (m: any) => m.role === "assistant" && Array.isArray(m.tool_calls),
    );
    expect(assistantMsg).toBeTruthy();
    expect(assistantMsg.tool_calls.map((c: any) => c.id)).toEqual(["c1", "c2"]);
    const toolMsgs = secondArg.filter((m: any) => m.role === "tool");
    expect(String(toolMsgs[0].content)).toContain('"filter":"all"');
    expect(String(toolMsgs[1].content)).toContain('"filter":"pending"');
  });

  it("校验被拒的调用得到失败占位, 其余调用照常对齐", async () => {
    let call = 0;
    mockedFc.mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return fcOk({
          calls: [
            { id: "c1", tool: "query_apps", params: { filter: "all" } },
            // 主进程工具 + 非法枚举值 → validateToolCall 拒绝
            { id: "c2", tool: "query_leaderboard", params: { category: "bogus" } },
            { id: "c3", tool: "query_apps", params: { filter: "pending" } },
          ],
        });
      }
      return fcOk({ text: "ok" });
    });

    const result = await runAssistantAgent(USER_MSG, {}, {});
    expect(result.ok).toBe(true);
    expect(mockedExec).toHaveBeenCalledTimes(2); // 非法调用不执行

    const secondArg: any = mockedFc.mock.calls[1][0];
    const toolMsgs = secondArg.filter((m: any) => m.role === "tool");
    expect(toolMsgs).toHaveLength(3);
    expect(String(toolMsgs[0].content)).toContain('"filter":"all"');
    expect(String(toolMsgs[1].content)).toContain("已拒绝执行");
    expect(String(toolMsgs[2].content)).toContain('"filter":"pending"');
  });

  it("末轮执行完工具后收尾, 不把工具结果原文拼进回复", async () => {
    let call = 0;
    mockedFc.mockImplementation(async () => {
      call += 1;
      return fcOk({
        calls: [{ id: `c${call}`, tool: "query_apps", params: { round: call } }],
      });
    });

    const result = await runAssistantAgent(USER_MSG, {}, {});
    expect(result.ok).toBe(true);
    expect(mockedFc).toHaveBeenCalledTimes(MAX_ROUNDS);
    expect(mockedExec).toHaveBeenCalledTimes(MAX_ROUNDS);
    expect(result.toolResults).toHaveLength(MAX_ROUNDS);
    expect(String(result.text)).not.toContain("[工具结果");
    expect(String(result.text)).not.toContain("不可信数据");
    expect(String(result.text)).toContain("已连续执行多轮查询");
  });

  it("续轮无工具调用时正常收尾, toolResults 汇总全部轮次", async () => {
    let call = 0;
    mockedFc.mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return fcOk({
          calls: [{ id: "c1", tool: "query_apps", params: { filter: "all" } }],
        });
      }
      return fcOk({ text: "直接回答, 不再调用工具" });
    });

    const result = await runAssistantAgent(USER_MSG, {}, {});
    expect(result.ok).toBe(true);
    expect(result.text).toBe("直接回答, 不再调用工具");
    expect(result.toolResults).toHaveLength(1);
  });

  it("带图 user 消息按 provider 协议转 content 数组送 LLM", async () => {
    mockedFc.mockImplementation(async () =>
      fcOk({ text: "看到了, 这是截图分析" }),
    );
    const img = "data:image/png;base64,abc";
    const result = await runAssistantAgent(
      [
        {
          role: "user",
          content: "这个截图里是什么?",
          attachments: [{ dataUrl: img }],
        } as any,
      ],
      {},
      {},
    );
    expect(result.ok).toBe(true);

    const firstArg: any = mockedFc.mock.calls[0][0];
    const userMsg = firstArg.find((m: any) => m.role === "user");
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content[0]).toEqual({ type: "text", text: "这个截图里是什么?" });
    expect(userMsg.content[1]).toEqual({
      type: "image_url",
      image_url: { url: img },
    });
  });
});
