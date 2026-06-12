/**
 * tests/ai/sanitize-llm-output.test.js
 */

import { describe, it, expect } from "vitest";
import { sanitizeLlmOutput } from "../../src/ai/sanitize-llm-output.js";

const THINK_OPEN = "<" + "think" + ">";
const THINK_CLOSE = "<" + "/" + "think" + ">";

describe("sanitizeLlmOutput", () => {
  it("去掉思考链，保留中文正文", () => {
    const raw =
      THINK_OPEN +
      "The user wants a summary in English..." +
      THINK_CLOSE +
      "\n\n墨西哥 2-0 击败南非，主队掌控全场。";
    const out = sanitizeLlmOutput(raw);
    expect(out).toContain("墨西哥");
    expect(out).not.toContain("The user wants");
  });

  it("纯英文思考链无正文时返回提示", () => {
    const raw =
      THINK_OPEN + "Only English reasoning here without CJK." + THINK_CLOSE;
    const out = sanitizeLlmOutput(raw);
    expect(out).toContain("重新总结");
  });
});
