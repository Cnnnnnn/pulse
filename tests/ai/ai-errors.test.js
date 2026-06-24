/**
 * tests/ai/ai-errors.test.js
 */

import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { humanizeAiError, REASON_LABELS } = require("../../src/ai/ai-errors.js");

describe("humanizeAiError", () => {
  it("命中 reason 字典", () => {
    expect(humanizeAiError("api_key_missing").label).toBe(REASON_LABELS.api_key_missing);
    expect(humanizeAiError("llm_failed").label).toContain("AI 服务");
    expect(humanizeAiError("timeout").label).toContain("超时");
    expect(humanizeAiError("parse_failed").label).toContain("解析");
    expect(humanizeAiError("app_not_found").label).toContain("刷新");
    expect(humanizeAiError("no_update").label).toContain("没有");
  });

  it("reason 未命中 → 透传 errorMessage 截断", () => {
    const e = humanizeAiError("weird_reason", "ECONNREFUSED 127.0.0.1:443 some long text");
    expect(e.raw).toBe("weird_reason");
    expect(e.label.length).toBeLessThanOrEqual(60);
    expect(e.label).toContain("ECONNREFUSED");
  });

  it("reason + errorMessage 同时给 → 优先字典", () => {
    const e = humanizeAiError("timeout", "should be ignored");
    expect(e.label).toBe(REASON_LABELS.timeout);
  });

  it("无 reason + 无 errorMessage → 未知错误", () => {
    const e = humanizeAiError(undefined);
    expect(e.label).toBe("未知错误");
    expect(e.raw).toBe("unknown");
  });

  it("hint 仅字典项有", () => {
    expect(humanizeAiError("timeout").hint).toBe("重试");
    expect(humanizeAiError("api_key_missing").hint).toBe("去 AI 配置");
    expect(humanizeAiError("weird_reason").hint).toBeNull();
  });
});
