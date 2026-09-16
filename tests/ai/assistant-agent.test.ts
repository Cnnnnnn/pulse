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
    // 受控监控名单 — 供 upgrade_app 的 guard 校验
    listMonitoredApps: vi.fn(() => ["WeChat"]),
  };
});

import { MAX_ROUNDS, runAssistantAgent } from "../../src/ai/assistant-agent.ts";
import { chatWithTools } from "../../src/ai/chat-with-tools.ts";
import { executeMainTool } from "../../src/ai/assistant-tools.ts";
import { TOOL_POLICY } from "../../src/shared/assistant-tool-policy.ts";
import { DEFAULT_BUDGET } from "../../src/ai/assistant-budget.ts";

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
  it("MAX_ROUNDS 自 DEFAULT_BUDGET.maxRounds 派生（Step 5 起为 8）", () => {
    expect(MAX_ROUNDS).toBe(DEFAULT_BUDGET.maxRounds);
    expect(MAX_ROUNDS).toBe(8);
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

  it("策略拒绝的主进程工具不执行, 其余照常; 拒绝理由以失败占位回注", async () => {
    const original = TOOL_POLICY.query_apps.risk;
    TOOL_POLICY.query_apps.risk = "deny";
    try {
      let call = 0;
      mockedFc.mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return fcOk({
            calls: [
              { id: "c1", tool: "query_apps" },
              { id: "c2", tool: "query_funds" },
            ],
          });
        }
        return fcOk({ text: "ok" });
      });

      const result = await runAssistantAgent(USER_MSG, {}, {});
      expect(result.ok).toBe(true);
      // 被策略拒绝的不执行, 放行的照常
      expect(mockedExec).toHaveBeenCalledTimes(1);
      expect((mockedExec.mock.calls[0][0] as any).tool).toBe("query_funds");

      // 拒绝理由按位回注, 数量与 fc 调用数一致
      const secondArg: any = mockedFc.mock.calls[1][0];
      const toolMsgs = secondArg.filter((m: any) => m.role === "tool");
      expect(toolMsgs).toHaveLength(2);
      expect(String(toolMsgs[0].content)).toContain("工具被策略拒绝");
      expect(String(toolMsgs[1].content)).toContain("query_funds");
    } finally {
      TOOL_POLICY.query_apps.risk = original;
    }
  });

  it("策略拒绝的渲染层动作不出现在 actions 中", async () => {
    const original = TOOL_POLICY.refresh_concerts.risk;
    TOOL_POLICY.refresh_concerts.risk = "deny";
    try {
      mockedFc.mockImplementation(async () =>
        fcOk({
          calls: [
            { id: "c1", tool: "refresh_concerts" },
            { id: "c2", tool: "open_settings", params: { tab: "ai" } },
          ],
        }),
      );

      const result = await runAssistantAgent(USER_MSG, {}, {});
      expect(result.ok).toBe(true);
      const tools = (result.actions || []).map((a) => a.tool);
      expect(tools).not.toContain("refresh_concerts");
      expect(tools).toContain("open_settings");
    } finally {
      TOOL_POLICY.refresh_concerts.risk = original;
    }
  });

  it("upgrade_app 目标不在监控名单时被拒（guard 生效）", async () => {
    mockedFc.mockImplementation(async () =>
      fcOk({
        calls: [
          { id: "c1", tool: "upgrade_app", params: { appName: "不存在的应用" } },
          { id: "c2", tool: "upgrade_app", params: { appName: "WeChat" } },
        ],
      }),
    );

    const result = await runAssistantAgent(USER_MSG, {}, {});
    expect(result.ok).toBe(true);
    const names = (result.actions || [])
      .filter((a) => a.tool === "upgrade_app")
      .map((a) => (a.params as { appName?: string }).appName);
    // 名单外的被 guard 拦下，名单内的保留
    expect(names).toEqual(["WeChat"]);
  });
});

