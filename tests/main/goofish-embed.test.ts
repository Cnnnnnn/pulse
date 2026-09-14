/**
 * tests/main/goofish-embed.test.ts
 *
 * 闲鱼未读标题解析 — 系统通知依赖 "(N)" 前缀。
 */
import { describe, it, expect } from "vitest";
const { requireMain } = require("../_setup/require-main.cjs");

const { parseUnreadFromTitle } = requireMain("goofish-embed");

describe("parseUnreadFromTitle", () => {
  it("解析半角/全角/方括号前缀", () => {
    expect(parseUnreadFromTitle("(2) 闲鱼")).toBe(2);
    expect(parseUnreadFromTitle("（3）闲鱼 - 首页")).toBe(3);
    expect(parseUnreadFromTitle("【1】闲鱼")).toBe(1);
  });

  it("无前缀或空 → 0", () => {
    expect(parseUnreadFromTitle("闲鱼")).toBe(0);
    expect(parseUnreadFromTitle("")).toBe(0);
    expect(parseUnreadFromTitle(null)).toBe(0);
  });
});
