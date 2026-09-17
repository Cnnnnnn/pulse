import { createServer } from "node:http";
import { expect, it, vi } from "vitest";
import { chatWithTools } from "../../src/ai/chat-with-tools";
import { resetLlmBreaker, isLlmOpen } from "../../src/ai/llm-circuit-breaker";

const config = vi.hoisted(() => ({ baseUrl: "" }));
vi.mock("../../src/ai/shared-llm", () => ({
  resolveSharedAiConfig: () => ({ ok: true, providerId: "openai", model: "gpt-4o", config: { apiKey: "test", baseUrl: config.baseUrl } }),
  isBudgetBlocked: () => false,
  resolveLlmTimeoutMs: () => 100,
  extractUsageTotalTokens: () => 0,
  recordTokenSpend: vi.fn(),
}));
vi.mock("../../src/ai/llm-telemetry", () => ({ recordLlmCall: vi.fn(), recordLlmOutcome: vi.fn() }));

it("非流式 FC 取消会关闭挂起连接，不重试也不触发熔断", async () => {
  resetLlmBreaker();
  let requests = 0;
  let arrived!: () => void;
  let cancel: (() => void) | undefined;
  const received = new Promise<void>((resolve) => { arrived = resolve; });
  const server = createServer(() => { requests++; arrived(); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  config.baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const pending = chatWithTools([{ role: "user", content: "hello" }], {
      onAbortRegister: (fn) => { cancel = fn; },
    });
    await received;
    cancel?.();
    expect(await pending).toMatchObject({ ok: false, reason: "cancelled" });
    expect(requests).toBe(1);
    expect(isLlmOpen("openai")).toBe(false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetLlmBreaker();
  }
});