describe("assistant-agent — 预算驱动终止", () => {
  it("注入 maxRounds=2 时只跑 2 轮（不再受固定 4 轮约束）", async () => {
    let call = 0;
    mockedFc.mockImplementation(async () => {
      call += 1;
      return fcOk({ calls: [{ id: `c${call}`, tool: "query_apps" }] });
    });

    const result = await runAssistantAgent(USER_MSG, {}, {
      budget: { ...DEFAULT_BUDGET, maxRounds: 2 },
    });

    expect(result.ok).toBe(true);
    expect(mockedExec).toHaveBeenCalledTimes(2);
    expect(result.toolResults).toHaveLength(2);
  });

  it("maxToolCalls 达上限即收尾，且按发起的调用数计费", async () => {
    mockedFc.mockImplementation(async () =>
      fcOk({
        calls: [
          { id: "c1", tool: "query_apps" },
          { id: "c2", tool: "query_apps" },
        ],
      }),
    );

    const result = await runAssistantAgent(USER_MSG, {}, {
      budget: { ...DEFAULT_BUDGET, maxRounds: 100, maxToolCalls: 4 },
    });

    expect(result.ok).toBe(true);
    // 第 1 轮 2 个 + 第 2 轮 2 个 = 4 到上限 → 第 2 轮尾部收尾
    expect(mockedExec).toHaveBeenCalledTimes(4);
    expect(result.toolResults).toHaveLength(4);
  });

  it("elapsed 超限为硬终止：一次 LLM 都不调", async () => {
    mockedFc.mockImplementation(async () => fcOk({ text: "不应被调用" }));

    const result = await runAssistantAgent(USER_MSG, {}, {
      budget: { ...DEFAULT_BUDGET, maxElapsedMs: 0 },
    });

    expect(result.ok).toBe(true);
    expect(mockedFc).not.toHaveBeenCalled();
    expect(mockedExec).not.toHaveBeenCalled();
  });

  it("token 达上限即收尾（usage 回传生效）", async () => {
    mockedFc.mockImplementation(async () => ({
      ...fcOk({ calls: [{ id: "c1", tool: "query_apps" }] }),
      totalTokens: 5_000,
    }));

    const result = await runAssistantAgent(USER_MSG, {}, {
      budget: { ...DEFAULT_BUDGET, maxRounds: 100, maxTokens: 10_000 },
    });

    expect(result.ok).toBe(true);
    // 每轮 5000 → 第 2 轮后累计 10000 达上限 → 收尾
    expect(mockedExec).toHaveBeenCalledTimes(2);
    expect(result.toolResults).toHaveLength(2);
  });

  it("provider 未回传 totalTokens 时不误判 token 耗尽", async () => {
    mockedFc.mockImplementation(async () =>
      fcOk({ calls: [{ id: "c1", tool: "query_apps" }] }),
    );

    const result = await runAssistantAgent(USER_MSG, {}, {
      budget: { ...DEFAULT_BUDGET, maxRounds: 3, maxTokens: 1 },
    });

    // 拿不到 usage → token 维度不生效 → 仍跑满 3 轮
    expect(mockedExec).toHaveBeenCalledTimes(3);
  });

  it("默认预算下轮数上限为 8 轮", async () => {
    let call = 0;
    mockedFc.mockImplementation(async () => {
      call += 1;
      return fcOk({ calls: [{ id: `c${call}`, tool: "query_apps" }] });
    });

    const result = await runAssistantAgent(USER_MSG, {}, {});

    expect(mockedExec).toHaveBeenCalledTimes(DEFAULT_BUDGET.maxRounds);
    expect(result.toolResults).toHaveLength(DEFAULT_BUDGET.maxRounds);
  });
});

