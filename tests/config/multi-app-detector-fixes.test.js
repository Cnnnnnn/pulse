/**
 * tests/config/multi-app-detector-fixes.test.js
 *
 * 2026-06-28 三个 app 的 changelog 修复守护:
 *   1. MiniMax Code: html_changelog section_end 改 next-start 模式 +
 *      detector 排第一 (避开 chain 在 electron_yml 处 stop, 让 html_changelog
 *      跑通拿 markdown 内容).
 *   2. ChatGPT: 重新加回 config (2026-07-12, 之前误用 Codex URL 一直检测失败;
 *      改用 sidekick/public/sparkle_public_appcast.xml). Codex (跟 ChatGPT 命名
 *      无关的独立 entry) 已从 apps 移除 — 用户只要 CodexBar, 不要 Codex.
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

describe("ChatGPT detector (config.json) — 2026-07-12 改用真正的 sidekick sparkle URL", () => {
  const cg = cfg.apps.find((a) => a.name === "ChatGPT");
  const sp = cg && cg.detectors.find((d) => d.type === "sparkle_appcast");

  it("ChatGPT entry 存在 (用真正的 sparkle URL, 不用 Codex 的 codex-app-prod/appcast.xml)", () => {
    expect(cg).toBeTruthy();
    expect(sp && sp.url).toBe(
      "https://persistent.oaistatic.com/sidekick/public/sparkle_public_appcast.xml",
    );
  });

  it("没有 name='Codex' 的 entry (CodexBar 是独立 app, Codex 已取消)", () => {
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
