/**
 * tests/main/twitter-serenity/manual-paste-parser.test.js
 *
 * Task 8: 降级路径手动粘贴解析. 3 类输入: X URL / Nitter URL / 纯文本.
 */

import { describe, it, expect } from "vitest";
import {
  parseManualPaste,
  parseLine,
} from "../../../src/main/twitter-serenity/manual-paste-parser.js";

describe("manual-paste-parser", () => {
  it("X URL 解析出 handle + id", () => {
    const r = parseManualPaste(
      "https://x.com/aleabitoreddit/status/1748291000000000001",
    );
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(1);
    expect(r.results[0].id).toBe("1748291000000000001");
    expect(r.results[0].author.handle).toBe("aleabitoreddit");
    expect(r.results[0].sourceMirror).toBe("manual-paste");
    expect(r.errors).toHaveLength(0);
  });

  it("twitter.com URL 也识别", () => {
    const r = parseManualPaste("https://twitter.com/foo/status/999");
    expect(r.results[0].id).toBe("999");
    expect(r.results[0].author.handle).toBe("foo");
  });

  it("Nitter URL 解析", () => {
    const r = parseManualPaste("https://twiiit.com/aleabitoreddit/status/888");
    expect(r.results[0].id).toBe("888");
    expect(r.results[0].author.handle).toBe("aleabitoreddit");
  });

  it("纯文本生成 manual- 前缀 id + handle=unknown", () => {
    const r = parseManualPaste("just some text without url");
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(1);
    expect(r.results[0].id).toMatch(/^manual-/);
    expect(r.results[0].author.handle).toBe("unknown");
    expect(r.results[0].text).toBe("just some text without url");
  });

  it("多行混合解析, 每行独立", () => {
    const input = [
      "https://x.com/h/status/1",
      "this is plain text line",
      "https://twiiit.com/h/status/2",
    ].join("\n");
    const r = parseManualPaste(input);
    expect(r.results).toHaveLength(3);
    expect(r.results[0].id).toBe("1");
    expect(r.results[1].author.handle).toBe("unknown");
    expect(r.results[2].id).toBe("2");
  });

  it("空行被跳过", () => {
    const r = parseManualPaste("https://x.com/h/status/1\n\n\nhttps://x.com/h/status/2");
    expect(r.results).toHaveLength(2);
  });

  it("空输入返回 ok=true, results 空", () => {
    expect(parseManualPaste("")).toEqual({ ok: true, results: [], errors: [] });
  });

  it("null/undefined/非字符串容错", () => {
    expect(parseManualPaste(null).results).toEqual([]);
    expect(parseManualPaste(undefined).results).toEqual([]);
    expect(parseManualPaste(123).results).toEqual([]);
  });

  it("parseLine 导出可独立调用", () => {
    expect(parseLine("https://x.com/h/status/5").id).toBe("5");
    expect(parseLine("")).toBeNull();
  });

  it("相同纯文本生成稳定 id (sha1)", () => {
    const r1 = parseManualPaste("same text");
    const r2 = parseManualPaste("same text");
    expect(r1.results[0].id).toBe(r2.results[0].id);
  });
});
