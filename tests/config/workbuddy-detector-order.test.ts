/**
 * tests/config/workbuddy-detector-order.test.js
 *
 * 回归守护: WorkBuddy 的版本号必须以 api_json (官方更新接口) 为准,
 * html_changelog 只负责拿 changelog 正文 (enrich_only), 否则会出现
 * "本机 5.2.5 > changelog 页 5.2.3 → 误判预发布" 的问题 (2026-07-10).
 *
 * 历史: 2026-06-28 初版让 html_changelog 排第一拿版本号 + changelog 再短路
 * 停, 是因为当时 chain 的 enrich 合并 (C9) 还没落地. 现在 mergeEnrich 已成熟
 * (Codex 同款用法), 改用 enrich_only: html_changelog 先跑拿 markdown 正文 →
 * api_json 后跑拿权威版本号 → mergeEnrich 合并. 这样 changelog 文档页滞后
 * (停在 5.2.3 而真实最新 5.2.5) 不再影响版本判定.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CONFIG_PATH = path.resolve("config.json");

describe("WorkBuddy detector order (config.json)", () => {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const wb = raw.apps.find((a) => a.name === "WorkBuddy");
  const html = wb && wb.detectors.find((d) => d.type === "html_changelog");
  const api = wb && wb.detectors.find((d) => d.type === "api_json");

  it("WorkBuddy config 存在", () => {
    expect(wb).toBeTruthy();
  });

  it("html_changelog 标 enrich_only=true (只拿 changelog 正文, 不抢版本号)", () => {
    expect(html).toBeTruthy();
    expect(html.enrich_only).toBe(true);
  });

  it("html_changelog 排在 api_json 前面 (enrich detector 必须先跑)", () => {
    expect(wb.detectors.indexOf(html)).toBeLessThan(wb.detectors.indexOf(api));
  });

  it("html_changelog 用 next-start 模式切 section_end (2026-06-28 修的)", () => {
    expect(html.section_end).toBe('<h2 id="_');
  });
});

