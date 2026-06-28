/**
 * tests/config/workbuddy-detector-order.test.js
 *
 * 2026-06-28 回归守护:
 *   WorkBuddy 的 html_changelog detector 必须排在 api_json 前面.
 *   原因: chain 在拿到第一个 high-confidence result 就 stop (detector-chain.js),
 *   workbuddy 的 api_json 返回的 build number (5.1.7.31711488) 不带 changelog
 *   字段, 如果它先跑, user 看到 panel 是空的. 把 html_changelog 排第一, 它
 *   拿到 release version + 完整 changelog 内容, chain 就 stop 在它这.
 *
 * 选最简方案而不是改 chain 的 enrich 行为: 改动跨所有 app, 风险大, 而这里只
 * 是 workbuddy 专属的 detector 字段不齐问题 (其它 app 多数 detector 都同时
 * 返 version + changelog).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CONFIG_PATH = path.resolve("config.json");

describe("WorkBuddy detector order (config.json)", () => {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const wb = raw.apps.find((a) => a.name === "WorkBuddy");

  it("WorkBuddy config 存在", () => {
    expect(wb).toBeTruthy();
  });

  it("html_changelog 是第一个 detector (chain stop 后能拿到 changelog)", () => {
    expect(wb.detectors[0].type).toBe("html_changelog");
  });

  it("html_changelog 用 next-start 模式切 section_end (2026-06-28 修的)", () => {
    const html = wb.detectors.find((d) => d.type === "html_changelog");
    expect(html.section_end).toBe('<h2 id="_');
  });
});
