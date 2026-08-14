// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");

const { fetchJson } = requireMain("ai-leaderboard/normalize");

afterEach(() => {
  vi.unstubAllGlobals();
});
describe("ai-leaderboard fetchJson", () => {
  it("transient 5xx 后有限重试并返回成功响应", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) return { ok: false, status: 503 };
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }),
    );

    await expect(fetchJson("https://example.test/models", { retryDelayMs: 0 })).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it("认证类 4xx 不重试，保留带 URL 的错误原因", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJson("https://example.test/private", { retryDelayMs: 0 })).rejects.toThrow(
      "HTTP 401 for https://example.test/private",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
