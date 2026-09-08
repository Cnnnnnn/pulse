/**
 * tests/ai-leaderboard/fetcher-livebench.test.ts
 *
 * LiveBench fetcher 解析层单测（无网络）。
 * 背景：旧实现锚定压缩产物里的具体变量名 `const pe=[...]`，官方每次重新 build
 * 都可能换名导致静默挂。加固后的 parseReleaseDates 只依赖「赋值数组 + 纯 ISO 日期」
 * 形态，parseMainJsPath 兼容 hash 形态变化。样例取自 2026-09 真实 bundle 片段。
 */

// @vitest-environment node

import { describe, it, expect } from "vitest";
import {
  parseMainJsPath,
  parseReleaseDates,
} from "../../src/main/ai-leaderboard/fetcher-livebench.ts";

describe("parseMainJsPath", () => {
  it("标准 CRA index.html（hex 短 hash）", () => {
    const html = '<script src="/static/js/main.fd24a6cf.js" defer></script>';
    expect(parseMainJsPath(html)).toBe("/static/js/main.fd24a6cf.js");
  });

  it("hash 形态变化（长哈希 / 含下划线连字符）也能命中", () => {
    expect(parseMainJsPath('<script src="/static/js/main.a1B2c3d4e5f6g7.js"></script>'))
      .toBe("/static/js/main.a1B2c3d4e5f6g7.js");
    expect(parseMainJsPath('<script src="/static/js/main.abc_def.js" crossorigin></script>'))
      .toBe("/static/js/main.abc_def.js");
  });

  it("无 main.js → null", () => {
    expect(parseMainJsPath("<html><body>404</body></html>")).toBeNull();
  });
});

describe("parseReleaseDates", () => {
  const REAL_SHAPE =
    'pe=["2024-06-24","2024-07-26","2024-08-31","2024-11-25","2025-04-02","2025-04-25","2025-05-30","2025-11-25","2025-12-23","2026-01-08","2026-06-25"]';

  it("真实 bundle 形态（const pe=[...]）→ 全部日期", () => {
    expect(parseReleaseDates(REAL_SHAPE)).toHaveLength(11);
    expect(parseReleaseDates(REAL_SHAPE)[0]).toBe("2024-06-24");
  });

  it("压缩器换变量名后仍然命中（去变量名依赖的核心断言）", () => {
    const renamed = 'const Xt=["2025-01-08","2026-03-01"];';
    expect(parseReleaseDates(renamed)).toEqual(["2025-01-08", "2026-03-01"]);
    const dollar = '_$9=["2026-06-25"]';
    expect(parseReleaseDates(dollar)).toEqual(["2026-06-25"]);
  });

  it("乱序输入 → 升序排序（不信任 build 顺序）", () => {
    const shuffled = 'q=["2026-06-25","2024-06-24","2025-05-30"]';
    expect(parseReleaseDates(shuffled)).toEqual(["2024-06-24", "2025-05-30", "2026-06-25"]);
  });

  it("多个日期数组 → 取最长（release 全列表是最大的纯日期数组）", () => {
    const bundle = 'a=["2026-01-01"];b=["2026-01-01","2026-02-02","2026-03-03","2026-04-04"]';
    expect(parseReleaseDates(bundle)).toEqual(["2026-01-01", "2026-02-02", "2026-03-03", "2026-04-04"]);
  });

  it("混入非日期内容不误报；无日期数组 → 空", () => {
    expect(parseReleaseDates('v=["not-a-date","2026-13-99"]')).toEqual([]);
    expect(parseReleaseDates("var x=1;")).toEqual([]);
  });
});
