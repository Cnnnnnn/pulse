/**
 * tests/config/multi-app-detector-fixes.test.js
 *
 * 2026-06-28 三个 app 的 changelog 修复守护:
 *   1. MiniMax Code: html_changelog section_end 改 next-start 模式 +
 *      detector 排第一 (避开 chain 在 electron_yml 处 stop, 让 html_changelog
 *      跑通拿 markdown 内容).
 *   2. ChatGPT/Codex: 已从 apps 列表移除 (2026-07-12 用户决定取消 Codex 检查),
 *      守护块一并删除 — 不再需要验证它的 detector 顺序.
 *   3. Marvis: 移除坏 html_changelog detector (指向主页, 不是 changelog 页),
 *      release_notes_url 改为主页, 加 bundle_changelog=true 拿 app bundle 内
 *      嵌 release notes (跟 QoderWork 同款).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CONFIG_PATH = path.resolve("config.json");
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

describe("MiniMax Code detector order (config.json)", () => {
  const mm = cfg.apps.find((a) => a.name === "MiniMax Code");
  const html = mm && mm.detectors.find((d) => d.type === "html_changelog");

  it("html_changelog detector 存在", () => {
    expect(html).toBeTruthy();
  });

  it("section_end 是 next-start 模式 ('<h2 ') 切到下个 h2", () => {
    expect(html.section_end).toBe("<h2 ");
  });

  it("html_changelog 是第一个 detector (chain 才能 stop 在它, 拿到 changelog)", () => {
    expect(mm.detectors[0].type).toBe("html_changelog");
  });
});

describe("ChatGPT/Codex 已从 apps 移除 (2026-07-12 用户取消 Codex 检查)", () => {
  it("config.json 中没有 name='ChatGPT' 或 name='Codex' 的 entry", () => {
    expect(cfg.apps.some((a) => a.name === "ChatGPT")).toBe(false);
    expect(cfg.apps.some((a) => a.name === "Codex")).toBe(false);
  });
});

describe("Marvis detector (config.json)", () => {
  const mv = cfg.apps.find((a) => a.name === "Marvis");

  it("没有 html_changelog detector (主页不是 changelog 页, 之前配错)", () => {
    expect(
      mv.detectors.find((d) => d.type === "html_changelog"),
    ).toBeUndefined();
  });

  it("bundle_changelog=true (读 app bundle 内嵌 release notes)", () => {
    expect(mv.bundle_changelog).toBe(true);
  });
});
