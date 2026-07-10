/**
 * tests/config/multi-app-detector-fixes.test.js
 *
 * 2026-06-28 三个 app 的 changelog 修复守护:
 *   1. MiniMax Code: html_changelog section_end 改 next-start 模式 +
 *      detector 排第一 (避开 chain 在 electron_yml 处 stop, 让 html_changelog
 *      跑通拿 markdown 内容).
 *   2. ChatGPT (原 Codex, OpenAI 改名): 加 rss_changelog detector (enrich_only)
 *      排第一, sparkle_appcast 排后拿版本号; 两者通过 enrich_only 合并,
 *      拿 version + markdown.
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

describe("ChatGPT (原 Codex) detector (config.json)", () => {
  const cx = cfg.apps.find((a) => a.name === "ChatGPT");
  const rss = cx && cx.detectors.find((d) => d.type === "rss_changelog");
  const sparkle = cx && cx.detectors.find((d) => d.type === "sparkle_appcast");

  it("rss_changelog detector 存在, 配 enrich_only=true", () => {
    expect(rss).toBeTruthy();
    expect(rss.enrich_only).toBe(true);
  });

  it("rss_changelog 排第一, sparkle_appcast 排后 (enrich_only 必须先跑)", () => {
    expect(cx.detectors[0].type).toBe("rss_changelog");
    const sparkleIdx = cx.detectors.findIndex(
      (d) => d.type === "sparkle_appcast",
    );
    expect(sparkleIdx).toBeGreaterThan(0);
  });

  it("release_notes_url 指向 developers.openai.com/codex/changelog", () => {
    expect(cx.release_notes_url).toBe(
      "https://developers.openai.com/codex/changelog",
    );
  });

  it("bundle 改为 ChatGPT.app (OpenAI 改名 Codex→ChatGPT, sparkle feed URL 不变)", () => {
    expect(cx.bundle).toBe("ChatGPT.app");
    // sparkle feed 仍是旧 codex-app-prod URL (OpenAI 没换, 仍 200 可用)
    expect(sparkle.url).toBe(
      "https://persistent.oaistatic.com/codex-app-prod/appcast.xml",
    );
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