describe("assistant-agent — 工具调用审计", () => {
  it("ok / failed / denied 三种 outcome 都被记录", async () => {
    const audit = vi.fn();
    mockedFc.mockImplementation(async () =>
      fcOk({
        calls: [
          { id: "c1", tool: "query_apps" }, // 执行成功
          { id: "c2", tool: "query_funds" }, // 执行失败
          { id: "c3", tool: "not_a_real_tool" }, // 结构校验拒绝
        ],
      }),
    );
    mockedExec.mockImplementation(async (action: any) => ({
      tool: action.tool,
      ok: action.tool === "query_apps",
      summary: action.tool === "query_apps" ? "ok" : "boom",
    }));

    await runAssistantAgent(USER_MSG, {}, { onAudit: audit });

    const byTool = Object.fromEntries(
      audit.mock.calls.map((c) => [(c[0] as any).tool, c[0] as any]),
    );

    expect(byTool.query_apps.outcome).toBe("ok");
    expect(byTool.query_apps.execution).toBe("main");
    expect(typeof byTool.query_apps.durationMs).toBe("number");

    expect(byTool.query_funds.outcome).toBe("failed");
    expect(byTool.query_funds.reason).toBe("boom");

    // 未知工具经 splitActions 归入 renderer 域后被拒绝
    expect(byTool.not_a_real_tool.outcome).toBe("denied");
    expect(byTool.not_a_real_tool.execution).toBe("renderer");
    expect(String(byTool.not_a_real_tool.reason)).toContain("调用不合法");
  });

  it("不注入 onAudit 时静默跳过（审计为可选依赖）", async () => {
    mockedFc.mockImplementation(async () =>
      fcOk({ calls: [{ id: "c1", tool: "query_apps" }] }),
    );
    await expect(runAssistantAgent(USER_MSG, {}, {})).resolves.toBeTruthy();
  });

  it("onAudit 抛错时不影响工具执行结果", async () => {
    let call = 0;
    mockedFc.mockImplementation(async () => {
      call += 1;
      if (call === 1) return fcOk({ calls: [{ id: "c1", tool: "query_apps" }] });
      return fcOk({ text: "done" });
    });
    const audit = vi.fn(() => {
      throw new Error("audit boom");
    });

    const result = await runAssistantAgent(USER_MSG, {}, { onAudit: audit });

    expect(result.ok).toBe(true);
    expect(result.toolResults).toHaveLength(1);
  });
});

describe("assistant-agent — 单轮并发上限", () => {
  it("超上限的调用得到明确「未执行」结果，而非静默丢弃/伪装成无数据", async () => {
    // 单轮 8 个调用，源码 MAX_PARALLEL_TOOLS = 6（若该上限调整，此用例会失败以提醒同步）
    const calls = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i + 1}`,
      tool: "query_apps",
    }));
    let fc = 0;
    mockedFc.mockImplementation(async () => {
      fc += 1;
      if (fc === 1) return fcOk({ calls });
      return fcOk({ text: "done" });
    });

    const result = await runAssistantAgent(USER_MSG, {}, {});

    // 只有前 6 个真正执行
    expect(mockedExec).toHaveBeenCalledTimes(6);
    // 结果与调用数等长：多出的 2 个是明确的「未执行」占位（保证按位对齐不错位）
    expect(result.toolResults).toHaveLength(8);
    const notExecuted = result.toolResults!.filter((t) =>
      String(t.summary).includes("并发上限"),
    );
    expect(notExecuted).toHaveLength(2);
    expect(notExecuted.every((t) => String(t.summary).includes("请下一轮重试"))).toBe(true);
  });

  it("未超上限时结果数与调用数一致，且无「未执行」占位", async () => {
    let fc = 0;
    mockedFc.mockImplementation(async () => {
      fc += 1;
      if (fc === 1) {
        return fcOk({
          calls: [
            { id: "c1", tool: "query_apps" },
            { id: "c2", tool: "query_funds" },
          ],
        });
      }
      return fcOk({ text: "done" });
    });

    const result = await runAssistantAgent(USER_MSG, {}, {});

    expect(mockedExec).toHaveBeenCalledTimes(2);
    expect(result.toolResults).toHaveLength(2);
    expect(
      result.toolResults!.some((t) => String(t.summary).includes("并发上限")),
    ).toBe(false);
  });
});
