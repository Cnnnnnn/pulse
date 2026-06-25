/**
 * tests/ai-sessions/provider-cloud-usage.test.js
 *
 * P71 Task 3: CloudSummarizer.summarize 透出 usage (token 消耗).
 * 返回结构从 string 改为 { content, usage }.
 */
import { describe, it, expect, vi } from "vitest";
import { CloudSummarizer } from "../../src/ai-sessions/provider-cloud.js";

function makeHttpClient(body, status = 200) {
  return {
    get: vi.fn(async () => ({ status: 200, body: "{}", headers: {} })),
    post: vi.fn(async () => ({
      status,
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: {},
    })),
  };
}

const CFG = (providerId) => ({
  providerId,
  model: `${providerId}-model`,
  apiKey: "sk-test",
});

const MSGS = [{ role: "user", content: "hi" }];

describe("CloudSummarizer.summarize usage 透出", () => {
  it("OpenAI 协议返回 { content, usage }", async () => {
    const http = makeHttpClient({
      choices: [{ message: { content: "hello" } }],
      usage: { total_tokens: 42, prompt_tokens: 30, completion_tokens: 12 },
    });
    const s = new CloudSummarizer();
    const out = await s.summarize({
      messages: MSGS,
      provider: "openai",
      model: "m",
      config: CFG("openai"),
      httpClient: http,
    });
    expect(out.content).toBe("hello");
    expect(out.usage.total_tokens).toBe(42);
    expect(out.usage.prompt_tokens).toBe(30);
    expect(out.usage.completion_tokens).toBe(12);
  });

  it("Anthropic 协议: input/output_tokens 归一成 total", async () => {
    const http = makeHttpClient({
      content: [{ type: "text", text: "world" }],
      usage: { input_tokens: 20, output_tokens: 8 },
    });
    const s = new CloudSummarizer();
    const out = await s.summarize({
      messages: MSGS,
      provider: "anthropic",
      model: "m",
      config: CFG("anthropic"),
      httpClient: http,
    });
    expect(out.content).toBe("world");
    expect(out.usage.total_tokens).toBe(28);
    expect(out.usage.prompt_tokens).toBe(20);
    expect(out.usage.completion_tokens).toBe(8);
  });

  it("无 usage 字段时 usage=null (不崩)", async () => {
    const http = makeHttpClient({
      choices: [{ message: { content: "x" } }],
    });
    const s = new CloudSummarizer();
    const out = await s.summarize({
      messages: MSGS,
      provider: "openai",
      model: "m",
      config: CFG("openai"),
      httpClient: http,
    });
    expect(out.content).toBe("x");
    expect(out.usage).toBeNull();
  });

  it("usage 部分缺失字段: 仅记存在的", async () => {
    const http = makeHttpClient({
      choices: [{ message: { content: "y" } }],
      usage: { total_tokens: 5 }, // 缺 prompt/completion
    });
    const s = new CloudSummarizer();
    const out = await s.summarize({
      messages: MSGS,
      provider: "openai",
      model: "m",
      config: CFG("openai"),
      httpClient: http,
    });
    expect(out.usage.total_tokens).toBe(5);
    expect(out.usage.prompt_tokens).toBeNull();
    expect(out.usage.completion_tokens).toBeNull();
  });
});
